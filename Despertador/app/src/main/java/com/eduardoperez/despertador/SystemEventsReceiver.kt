package com.eduardoperez.despertador

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Reinicio, actualización de la app, cambios de hora/zona horaria y de permiso de alarmas exactas. */
class SystemEventsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val boot = action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        val store = AlarmStore.get(context)
        if (boot) store.ringingId = 0 // ninguna alarma puede seguir sonando tras un reinicio
        val resumeRinging = action == Intent.ACTION_MY_PACKAGE_REPLACED && store.ringingId != 0
        AlarmScheduler.rescheduleAll(context, action, detectMissed = boot || action == Intent.ACTION_TIME_CHANGED)
        // Si la actualización de la app interrumpió una alarma sonando, retomarla.
        if (resumeRinging) AlarmService.startRinging(context, store.ringingId)
    }
}
