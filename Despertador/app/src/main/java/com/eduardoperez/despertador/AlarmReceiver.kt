package com.eduardoperez.despertador

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log

/** Recibe el disparo exacto de AlarmManager. Es lo primero que se ejecuta cuando debe sonar una alarma. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AlarmScheduler.ACTION_FIRE) return
        val id = intent.getIntExtra(AlarmScheduler.EXTRA_ID, 0)
        if (id == 0) return
        // Mantiene la CPU despierta hasta que el servicio en primer plano tome el relevo.
        // El servicio adquiere su propio wake lock; este caduca solo.
        context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "despertador:disparo").acquire(30_000L)
        try {
            val alarm = AlarmScheduler.onFired(context, id) ?: return
            AlarmService.startRinging(context, alarm.id)
        } catch (e: Exception) {
            Log.e("Despertador", "Fallo al disparar la alarma $id", e)
        }
    }
}
