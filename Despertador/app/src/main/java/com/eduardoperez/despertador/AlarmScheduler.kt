package com.eduardoperez.despertador

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * Programa las alarmas en AlarmManager con setAlarmClock (la vía más fiable: exenta de Doze y del ahorro de batería)
 * y mantiene sincronizado el estado guardado con lo registrado en el sistema.
 * Hay exactamente un PendingIntent por alarma (misma identidad ⇒ reprogramar nunca duplica).
 */
object AlarmScheduler {
    const val ACTION_FIRE = "com.eduardoperez.despertador.FIRE"
    const val EXTRA_ID = "alarm_id"
    private const val TAG = "Despertador"

    sealed class Result {
        object Ok : Result()
        object NoExactPermission : Result()
        data class Failed(val error: String) : Result()
    }

    fun canScheduleExact(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || ctx.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    private fun fireIntent(ctx: Context, id: Int) = Intent(ctx, AlarmReceiver::class.java)
        .setAction(ACTION_FIRE).setData(Uri.parse("despertador://alarma/$id")).putExtra(EXTRA_ID, id)

    private fun firePending(ctx: Context, id: Int, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(ctx, id, fireIntent(ctx, id), flags or PendingIntent.FLAG_IMMUTABLE)

    fun isRegistered(ctx: Context, id: Int): Boolean = firePending(ctx, id, PendingIntent.FLAG_NO_CREATE) != null

    /** Registra en el sistema el disparo [trigger] de la alarma [id]. Reemplaza cualquier registro anterior de esa alarma. */
    fun scheduleAt(ctx: Context, id: Int, trigger: Long): Result {
        if (!canScheduleExact(ctx)) return Result.NoExactPermission
        return try {
            val am = ctx.getSystemService(AlarmManager::class.java)
            val op = firePending(ctx, id, PendingIntent.FLAG_UPDATE_CURRENT)!!
            am.setAlarmClock(AlarmManager.AlarmClockInfo(trigger, Notifications.openApp(ctx)), op)
            if (isRegistered(ctx, id)) Result.Ok else Result.Failed("El sistema no registró la alarma")
        } catch (e: SecurityException) {
            Log.w(TAG, "Sin permiso de alarmas exactas", e); Result.NoExactPermission
        } catch (e: Exception) {
            Log.e(TAG, "Error al programar", e); Result.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    fun cancel(ctx: Context, id: Int) {
        val pi = firePending(ctx, id, PendingIntent.FLAG_NO_CREATE) ?: return
        ctx.getSystemService(AlarmManager::class.java).cancel(pi)
        pi.cancel()
    }

    /** Programa (o cancela) una alarma según su estado actual y guarda la hora programada. */
    fun schedule(ctx: Context, a: Alarm, now: Long = System.currentTimeMillis()): Result {
        val store = AlarmStore.get(ctx)
        val trigger = NextTrigger.of(a, now)
        if (trigger == null) {
            cancel(ctx, a.id); store.update(a.id) { it.copy(nextTrigger = 0L) }
            return Result.Ok
        }
        val r = scheduleAt(ctx, a.id, trigger)
        if (r == Result.Ok) store.update(a.id) { it.copy(nextTrigger = trigger) }
        return r
    }

    /**
     * Recuperación tras reinicio, cambio de hora/zona, actualización o cambio de permisos:
     * recalcula y vuelve a registrar todas las alarmas. Con [detectMissed] avisa de las que debieron sonar y no lo hicieron.
     */
    fun rescheduleAll(ctx: Context, reason: String, detectMissed: Boolean = false): List<Pair<Alarm, Result>> {
        val store = AlarmStore.get(ctx)
        val now = System.currentTimeMillis()
        Log.i(TAG, "Reprogramando todas las alarmas ($reason)")
        return store.all().map { a ->
            if (detectMissed && a.nextTrigger != 0L && a.nextTrigger < now - 30_000L && now - a.nextTrigger < 12 * 3600_000L &&
                (a.enabled || a.snoozeUntil != 0L) && store.ringingId != a.id) {
                Notifications.missed(ctx, a)
            }
            var cur = a
            // Si ya pasó su hora y la alarma no repite, no se vuelve a armar.
            if (a.snoozeUntil != 0L && a.snoozeUntil <= now) cur = store.update(a.id) { it.copy(snoozeUntil = 0L) } ?: a
            if (!cur.repeats && cur.enabled && cur.nextTrigger != 0L && cur.nextTrigger < now - 30_000L && detectMissed) {
                cur = store.update(a.id) { it.copy(enabled = false, nextTrigger = 0L) } ?: cur
            }
            cur to schedule(ctx, cur, now)
        }
    }

    /** Llamado por el receptor cuando vence una alarma: avanza su estado y la reprograma antes de hacer sonar nada. */
    fun onFired(ctx: Context, id: Int): Alarm? {
        val store = AlarmStore.get(ctx)
        val a = store.get(id) ?: return null
        if (id == Alarm.TEST_ID) return a
        if (!a.enabled && a.snoozeUntil == 0L) { Log.w(TAG, "Disparo obsoleto de la alarma $id ignorado"); return null }
        val updated = store.update(id) {
            it.copy(snoozeUntil = 0L, nextTrigger = 0L, enabled = if (it.repeats) it.enabled else false)
        } ?: return null
        Notifications.clearSnoozed(ctx, id)
        schedule(ctx, updated)   // las alarmas repetitivas quedan armadas para la siguiente fecha
        return updated
    }

    // ---------- Verificación del estado ----------

    data class Health(
        val exactOk: Boolean,
        val notificationsOk: Boolean,
        val fullScreenOk: Boolean,
        val batteryOk: Boolean,
        val volumeOk: Boolean,
        val activeCount: Int,
        val registeredCount: Int,
    ) {
        val allScheduled get() = activeCount == registeredCount
        val critical get() = !exactOk || !allScheduled
        val warnings get() = critical || !notificationsOk || !fullScreenOk || !volumeOk
    }

    fun health(ctx: Context): Health {
        val nm = Notifications.manager(ctx)
        val notifOk = (Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") ==
            android.content.pm.PackageManager.PERMISSION_GRANTED) && nm.areNotificationsEnabled() &&
            (nm.getNotificationChannel(Notifications.CH_RINGING)?.importance ?: NotificationManager.IMPORTANCE_DEFAULT) != NotificationManager.IMPORTANCE_NONE
        val fullOk = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent()
        val pm = ctx.getSystemService(PowerManager::class.java)
        val audio = ctx.getSystemService(android.media.AudioManager::class.java)
        val active = AlarmStore.get(ctx).all().filter { it.enabled || it.snoozeUntil > System.currentTimeMillis() }
        return Health(
            exactOk = canScheduleExact(ctx),
            notificationsOk = notifOk,
            fullScreenOk = fullOk,
            batteryOk = pm.isIgnoringBatteryOptimizations(ctx.packageName),
            volumeOk = audio.getStreamVolume(android.media.AudioManager.STREAM_ALARM) > 0,
            activeCount = active.size,
            registeredCount = active.count { isRegistered(ctx, it.id) },
        )
    }

}
