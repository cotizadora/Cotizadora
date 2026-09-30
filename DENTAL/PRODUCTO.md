# Seguro Dental Modular Bci — base de conocimiento

Todo lo que se pudo extraer de la documentación del producto, en un solo lugar.
Sirve de base para los proyectos que vengan: cotizadores, scripts, material de
apoyo, capacitación.

**Fuentes** (los originales están en `insumos/`):

| # | Documento | Fecha | Qué aporta |
|---|---|---|---|
| 1 | Script Bci Dental Full (PDF, 4 pág.) | Septiembre 2026 | **Tarifas vigentes**, flujo de venta, datos obligatorios, cumplimiento |
| 2 | Seguro Dental Modular Bci Salud 2025, Canal Banca (PPT, 22 lám.) | Junio 2025 | Coberturas con topes y copagos, asegurabilidad, exclusiones |
| 3 | Programa de Salud y Beneficios (PDF, 20 pág.) | — | Ecosistema Care Assistance, canales, app |
| 4 | Programa de Salud y Bienestar (Word) | — | Descripción y horarios de cada programa |
| 5 | Glosario (Word, tabla en imagen) | Junio 2025 | Definiciones de cada prestación |
| 6 | 13 Programas Salud Care Assistance (PPT, 5 lám.) | Septiembre 2025 | Paso de 10 a 13 programas, Mindfulness |
| 7 | Derivación Encuesta EPA (Word) | — | Procedimiento de cierre de llamada |

> Del documento 6 sólo se pudo leer el texto de 3 láminas: el resto son
> imágenes sin capa de texto.

---

## 1. Qué es el producto

Seguro dental de **red cerrada** con **Uno Salud Dental**, comercializado por
Bci Corredores de Seguros, asegurado por Bci Seguros Vida S.A.

- 84 clínicas de Arica a Puerto Montt, 1.500 odontólogos, parte de la red GES Dental.
- **Sin deducible. Sin reembolsos ni trámite de bonos.** El descuento se aplica
  directo en el presupuesto de la clínica.
- Garantía de 12 meses sobre los tratamientos. Auditoría de todos los tratamientos.
- Vigencia anual, renovable automáticamente. El asegurado puede terminarlo
  cuando quiera, sin expresión de causa.
- Agendamiento de horas: **227501096**.

Códigos CMF de las condiciones generales:
- **POL 3 2013 0085 Alt. A** — Muerte accidental
- **POL 3 2019 0055** — Cobertura dental

---

## 2. Planes y tarifas

### Tabla vigente (script septiembre 2026)

| Plan | Cobertura | Titular | Tit + 1 | Tit + 2 | Tit + 3 |
|---|---|---|---|---|---|
| **Plan 2 Básico** | Urgencia + prevención | 0,26 | 0,33 | 0,39 | 0,46 |
| **Plan 3 Full** | + operatoria | 0,43 | 0,68 | 0,92 | 1,16 |
| **Plan 4 Full Niños** | + odontología niños | — | 0,81 | 1,13 | 1,44 |

Valores en UF mensuales. **El Plan 4 Full Niños no se vende con titular solo:
parte en titular + 1.** Tiene sentido, porque la razón de ese plan es cubrir a
un menor.

El script trae además pesos de referencia ($10.600, $17.600, $33.200…), pero
quedaron congelados en el documento. Siempre hay que recalcular con la UF del
día; el propio documento lo advierte: *"Todos los inicios de mes el Call debe
actualizar valores con la UF"*.

### Tabla anterior (presentación junio 2025)

Calculada con UF $39.191,97. Tres decimales en vez de dos:

| Plan | Titular | Tit + 1 | Tit + 2 | Tit + 3 |
|---|---|---|---|---|
| Plan 2 Básico | 0,258 | 0,325 | 0,392 | 0,459 |
| Plan 3 Full | 0,434 | 0,676 | 0,919 | 1,162 |
| Plan 4 Total | 0,502 | 0,814 | 1,125 | 1,436 |

Los valores del script 2026 son estos mismos redondeados a dos decimales. Dos
diferencias que conviene tener presentes:

- El plan de niños se llamaba **Plan 4 Total** y **sí tenía precio de titular
  solo** (0,502). En el script 2026 se llama **Plan 4 Full Niños** y ese precio
  desapareció.
- La presentación 2025 permitía **4 cargas**; el script 2026 dice **3**. La
  tabla de precios llega a titular + 3 en ambos documentos, así que 3 es lo
  correcto.

### Plan objetivo

El script de septiembre 2026 es explícito: *"FOCO y Plan Objetivo es ofrecer
siempre: Plan 3 Full"*, y deja el Plan 2 Básico como retención si el cliente
rechaza el Full.

**Las herramientas parten en el Plan Urgencias**, por decisión del equipo
comercial, y desde ahí se sube a Full. Es el orden inverso al del script. Si
esto viene de un cambio de campaña, conviene dejarlo escrito acá.

**Nombre comercial:** al Plan 2 Básico se le llama **Plan Urgencias** en las
herramientas y frente al cliente. En la documentación oficial aparece como
Plan 2 Básico.

---

## 3. Coberturas en detalle

### 3.1 Urgencia — 18 procedimientos, sin tope, copago $0

Carencia: **48 horas hábiles**. Aplica ante dolor intenso, inflamación o sangrado.
Presente en los tres planes.

| Procedimiento | Precio de referencia |
|---|---|
| Diagnóstico de urgencia dental y derivación a especialista | $63.086 |
| Radiografía pieza afectada (periapical) | $14.990 |
| Alivio de oclusión (diente sintomático) | $72.145 |
| Colocación de cemento temporal | $57.782 |
| Drenaje de absceso intraoral | $92.383 |
| Trepanación de urgencia (pulpitis irreversible) | $124.550 |
| Extracciones simples de urgencia (excluye terceros molares) | $95.510 |
| Extracciones a colgajo de urgencia (excluye terceros molares) | $114.780 |
| Complicaciones post-exodoncia: hemorragia y alveolitis | $88.223 |
| Ferulización en caso de trauma dientes anteriores | $113.048 |
| Eliminación de contacto prematuro | $72.145 |
| Recubrimiento pulpar directo | $86.559 |
| **Urgencia protésica** | |
| Recementación de incrustación sin correcciones | $72.145 |
| Recementación corona sin correcciones | $84.448 |
| Recementación puente definitivo sin correcciones | $104.125 |
| Rebasado o acondicionamiento de tejidos (no incluye laboratorio) | $131.000 |
| Reparación de prótesis con toma de impresión (no incluye laboratorio) | $116.147 |
| Reparación de prótesis sin toma de impresión | $83.169 |

> El glosario menciona un tope de **3 al año** para las exodoncias de urgencia,
> mientras la presentación dice "sin tope". El glosario corresponde al
> "Plan Odonto Acci-Dental", que puede ser otro producto. **Conviene confirmarlo.**

### 3.2 Prevención — 5 procedimientos, copago $0

Carencia: **30 días**. Presente en los tres planes.

| Procedimiento | Tope anual | Precio de referencia |
|---|---|---|
| Examen clínico y diagnóstico | Sin tope | $0 |
| Enseñanza de técnica de cepillado, hilo dental e higiene bucal | Sin tope | $30.555 |
| Rayos X periapicales (diagnóstico de diente sintomático) | Sin tope | $14.990 |
| Profilaxis | 1 | — |
| Fase higiénica (profilaxis + remoción de cálculos supragingivales) | 1 por vigencia | $127.150 |

### 3.3 Operatoria — 9 procedimientos (Plan 3 Full y Plan 4)

Carencia: **30 días**.

| Procedimiento | Tope anual | Copago | Precio de referencia |
|---|---|---|---|
| **Endodoncia** | | | |
| Endodoncia en dientes anteriores | 2 | $12.000 c/u | $239.782 |
| Endodoncia en premolares y molares | 2 | $12.000 c/u | $359.424 |
| **Operatoria (tapaduras)** | | | |
| Obturación resina simple, pieza anterior o posterior | 5 | $12.000 c/u | $103.990 |
| Obturación resina compuesta | 5 | $12.000 c/u | $126.069 |
| Obturación resina compleja | 5 | $12.000 c/u | $120.858 |
| Resina cervical (caries, erosiones o abrasiones) | 5 | $12.000 c/u | $101.400 |
| Tratamiento de sensibilidad cervical sin cavidad | 5 | $12.000 c/u | $73.902 |
| **Cirugía oral** | | | |
| Exodoncia simple (excluye terceros molares) | Sin tope | $0 | $95.510 |
| Exodoncia a colgajo (excluye terceros molares) | Sin tope | $0 | $114.780 |

Los topes de 2 endodoncias y 5 tapaduras son **por año de vigencia**.

### 3.4 Odontología Niños — 11 procedimientos (sólo Plan 4)

Carencia: **30 días**. Son procedimientos sobre **dientes temporales en niños
menores de 14 años**. Copago $0 y sin tope.

Procedimientos identificados en la documentación:

- Examen clínico y diagnóstico
- Enseñanza de técnica de cepillado, hilo dental e higiene bucal
- Profilaxis (1 al año)
- Aplicación de flúor gel en cubetas
- Exodoncia en diente temporal
- Endodoncia en diente temporal

> La documentación dice "11 procedimientos" pero sólo enumera estos y cierra con
> "entre otros". **Falta el listado completo.**

### 3.5 Descuentos en tratamientos no cubiertos

Hasta **65% de descuento** sobre el precio promedio de mercado (sólo Plan Full y
Full Niños):

- Extracción de muelas del juicio (terceros molares)
- Planos de relajación para bruxismo
- Cambio de tapadura de amalgama a resina (estético)
- Tapaduras de resina adicionales a las 5 del plan
- Tratamientos de conducto adicionales a los 2 del plan

### 3.6 Muerte accidental

**UF 50**, sólo para el titular, en los tres planes. Sin costo adicional. Se paga
a los herederos legales, es dinero de libre disposición (≈ $2.000.000).

> El script menciona además, **sólo como argumento**, 3 meses gratuitos de un
> seguro de sala de urgencia con UF 500 de muerte accidental y UF 9 para gastos
> de urgencia médica. Es un producto distinto, no parte del dental.

---

## 4. Requisitos de asegurabilidad

| Asegurable | Edad mínima de ingreso | Edad máxima de ingreso | Edad máxima de permanencia |
|---|---|---|---|
| Titular | 18 años | 69 años y 364 días | 70 años y 364 días |
| Cónyuge, unión civil, conviviente con hijos en común | 18 años | 69 años y 364 días | 70 años y 364 días |
| Hijos del titular, hijos del cónyuge o unión civil | **14 días** | **23 años y 0 días** | **24 años y 0 días** |

Máximo **3 cargas** (script 2026). Sólo cónyuge / unión civil / conviviente con
hijos en común, hijos del titular e hijos del cónyuge.

El script lo dice así al cliente: *"cumple con los requisitos ya que es mayor de
18 años y menor de 70 años. La permanencia máxima es hasta un día antes de
cumplir los 71 años"*.

### Los dos "14" que se confunden

Este es el error más fácil de cometer con este producto:

- **14 días** es la edad mínima para ingresar un hijo como carga.
- **14 años** es el límite de la odontología infantil: son procedimientos sobre
  dientes temporales, que a esa edad ya se cayeron.

No tienen relación entre sí.

### La regla que define el plan

**Sin menores de 14 en el grupo:** el cliente elige. Puede quedarse en el
**Plan 2 Básico** (urgencia y prevención, el "plan de Urgencia") o tomar el
**Plan 3 Full**. El script empuja el Full, y el Básico es la carta de retención
si lo rechaza.

**Con un hijo menor de 14 en el grupo:** el **Plan 4 Full Niños es obligatorio**.
Un menor de 14 no entra como carga en el plan de Urgencia, y la cobertura que
ese niño necesita (odontología infantil sobre dientes temporales) sólo existe
en el Plan 4. No es una preferencia comercial: los otros dos planes no tienen
con qué atenderlo.

Dicho en una línea: **el menor no elige plan, lo impone.**

### Los tres cortes de edad que importan al cotizar

1. **14 años** — bajo esa edad, obliga al Plan 4.
2. **23 años y 0 días** — tope para que un hijo *entre* al seguro.
3. **24 años y 0 días** — tope para que un hijo *siga* en el seguro.

Un hijo de 23 años y 6 meses ya no puede ingresar, pero si entró antes, puede
quedarse hasta los 24 y 0 días.

---

## 5. Carencias

| Cobertura | Carencia |
|---|---|
| Urgencia dental | 48 horas hábiles |
| Prevención, operatoria, odontología niños | 30 días desde la emisión de la póliza |

---

## 6. Exclusiones

### Cobertura dental

- Extracción de terceros molares (muelas del juicio), de todo tipo
- Ortodoncia (frenillos)
- Tratamiento de enfermedades periodontales (pulidos radiculares y otros)
- Prótesis fijas y removibles
- Cirugía de encías, cirugía para implantes
- Sedación, anestesia general, pabellón
- Empastes de oro o materiales con fin cosmético
- Profilaxis dentro de los 6 meses de una anterior
- Urgencias quirúrgicas mayores por traumatismo severo (fractura maxilar o facial)
- Instrumentación mecanizada y medicación intraconducto en endodoncia
- Distonías maxilofaciales
- Lesiones autoinfligidas, o causadas por terceros con consentimiento
- Lesiones por participación en actos calificados como delito
- Costos de laboratorio y medicación
- Tratamientos de mayor complejidad no listados en la tabla del plan

### Muerte accidental

Guerra, peleas o riñas (salvo legítima defensa acreditada judicialmente), actos
delictivos, rebelión o terrorismo, suicidio o intento, servicio en Fuerzas
Armadas o policiales, carreras y competencias remuneradas, conducción en estado
de ebriedad, negligencia o culpa grave, intoxicación o efecto de drogas,
movimientos sísmicos de grado 8 o superior en escala de Mercalli, vuelo en
aeronave de itinerario no regular.

---

## 7. Ecosistema de Salud y Bienestar (Care Assistance)

Beneficio sin costo adicional, para **titular y cargas**. Uso ilimitado.

> La documentación de 2025 habla de **10 programas** y la de septiembre 2025 en
> adelante de **13**. El script 2026 dice 13. Los programas que se pudieron
> identificar son 12; faltaría confirmar cuál es el que falta.

| Programa | Qué hace | Horario |
|---|---|---|
| Telemedicina | Atención médica a distancia, baja complejidad. Puede terminar en receta u orden de examen | 24/7 |
| Asistencia Emocional | Apoyo psicológico familiar: salud mental, conductual, social, violencia y abuso | L-V 9-21, Sáb 9-18 |
| Asistencia Nutricional | Dietas, patologías, etapas de la vida, intolerancias | L-V 9-20, Sáb 9-13 |
| Orientación en Salud | Uso de Isapre/Fonasa, GES, CAEC, Ley de Urgencias, Ley Ricarte Soto, revisión de presupuestos | L-V 9-18, Sáb 9-13 |
| Asesoría Psicológica en Salud Sexual | Educación sexual, disfunciones, pareja, diversidad, prevención de ITS | L-V 9-20, Sáb 9-13 |
| Veterinaria | Consultas de baja complejidad sobre perros y gatos | L-V 9-18, Sáb 9-13 |
| Seguimiento de Pacientes Crónicos | Diabetes, hipertensión, dislipidemia, enfermedad renal, oncológicas | L-V 9-18, Sáb 9-13 |
| Clínica del Sueño | Test del sueño y plan de mejora de hábitos | L-V 9-18, Sáb 9-13 |
| Asesoría Deportiva | Rutinas con personal trainer y seguimiento | L-V 9-20, Sáb 9-13 |
| Mis Primeros Pasos / Cuidados de Recién Nacidos | Desarrollo y crecimiento del niño, lactancia, neurodesarrollo | — |
| Mindfulness | Sesión abierta, todos los miércoles a las 12:00. Partió el 20-05-2025 | Miércoles 12:00 |
| Kinesiología, Fonoaudiología | Mencionados en el script, sin ficha propia | — |

**Canales:** Call Center 600 083 0051 · WhatsApp +56 9 5099 4362 ·
App "Care Assistance" · Web clinicavirtual.com/bciseguros individual

**Enrolamiento en la app:** Registrarme → RUT con dígito verificador, sin puntos
ni guión → mail y teléfono → código de validación que llega al mail → crear
contraseña.

---

## 8. Flujo de venta (script septiembre 2026)

1. **Apertura** — identificarse, empatizar, agradecer permanencia como cliente Bci.
2. **Urgencias** — lo que se cubre a costo $0: extracciones simples, trepanación,
   cemento temporal, urgencia protésica.
3. **Prevención** — evaluación, radiografías, limpieza profunda. Recomendación de
   una limpieza al año.
4. **Carencias** — 30 días en general, 48 horas hábiles en urgencia.
5. **Copagos** (sólo Plan Full y Full Niños) — 5 tapaduras y 2 tratamientos de
   conducto a $12.000, contra $45.000 y $150.000-$300.000 de referencia.
   Descuentos de hasta 65% en el resto.
6. **Programas de bienestar** — 13 programas sin costo.
7. **Muerte accidental** — UF 50, ≈$2.000.000 para herederos legales.
8. **Sin reembolsos** — se agenda al 227501096 y la clínica aplica todo automático.
9. **Asegurabilidad** — confirmar que es mayor de 18 y menor de 70.
10. **Objeciones** — si rechaza el Full, ofrecer Plan 2 Básico (urgencia +
    prevención, 0,26 UF). Si tiene niños, ofrecer Plan 4 Full Niños.
11. **Precio y promoción** — valor en UF fijas y su equivalente en pesos, cargo
    automático en cuenta Bci. Mencionar cuotas sin costo si hay promoción vigente.
12. **Validación de datos** y **grabación**.
13. **Exclusiones** — leerlas.
14. **Pregunta de contratación** — textual, respuesta válida sólo "sí", "acepto"
    o "de acuerdo". **No** sirve "ok", "ya" ni "correcto".
15. **Medio de pago** — hay dos caminos, y el script trae el texto de cada uno:
    - **Póliza en línea.** Para el cliente que tiene cuenta Bci. Se autoriza el
      cargo de la prima mensual descontado de su cuenta corriente del banco Bci.
      Es la opción por defecto.
    - **Link de pago.** Para el que no tiene cuenta Bci. Le llega un correo con
      el asunto *"Multicotizador – Pago de primera cuota"* y el botón naranjo
      *"Pagar aquí"*. Pago débito: cobro inmediato. Pago crédito: próximo ciclo
      de facturación. El link vence en **48 horas**, y mientras no pague, el
      seguro no está vigente ni puede usar las asistencias y coberturas.

    En ambos casos se cierra igual: se le invita a estar al día con la prima, y
    la póliza le llega por correo dentro de unos minutos, una vez que registre
    su medio de pago.
16. **Cierre normativo** — tratamiento de datos, código de operación, inicio de
    vigencia, derecho a retracto de 10 días, causales de término.
17. **Derivación a Encuesta EPA** — obligatoria salvo derivación a IVR por pago
    con tarjeta de crédito. En el sistema: botón "Transfer-Conf" → ingroup
    "ENCUESTA_EPA" → "CLOSER LOCAL" → tipificar.

### Datos obligatorios del titular

Fecha de nacimiento, domicilio completo, teléfono de contacto, correo
electrónico (indispensable para enviar la póliza), nombre completo y RUT.

### Datos obligatorios de cada adicional

Nombre completo, RUT, fecha de nacimiento y parentesco. Los cuatro.

---

## 9. Cómo funciona la atención

1. El paciente llama al **227501096**.
2. La asesora pide el RUT, lo ubica en el sistema y le recuerda las
   características de su plan.
3. Le ofrece clínicas y horarios según su ubicación.
4. Asigna la cita. Las horas siguientes las coordina el paciente directamente
   con la clínica.

---

## 10. Puntos confirmados

Estos puntos no estaban escritos en la documentación, o aparecían distintos
entre un documento y otro. Quedaron confirmados por el equipo comercial y son
los que están implementados en las herramientas.

| Punto | Resolución |
|---|---|
| ¿Un menor de 14 puede ir como carga en el plan de Urgencia? | **No.** Obliga a pasar al Plan 4 Full Niños. Esta es la regla que gatilla el salto de precio, y no figura en los documentos: sale del equipo comercial. |
| ¿El cliente sin menores puede quedarse en el plan de Urgencia? | **Sí.** Sin menores elige libremente entre Plan 2 Básico y Plan 3 Full. |
| ¿El Plan 4 se vende con titular solo? | **No.** Parte en titular + 1, como muestra el script 2026. El precio de 0,502 UF de la presentación 2025 ya no aplica. |
| Máximo de cargas | **3.** Rige el script de septiembre 2026 por sobre las 4 de la presentación de junio 2025. |
| Tarifas vigentes | Las del script de septiembre 2026, con dos decimales. Son las que se leen al cliente. |

Si alguna de estas cambia, hay que tocar dos lugares: el objeto `PLANES` de
`calculadora-edad.html` y el de `extension/popup.js`.
