package com.eduardoperez.despertador

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Servicio en primer plano (tipo mediaPlayback) que hace sonar la alarma hasta que el usuario
 * la detenga o la posponga. El estado «sonando» se guarda en AlarmStore para poder reanudarse
 * si Android mata el proceso.
 */
class AlarmService : Service() {
    private val tag = "Despertador"
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var focus: AudioFocusRequest? = null
    private var current: Alarm? = null
    private var fallbackStage = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val store = AlarmStore.get(this)
        when (intent?.action) {
            ACTION_RING -> ring(intent.getIntExtra(AlarmScheduler.EXTRA_ID, 0))
            ACTION_SNOOZE -> snooze()
            ACTION_DISMISS -> dismiss()
            else -> { // reinicio pegajoso tras la muerte del proceso
                val id = store.ringingId
                if (id != 0 && store.get(id) != null) ring(id) else stopSelf()
            }
        }
        return START_STICKY
    }

    private fun ring(id: Int) {
        val store = AlarmStore.get(this)
        val alarm = store.get(id)
        if (alarm == null) { stopSelf(); return }
        val previous = store.ringingId
        if (previous != 0 && previous != id) autoSnooze(previous) // una alarma nueva sustituye a la anterior
        store.ringingId = id
        current = alarm

        val notification = Notifications.ringing(this, alarm)
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(Notifications.ID_RINGING, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else startForeground(Notifications.ID_RINGING, notification)
        } catch (e: Exception) {
            Log.e(tag, "No se pudo pasar a primer plano", e)
        }

        if (wakeLock?.isHeld != true) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "despertador:sonando").apply { acquire(6 * 3600_000L) }
        }
        raiseVolumeIfMuted()
        startSound(alarm)
        startVibration(alarm)
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, 4000)
        try { // En algunas versiones se permite abrir la pantalla directamente; si no, la abre la notificación.
            startActivity(Intent(this, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) { }
        sendBroadcast(Intent(ACTION_RINGING_CHANGED).setPackage(packageName))
    }

    /** Si el volumen de alarmas está a 0 la alarma sería muda: se sube a un nivel audible. */
    private fun raiseVolumeIfMuted() {
        val am = getSystemService(AudioManager::class.java)
        try {
            if (am.getStreamVolume(AudioManager.STREAM_ALARM) == 0) {
                am.setStreamVolume(AudioManager.STREAM_ALARM, (am.getStreamMaxVolume(AudioManager.STREAM_ALARM) * 0.6).toInt().coerceAtLeast(1), 0)
            }
        } catch (e: Exception) { Log.w(tag, "No se pudo ajustar el volumen", e) }
    }

    private val audioAttrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()

    private fun startSound(alarm: Alarm) {
        stopSound()
        fallbackStage = 0
        playStage(alarm)
    }

    /** Etapa 0: tono incluido en la app. Etapa 1: alarma por defecto del sistema. Etapa 2: tono de llamada. */
    private fun playStage(alarm: Alarm) {
        val am = getSystemService(AudioManager::class.java)
        if (focus == null) {
            focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(audioAttrs).setOnAudioFocusChangeListener { }.build()
            am.requestAudioFocus(focus!!)
        }
        try {
            val mp = MediaPlayer()
            mp.setAudioAttributes(audioAttrs)
            when (fallbackStage) {
                0 -> resources.openRawResourceFd(Sounds.byId(alarm.soundId).rawRes).use {
                    mp.setDataSource(it.fileDescriptor, it.startOffset, it.length)
                }
                1 -> mp.setDataSource(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                else -> mp.setDataSource(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
            }
            mp.isLooping = true
            val v = alarm.volume / 100f
            mp.setVolume(v, v)
            mp.setOnErrorListener { _, what, extra ->
                Log.e(tag, "Error de MediaPlayer $what/$extra (etapa $fallbackStage)")
                nextFallback(alarm); true
            }
            mp.prepare()
            mp.start()
            player = mp
        } catch (e: Exception) {
            Log.e(tag, "No se pudo reproducir (etapa $fallbackStage)", e)
            nextFallback(alarm)
        }
    }

    private fun nextFallback(alarm: Alarm) {
        try { player?.release() } catch (_: Exception) { }
        player = null
        if (fallbackStage < 2) { fallbackStage++; playStage(alarm) }
    }

    private fun stopSound() {
        try { player?.stop() } catch (_: Exception) { }
        try { player?.release() } catch (_: Exception) { }
        player = null
        focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
        focus = null
    }

    /** Comprueba cada pocos segundos que el sonido sigue activo (p. ej. si otra app lo interrumpe) y lo reinicia. */
    private val watchdog = object : Runnable {
        override fun run() {
            val a = current ?: return
            val p = player
            val playing = try { p?.isPlaying == true } catch (_: Exception) { false }
            if (!playing) { Log.w(tag, "Sonido detenido; reiniciando"); startSound(a) }
            handler.postDelayed(this, 4000)
        }
    }

    private fun vibrator(): Vibrator = if (Build.VERSION.SDK_INT >= 31)
        getSystemService(VibratorManager::class.java).defaultVibrator else @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)

    @Suppress("DEPRECATION")
    private fun startVibration(alarm: Alarm) {
        if (!alarm.vibrate) return
        try {
            vibrator().vibrate(VibrationEffect.createWaveform(longArrayOf(0, 700, 500, 700, 1200), 0), audioAttrs)
        } catch (e: Exception) { Log.w(tag, "Vibración no disponible", e) }
    }

    private fun postpone(alarm: Alarm): Long {
        val until = System.currentTimeMillis() + alarm.snoozeMinutes * 60_000L
        if (alarm.id == Alarm.TEST_ID) {
            AlarmScheduler.scheduleAt(this, alarm.id, until)
        } else {
            val updated = AlarmStore.get(this).update(alarm.id) { it.copy(snoozeUntil = until) }
            if (updated != null) AlarmScheduler.schedule(this, updated)
        }
        Notifications.snoozed(this, alarm, until)
        return until
    }

    private fun autoSnooze(id: Int) { AlarmStore.get(this).get(id)?.let { postpone(it) } }

    private fun snooze() {
        val a = current ?: AlarmStore.get(this).let { s -> s.get(s.ringingId) }
        if (a != null) postpone(a)
        finishRinging()
    }

    private fun dismiss() {
        val store = AlarmStore.get(this)
        val id = store.ringingId
        if (id != 0) Notifications.clearSnoozed(this, id)
        finishRinging()
    }

    private fun finishRinging() {
        handler.removeCallbacks(watchdog)
        current = null
        stopSound()
        try { vibrator().cancel() } catch (_: Exception) { }
        if (wakeLock?.isHeld == true) wakeLock?.release()
        wakeLock = null
        AlarmStore.get(this).ringingId = 0
        sendBroadcast(Intent(ACTION_RINGING_CHANGED).setPackage(packageName))
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(watchdog)
        stopSound()
        try { vibrator().cancel() } catch (_: Exception) { }
        if (wakeLock?.isHeld == true) wakeLock?.release()
        super.onDestroy()
    }

    companion object {
        const val ACTION_RING = "com.eduardoperez.despertador.RING"
        const val ACTION_SNOOZE = "com.eduardoperez.despertador.SNOOZE"
        const val ACTION_DISMISS = "com.eduardoperez.despertador.DISMISS"
        const val ACTION_RINGING_CHANGED = "com.eduardoperez.despertador.RINGING_CHANGED"

        fun startRinging(ctx: Context, id: Int) {
            val i = Intent(ctx, AlarmService::class.java).setAction(ACTION_RING).putExtra(AlarmScheduler.EXTRA_ID, id)
            try {
                ctx.startForegroundService(i)
            } catch (e: Exception) {
                // Android no permitió iniciar el servicio: al menos mostrar la alarma con pantalla completa y sonido de notificación.
                Log.e("Despertador", "No se pudo iniciar el servicio de alarma", e)
                val a = AlarmStore.get(ctx).get(id) ?: return
                Notifications.manager(ctx).notify(Notifications.ID_RINGING, Notifications.ringing(ctx, a))
            }
        }

        fun send(ctx: Context, action: String) = ctx.startService(Intent(ctx, AlarmService::class.java).setAction(action))
    }
}
