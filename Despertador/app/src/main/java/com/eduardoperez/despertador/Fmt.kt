package com.eduardoperez.despertador

import java.time.Instant
import java.time.ZoneId

/** Textos en español para horas, días y plazos. */
object Fmt {
    private val DAY_SHORT = arrayOf("Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom")
    private val DAY_LONG = arrayOf("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
    private val MONTHS = arrayOf("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
        "septiembre", "octubre", "noviembre", "diciembre")

    fun time(h: Int, m: Int) = "%02d:%02d".format(h, m)

    fun days(mask: Int): String = when (mask and 0x7F) {
        0 -> "Una vez"
        0x7F -> "Todos los días"
        0b0011111 -> "Lunes a viernes"
        0b1100000 -> "Fines de semana"
        else -> (0..6).filter { (mask shr it) and 1 == 1 }.joinToString(" · ") { DAY_SHORT[it] }
    }

    fun dayName(index: Int) = DAY_SHORT[index]

    fun longDate(ms: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val d = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()
        return "${DAY_LONG[d.dayOfWeek.value - 1].replaceFirstChar { it.uppercase() }}, ${d.dayOfMonth} de ${MONTHS[d.monthValue - 1]}"
    }

    /** «en 8 h 12 min», «en 3 min», «en 1 d 2 h». */
    fun remaining(delta: Long): String {
        val totalMin = (delta + 59_999) / 60_000 // redondeo hacia arriba
        if (totalMin <= 0) return "en menos de 1 min"
        val d = totalMin / (24 * 60)
        val h = (totalMin % (24 * 60)) / 60
        val m = totalMin % 60
        return "en " + when {
            d > 0 -> "$d d" + if (h > 0) " $h h" else ""
            h > 0 -> "$h h" + if (m > 0) " $m min" else ""
            else -> "$m min"
        }
    }

    /** «hoy 07:00», «mañana 07:00», «lunes 07:00». */
    fun whenText(trigger: Long, now: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val t = Instant.ofEpochMilli(trigger).atZone(zone)
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val clock = time(t.hour, t.minute)
        return when (t.toLocalDate()) {
            today -> "hoy $clock"
            today.plusDays(1) -> "mañana $clock"
            else -> "${DAY_LONG[t.dayOfWeek.value - 1]} $clock"
        }
    }
}
