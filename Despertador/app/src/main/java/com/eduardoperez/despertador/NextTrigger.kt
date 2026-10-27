package com.eduardoperez.despertador

import java.time.Instant
import java.time.ZoneId

/** Cálculo puro (sin dependencias de Android) de cuándo debe sonar una alarma. */
object NextTrigger {

    /** Siguiente ocurrencia estrictamente posterior a [now] de hour:minute en alguno de los [days] (0 = hoy o mañana). */
    fun regular(hour: Int, minute: Int, days: Int, now: Long, zone: ZoneId): Long {
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        for (i in 0..8) {
            val d = today.plusDays(i.toLong())
            if (days != 0 && (days shr (d.dayOfWeek.value - 1)) and 1 == 0) continue
            // En un salto de horario de verano la hora inexistente se desplaza hacia delante (comportamiento de java.time).
            val t = d.atTime(hour, minute).atZone(zone).toInstant().toEpochMilli()
            if (t > now) return t
        }
        throw IllegalStateException("sin próxima fecha")
    }

    /** Próximo disparo de una alarma o null si no debe sonar nunca más. Una posposición pendiente adelanta el disparo. */
    fun of(a: Alarm, now: Long, zone: ZoneId = ZoneId.systemDefault()): Long? {
        val snooze = if (a.snoozeUntil > now) a.snoozeUntil else Long.MAX_VALUE
        val regular = if (a.enabled) regular(a.hour, a.minute, a.days, now, zone) else Long.MAX_VALUE
        val t = minOf(snooze, regular)
        return if (t == Long.MAX_VALUE) null else t
    }
}
