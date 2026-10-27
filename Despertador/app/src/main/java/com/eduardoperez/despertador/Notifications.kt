package com.eduardoperez.despertador

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object Notifications {
    const val CH_RINGING = "alarma_sonando"
    const val CH_INFO = "avisos"
    const val ID_RINGING = 1001
    private const val ID_SNOOZED = 2000
    private const val ID_MISSED = 3000

    fun manager(ctx: Context) = ctx.getSystemService(NotificationManager::class.java)

    fun ensureChannels(ctx: Context) {
        val nm = manager(ctx)
        if (nm.getNotificationChannel(CH_RINGING) == null) {
            nm.createNotificationChannel(NotificationChannel(CH_RINGING, ctx.getString(R.string.ch_ringing),
                NotificationManager.IMPORTANCE_HIGH).apply {
                description = ctx.getString(R.string.ch_ringing_desc)
                setSound(null, null)          // el sonido lo reproduce el servicio con USAGE_ALARM
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
        }
        if (nm.getNotificationChannel(CH_INFO) == null) {
            nm.createNotificationChannel(NotificationChannel(CH_INFO, ctx.getString(R.string.ch_info),
                NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = ctx.getString(R.string.ch_info_desc)
            })
        }
    }

    fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(ctx, 0,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun ringScreen(ctx: Context): PendingIntent = PendingIntent.getActivity(ctx, 1,
        Intent(ctx, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun serviceAction(ctx: Context, action: String, req: Int): PendingIntent = PendingIntent.getService(ctx, req,
        Intent(ctx, AlarmService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** Notificación del servicio en primer plano mientras la alarma suena (con pantalla completa y acciones). */
    fun ringing(ctx: Context, a: Alarm): Notification {
        ensureChannels(ctx)
        val title = if (a.id == Alarm.TEST_ID) ctx.getString(R.string.test_alarm_title)
        else ctx.getString(R.string.alarm_title_fmt, Fmt.time(a.hour, a.minute))
        return Notification.Builder(ctx, CH_RINGING)
            .setSmallIcon(R.drawable.ic_alarm)
            .setContentTitle(title)
            .setContentText(ctx.getString(R.string.ringing_text))
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setShowWhen(false)
            .setContentIntent(ringScreen(ctx))
            .setFullScreenIntent(ringScreen(ctx), true)
            .addAction(Notification.Action.Builder(null, ctx.getString(R.string.snooze_n_min, a.snoozeMinutes),
                serviceAction(ctx, AlarmService.ACTION_SNOOZE, 10)).build())
            .addAction(Notification.Action.Builder(null, ctx.getString(R.string.stop),
                serviceAction(ctx, AlarmService.ACTION_DISMISS, 11)).build())
            .build()
    }

    fun snoozed(ctx: Context, a: Alarm, until: Long) {
        ensureChannels(ctx)
        val c = java.util.Calendar.getInstance().apply { timeInMillis = until }
        manager(ctx).notify(ID_SNOOZED + a.id, Notification.Builder(ctx, CH_INFO)
            .setSmallIcon(R.drawable.ic_alarm)
            .setContentTitle(ctx.getString(R.string.snoozed_title))
            .setContentText(ctx.getString(R.string.snoozed_text,
                Fmt.time(c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE))))
            .setContentIntent(openApp(ctx))
            .setAutoCancel(true)
            .setTimeoutAfter((until - System.currentTimeMillis()).coerceAtLeast(1000L) + 60_000L)
            .build())
    }

    fun clearSnoozed(ctx: Context, id: Int) = manager(ctx).cancel(ID_SNOOZED + id)

    fun missed(ctx: Context, a: Alarm) {
        ensureChannels(ctx)
        manager(ctx).notify(ID_MISSED + a.id, Notification.Builder(ctx, CH_INFO)
            .setSmallIcon(R.drawable.ic_alarm)
            .setContentTitle(ctx.getString(R.string.missed_title))
            .setContentText(ctx.getString(R.string.missed_text, Fmt.time(a.hour, a.minute)))
            .setContentIntent(openApp(ctx))
            .setAutoCancel(true)
            .build())
    }
}
