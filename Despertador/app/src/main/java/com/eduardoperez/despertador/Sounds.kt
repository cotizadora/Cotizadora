package com.eduardoperez.despertador

data class Sound(val id: Int, val nameRes: Int, val rawRes: Int)

object Sounds {
    val all = listOf(
        Sound(0, R.string.sound_amanecer, R.raw.amanecer),
        Sound(1, R.string.sound_campanas, R.raw.campanas),
        Sound(2, R.string.sound_pulso, R.raw.pulso),
        Sound(3, R.string.sound_marimba, R.raw.marimba),
        Sound(4, R.string.sound_radar, R.raw.radar),
    )

    fun byId(id: Int): Sound = all.firstOrNull { it.id == id } ?: all[0]
}
