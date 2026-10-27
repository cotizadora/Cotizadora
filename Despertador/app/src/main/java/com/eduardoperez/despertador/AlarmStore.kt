package com.eduardoperez.despertador

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray

/**
 * Persistencia local en almacenamiento «protegido por el dispositivo», para que las alarmas
 * sean legibles también tras un reinicio y antes de que el usuario desbloquee el teléfono.
 */
class AlarmStore private constructor(ctx: Context) {
    private val prefs: SharedPreferences =
        ctx.applicationContext.createDeviceProtectedStorageContext()
            .getSharedPreferences("despertador", Context.MODE_PRIVATE)

    @Synchronized
    fun all(): List<Alarm> = read().sortedWith(compareBy({ it.hour }, { it.minute }, { it.id }))

    @Synchronized
    fun get(id: Int): Alarm? = if (id == Alarm.TEST_ID) Alarm.test() else read().firstOrNull { it.id == id }

    /** Inserta (id = 0 asigna uno nuevo) o reemplaza; devuelve la alarma guardada. */
    @Synchronized
    fun upsert(a: Alarm): Alarm {
        val list = read().toMutableList()
        val saved = if (a.id == 0) a.copy(id = prefs.getInt(KEY_NEXT_ID, 1)).also {
            prefs.edit().putInt(KEY_NEXT_ID, it.id + 1).commit()
        } else a
        val i = list.indexOfFirst { it.id == saved.id }
        if (i >= 0) list[i] = saved else list.add(saved)
        write(list)
        return saved
    }

    @Synchronized
    fun update(id: Int, f: (Alarm) -> Alarm): Alarm? {
        if (id == Alarm.TEST_ID) return Alarm.test()
        val cur = read().firstOrNull { it.id == id } ?: return null
        return upsert(f(cur))
    }

    @Synchronized
    fun delete(id: Int) = write(read().filter { it.id != id })

    /** Id de la alarma que está sonando ahora (0 = ninguna). Sobrevive a la muerte del proceso. */
    var ringingId: Int
        @Synchronized get() = prefs.getInt(KEY_RINGING, 0)
        @Synchronized set(v) { prefs.edit().putInt(KEY_RINGING, v).commit() }

    private fun read(): List<Alarm> {
        for (key in arrayOf(KEY_ALARMS, KEY_BACKUP)) {
            val raw = prefs.getString(key, null) ?: continue
            try {
                val arr = JSONArray(raw)
                return (0 until arr.length()).map { Alarm.fromJson(arr.getJSONObject(it)) }
            } catch (_: Exception) { /* datos dañados: probar la copia anterior */ }
        }
        return emptyList()
    }

    private fun write(list: List<Alarm>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJson()) }
        val old = prefs.getString(KEY_ALARMS, null)
        prefs.edit().putString(KEY_ALARMS, arr.toString()).apply { if (old != null) putString(KEY_BACKUP, old) }.commit()
    }

    companion object {
        private const val KEY_ALARMS = "alarms"
        private const val KEY_BACKUP = "alarms_bak"
        private const val KEY_NEXT_ID = "next_id"
        private const val KEY_RINGING = "ringing"

        @Volatile private var instance: AlarmStore? = null
        fun get(ctx: Context): AlarmStore =
            instance ?: synchronized(this) { instance ?: AlarmStore(ctx).also { instance = it } }
    }
}
