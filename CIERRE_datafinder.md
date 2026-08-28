# Registro de cierre — Corrección Data Finder como producto COTIZABLE

**Archivo intervenido:** `C:\Users\eduardo.perez\Documents\index.html` (CotizadorGo, single-file)
**Spec origen:** `correcciones-datafinder.md`
**Estado:** CERRADO y validado desde el motor real.

## Contexto de la sesión (para no confundir alcances)
- **Problema 2 (Publicación Única · "Documentos solicitados")** y **Problema 3 (reset de calculadora)** son de una tarea PREVIA (`correcciones-quirurgicas.md`), ya cerrada y validada aparte. NO forman parte de esta corrección de Data Finder.
- El diff aislado de ESTA corrección es contra el respaldo `index.html.bak-20260707-1742` (previo a tocar Data Finder), sin contaminación de P2/P3.

## Tabla de cierre (qué cambió y por qué)

| # | Línea aprox. | Cambio | Punto del md |
|---|---|---|---|
| 1 | ~1333 | `PRODUCTS`: `su` → `Localización y contactabilidad` | §1.1 |
| 2 | ~1575 | `cfgHTML`: eliminada rama informativa `datafinder` | §1.2 |
| 3 | ~1637 | `cfgHTML`: agregada rama `datafinder` (select `DF_T` + `data-t`), espejo de `malla` | §2.2 |
| 4 | ~1688 | `computeCurrent`: agregada rama `datafinder` (tarifa/consulta + adicional ×1,20) | §2.3 |
| 5 | ~1861 | `refresh`: eliminada rama informativa `datafinder` | §1.2 |
| 6 | ~1976 | Eliminada función `renderDataFinder()` (sin uso) | §1.2 |
| 7 | ~2857 | Agregada `DF_T` (26 tramos, `u = F.M.M./1,19` neto 6 dec.) + comentario IVA + nota checklist | §2.1 + §6 |
| 8 | ~2925 | `PINFO`: clave `datafinder` | §3.1 |
| 9 | ~2926 | `PITEMS`: clave `datafinder` (reutiliza `SOL_CARAC`) | §3.2 |
| 10 | ~2921–3444 | `genMail`: eliminadas las 10 guardas `isDataFinder` (+ rebalanceo de paréntesis) → rama estándar hereda "Documentos para contratar" | §1.2 + §4 |

## §6 — Reconciliación IVA (resuelta)
La hoja rotula el F.M.M. como "UF + IVA" (BRUTO). El sistema guarda UF NETA y agrega IVA en `ufc()=u×UF×1.19`. Por eso **`u = F.M.M._hoja / 1,19`** (neto). Anclas reproducidas desde el motor real: 2500 sin dcto → **$858.812,89**; con 25% → **$644.109,67**. Titular en pantalla: **18,2773 UF** (neto + IVA), NO 21,75.

## ⚠️ Dos notas para quien lea este registro después

**Nota 1 — La UF de validación (39.485,65) es la del Excel, no la vigente del sistema.**
El match exacto de los pesos ($858.812,89 / $644.109,67) prueba que la fórmula y el factor 1,19 son correctos. Pero la UF vigente real (`getUF()`, default visto ≈ 40.779) es distinta, así que el peso que un usuario ve HOY en pantalla **diferirá** del Excel. Eso es esperado y correcto (el sistema recalcula con la UF del día): NO confundir "no coincide con el Excel" con un bug. (También anotado junto a `DF_T` en el código.)

**Nota 2 — `renderDataFinder()` se eliminó por completo.**
La función informativa quedó sin uso tras convertir Data Finder en producto estándar; se borró en vez de dejarla como código muerto. Más limpio que la suposición inicial de conservarla.

## Validaciones de cierre
- Sintaxis: 0 errores (parser esprima ≡ `node --check`). Balance de tags: delta 0 vs. respaldo.
- Regresión: 13/13 productos intactos; RI (0,11 UF) y Malla (0,45 UF) sin cambios; catálogo "Información de Productos Equifax" sigue mostrando Data Finder.
- Anclas verificadas leyendo la tarjeta del sistema real, no una cuenta aparte.

## Artefactos
- Diff aislado de esta corrección: `diff_datafinder_correccion.diff`
- Diff de la sesión completa (incluye P2/P3): `scratchpad_diff_sesion.diff`
- Respaldos: `index.html.bak-20260707-1742` (previo a Data Finder) · `index.html.bak-20260707-1544` (inicio del día)
