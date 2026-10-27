package com.eduardoperez.despertador

import org.json.JSONObject

/**
 * Una alarma. [days] es una máscara de bits: bit 0 = lunes … bit 6 = domingo; 0 = una sola vez.
 * [snoozeUntil] > 0 indica una posposición pendiente; [nextTrigger] es la última hora programada en el sistema.
 */
data class Alarm(
    val id: Int = 0,
    val hour: Int = 7,
    val minute: Int = 0,
    val enabled: Boolean = true,
    val days: Int = 0,
    val soundId: Int = 0,
    val volume: Int = 100,
    val vibrate: Boolean = true,
    val snoozeMinutes: Int = 10,
    val snoozeUntil: Long = 0L,
    val nextTrigger: Long = 0L,
) {
    val repeats: Boolean get() = days != 0

    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("hour", hour).put("minute", minute).put("enabled", enabled)
        .put("days", days).put("sound", soundId).put("volume", volume).put("vibrate", vibrate)
        .put("snooze", snoozeMinutes).put("snoozeUntil", snoozeUntil).put("next", nextTrigger)

    companion object {
        const val TEST_ID = -1
        val SNOOZE_OPTIONS = intArrayOf(1, 5, 10, 15, 20, 30)

        /** Alarma interna usada por «Probar alarma»; nunca se guarda en la lista. */
        fun test() = Alarm(id = TEST_ID, hour = 0, minute = 0, enabled = false, days = 0, soundId = 2,
            volume = 100, vibrate = true, snoozeMinutes = 1)

        fun fromJson(o: JSONObject) = Alarm(
            id = o.getInt("id"),
            hour = o.getInt("hour").coerceIn(0, 23),
            minute = o.getInt("minute").coerceIn(0, 59),
            enabled = o.optBoolean("enabled", true),
            days = o.optInt("days", 0) and 0x7F,
            soundId = o.optInt("sound", 0),
            volume = o.optInt("volume", 100).coerceIn(10, 100),
            vibrate = o.optBoolean("vibrate", true),
            snoozeMinutes = o.optInt("snooze", 10).coerceIn(1, 60),
            snoozeUntil = o.optLong("snoozeUntil", 0L),
            nextTrigger = o.optLong("next", 0L),
        )
    }
}
