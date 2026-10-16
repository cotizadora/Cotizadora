# Tarifas y reglas — Seguro Dental Modular Bci

Extraído de los documentos del producto. Esta es la fuente de la que sale el
objeto `PLANES` de `calculadora-edad.html`.

## Tarifas vigentes

Fuente: **Script Bci Dental Full, septiembre 2026**, página 2.

| Plan | Cobertura | Titular | Titular+1 | Titular+2 | Titular+3 |
|---|---|---|---|---|---|
| Plan 2 Básico | Urgencia y preventivo | 0,26 | 0,33 | 0,39 | 0,46 |
| Plan 3 Full | Urgencia, preventivo y operatorio | 0,43 | 0,68 | 0,92 | 1,16 |
| Plan 4 Full Niños | + odontología niños (menores de 14) | — | 0,81 | 1,13 | 1,44 |

El Plan 4 Full Niños no tiene precio de titular solo: parte en titular + 1.

Los pesos que trae el script ($10.600, $17.600, $33.200, etc.) son
referenciales y quedaron fijos en el documento. La calculadora los recalcula
con la UF del día.

### Versión anterior, con tres decimales

Fuente: presentación *Seguro Dental Modular Bci Salud 2025*, junio 2025,
calculada con UF $39.191,97.

| Plan | Titular | Titular+1 | Titular+2 | Titular+3 |
|---|---|---|---|---|
| Plan 2 Básico | 0,258 | 0,325 | 0,392 | 0,459 |
| Plan 3 Full | 0,434 | 0,676 | 0,919 | 1,162 |
| Plan 4 Total | 0,502 | 0,814 | 1,125 | 1,436 |

Los valores del script de 2026 son estos mismos redondeados a dos decimales.
En la presentación de 2025 el plan de niños se llama **Plan 4 Total** y sí
tiene precio de titular solo (0,502); en el script de 2026 se llama
**Plan 4 Full Niños** y ese precio ya no aparece.

## Requisitos de asegurabilidad

Fuente: presentación junio 2025, lámina 18, confirmado por el script 2026.

| Asegurable | Edad mínima de ingreso | Edad máxima de ingreso | Edad máxima de permanencia |
|---|---|---|---|
| Titular | 18 años | 69 años y 364 días | 70 años y 364 días |
| Cónyuge, unión civil, conviviente con hijos en común | 18 años | 69 años y 364 días | 70 años y 364 días |
| Hijos del titular o del cónyuge | 14 días | 23 años y 0 días | 24 años y 0 días |

## Regla de los menores de 14 años

La odontología infantil son **11 procedimientos asociados a dientes temporales
en niños menores de 14 años**, y sólo existe en el Plan 4. Por eso, si se
incorpora un menor de 14, el grupo debe contratar ese plan.

Ojo con la confusión: en la tabla de asegurabilidad los **14 días** son la edad
mínima de ingreso de un hijo. Son dos cosas distintas que comparten el número.

## Diferencia detectada entre documentos

- **Máximo de cargas:** el script de septiembre 2026 dice **3 cargas**; la
  presentación de junio 2025 decía 4. La tabla de precios llega hasta
  titular + 3 en ambos. La calculadora usa 3.

## Carencias

- Urgencia dental: 48 horas hábiles.
- Todo el resto: 30 días desde la emisión de la póliza.

## Otros datos del producto

- Red cerrada Uno Salud Dental, 84 clínicas, cobertura nacional. Sin deducible,
  sin reembolsos. Agendamiento al 227501096.
- Muerte accidental UF 50, sólo titular.
- Copagos Plan Full: 5 tapaduras en resina y 2 tratamientos de conducto al año,
  $12.000 cada uno.
- Programa de Salud y Bienestar de Care Assistance sin costo adicional. El
  script y el PPT de 2025 hablan de 10 programas; el material de Care
  Assistance de septiembre 2025 y el script 2026 hablan de 13.
- Códigos CMF: POL 3 2013 0085 Alt. A (muerte accidental) y POL 3 2019 0055
  (dental).
