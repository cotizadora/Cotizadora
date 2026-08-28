# CONTEXTO PARA GENERAR EL PDF INSTITUCIONAL — PORTFOLIO MONITOR

> Documento de traspaso para una nueva sesión de Code.
> Concentra todo lo necesario para construir el PDF de **Portfolio Monitor** manteniendo coherencia total con la colección de PDFs ya existente.
> **No contiene el PDF final ni el código.** Es únicamente el brief de contexto.

---

## 0. Lo que existe y lo que NO existe (leer primero)

**Existe y está verificado:**
- Un PDF de referencia ya construido: `MoraControl_Informes.pdf` (8 páginas, A4 vertical, generado con **WeasyPrint 69.0**, tipografía **Montserrat** embebida). Es el modelo visual y estructural de toda la colección.
- Todo el contenido comercial de Portfolio Monitor, proveniente de dos fuentes oficiales del proyecto: el `index.html` del cotizador (variables de catálogo) y el material fuente `PRODUCTOS_DE_INICIO_pptx` (slides 13–17).
- El **logo real**: archivo `logo-equifax.png` en la raíz del repo (`cotizadora.github.io/Cotizadora/`).

**Assets que Code debe tener a mano antes de construir:**
- `logo-equifax.png` (logo real — obligatorio, nunca tipografiar).
- Fuentes **Montserrat** (woff2 base64).
- **Fotografías** de personas / empresa / negocio (personas naturales o jurídicas, analítica): **a proveer por Eduardo**, propias o con licencia. No están en el set de archivos actual.

**NO existe entre los archivos disponibles (advertencia importante):**
- **El código fuente HTML/CSS de la plantilla congelada NO está en el proyecto.** Solo está el PDF ya renderizado (`MoraControl_Informes.pdf`). Code debe reconstruir la plantilla a partir de la especificación visual de este documento y del PDF de referencia, **o** partir del script generador que Eduardo conserve fuera de este set de archivos. Confirmar con Eduardo si dispone del generador antes de reconstruir desde cero.
- **Portfolio Monitor no tiene cifras/estadísticas destacadas** (no hay equivalente al "70%" ni al "6×" de Mora Control). **No inventar métricas.**

---

## 1. Objetivo del PDF

Producir una **ficha institucional de producto** de Portfolio Monitor, de una sola pieza, con las mismas 8 páginas, la misma estética y el mismo tono que el resto de la colección Equifax.

- **Propósito comercial:** material de presentación y adjunto (canal Outlook `.eml` y descarga) que el ejecutivo comercial entrega al cliente para explicar qué es Portfolio Monitor, qué problema resuelve, cómo funciona y cómo se contrata.
- **Vida útil larga:** por eso **no lleva precios, valores UF ni comparativas de planes** (regla congelada de toda la colección).
- **Rol del producto:** Portfolio Monitor se posiciona como **producto complementario / de monitoreo continuo** dentro del ciclo de riesgo (evaluar → cobrar → **monitorear**).
- **Nombre de archivo sugerido:** `PortfolioMonitor_Equifax.pdf` (así aparece catalogado en `DOCS_ADJUNTABLES` del cotizador, línea de referencia `PortfolioMonitor_Equifax.pdf`).

---

## 2. Estructura (secuencia narrativa de 8 páginas)

Toda la colección sigue **exactamente esta secuencia**. Cada página = una sección con etiqueta superior + título grande de 2 líneas + contenido. Este es el mapa extraído del PDF de referencia:

| Pág | Etiqueta (superior, roja, mayúsculas) | Título grande (2 líneas) | Contenido |
|-----|----------------------------------------|--------------------------|-----------|
| 1 | — (portada) | Titular a dos tonos | Portada |
| 2 | `EL DESAFÍO` | El dolor del cliente | 4 bloques de problema (ícono + título + descripción) |
| 3 | `LA SOLUCIÓN` | Nombre del producto | Intro + 3 bloques (qué es / qué hace) |
| 4 | `BENEFICIOS` | Promesa de valor | (opcional) stat destacado + grilla 2×2 de beneficios |
| 5 | `CÓMO FUNCIONA` | El proceso | 4 pasos numerados `01`–`04` + nota de cierre |
| 6 | `REQUISITOS Y CONDICIONES` | Contratación | 3 bloques de requisitos + caja destacada de modalidad |
| 7 | `EL IMPACTO` | Resultado final | Grilla 2×2 de impactos |
| 8 | `EL SIGUIENTE PASO` | Cierre / CTA | Intro + llamado a la acción con el ejecutivo |

### Jerarquía por página (patrón repetido)
1. **Header** (todas las páginas de contenido, arriba): logo/wordmark `EQUIFAX®` a la izquierda; en la portada, a la derecha, la bajada de categoría `SOLUCIONES DE COBRANZA Y RIESGO`.
2. **Etiqueta de sección**: texto corto en mayúsculas, color rojo, tamaño pequeño, con acento/línea roja.
3. **Título grande a dos líneas**: Montserrat muy bold; suele mezclar dos tonos (parte en oscuro + parte en rojo).
4. **Bajada / intro**: 1–2 líneas en gris.
5. **Bloques de contenido**: según página (lista de ítems, grilla 2×2, pasos numerados).
6. **Footer** (páginas 2–7): línea separadora fina + nombre del producto a la izquierda en gris + `EQUIFAX®` a la derecha. Página 8 cierra con `EQUIFAX®` + tagline `powering the world with knowledge™`.

### Contenido literal del PDF de referencia (modelo de tono y longitud)

Se transcribe el PDF `MoraControl_Informes.pdf` como **plantilla de referencia** (NO copiar el texto; sirve para calibrar tono, longitud y estructura de cada bloque):

**Pág 1 — Portada**
- Título producto: `MORA CONTROL + INFORMES COMERCIALES`
- Titular (2 tonos): "Cobra lo que te deben." / "Evita a quien no paga."
- Bajada: "Una sola solución integral que combina recuperación y prevención: recupera tus cuentas por cobrar y reduce el riesgo de tu próxima venta."
- Banner rojo inferior: `RECUPERACIÓN + PREVENCIÓN` — "Una plataforma. Todo el ciclo de crédito."

**Pág 2 — EL DESAFÍO** · Título: "La mora te resta por dos caminos." · Intro + 4 bloques:
1. Facturas impagas en tu cartera
2. IVA atrapado en deudas incobrables
3. Cobranza dispersa y sin proceso
4. Riesgo de sumar nuevos morosos

**Pág 3 — LA SOLUCIÓN** · Título: "Mora Control + Informes Comerciales" · Intro + 3 bloques (Recupera / Previene / Alcance).

**Pág 4 — BENEFICIOS** · Título: "Más recuperación, menos riesgo." · Stat destacado `70%` + grilla 2×2 (RECUPERACIÓN / BENEFICIO TRIBUTARIO / COBRANZA INCLUIDA / PREVENCIÓN).

**Pág 5 — CÓMO FUNCIONA** · Título: "Un ciclo que cobra y previene." · Pasos 01–04 + nota de cierre.

**Pág 6 — REQUISITOS Y CONDICIONES** · Título: "Contratación simple y clara." · 3 bloques (Ficha / Cédula RRLL / Escritura) + caja "Un servicio para empresas · Modalidad postpago…".

**Pág 7 — EL IMPACTO** · Título: "Un crédito bajo control." · Grilla 2×2 (Más liquidez / IVA recuperado / Menos morosidad / Menos riesgo futuro).

**Pág 8 — EL SIGUIENTE PASO** · Título: "Toma el control de todo tu ciclo de crédito." · Intro + CTA: "Conversa con tu ejecutivo comercial…".

---

## 3. Estilo

**Tono y redacción**
- Ejecutivo, directo, orientado a beneficio de negocio. Habla de "tu cartera", "tus clientes".
- Titulares cortos, potentes, a dos líneas. Frecuente el contraste a dos tonos (oscuro + rojo).
- Bloques: **título en negrita corto (2–5 palabras) + una descripción de una sola frase** en gris.
- Longitud contenida: nada de párrafos largos. La página respira con espacio en blanco.
- Sobriedad ante material escaso: si un dato no existe, **no se rellena con invención**.

**Identidad visual / marca**
- **Tipografía: Montserrat exclusivamente** (pesos Ultra-Bold, Bold, Semi-Bold, Medium, Regular). Embebida como woff2 base64.
- **Paleta (monocromo rojo, verificada en el render):**
  - Rojo primario Equifax: **`#9b1c2e`** (rojo/burdeos; dominante muestreado ≈ `#981830`).
  - Rojo de acento en bullets de "situaciones": `#c0392b`.
  - Oscuro de títulos: `#1a1a1a`.
  - Texto de cuerpo (gris): `#333`.
  - Línea/borde/tinte rosado claro: `#e3c9cd`.
  - Fondo de página: blanco.
  - **No se usa verde ni otros colores** en los PDF (el verde `#1f9d55` que aparece en el `index.html` es solo para la UI del cotizador, NO para los PDF).
- **Formato de página: A4 vertical, 595.276 × 841.89 pt.**
- **Consistencia:** el logo se renderiza con bounding box ajustado (recorte por umbral alfa). Header/footer idénticos en todas las páginas de contenido.
- **Motor: WeasyPrint (HTML → PDF).**

**Fotografías / imágenes (indicación de Eduardo)**
- **La ficha de Monitor SÍ debe incorporar imágenes/fotos bien ubicadas:** fotos de **personas, empresa y escenas de negocio** (contexto profesional, análisis, dashboards). Aportan cercanía y contexto comercial.
- **Nota de coherencia:** el PDF de referencia `MoraControl_Informes.pdf` no incluye fotos (0 imágenes raster verificadas). La incorporación de fotografías en Monitor es **indicación expresa de Eduardo** para esta pieza; confirmar con él si el resto de la colección se actualizará al mismo criterio.
- **Referencia de estilo fotográfico:** las slides 14–15 del PPTX muestran el tratamiento buscado (fotos recortadas en círculo, paneles laterales, mano usando tablet con analítica). **NO reutilizar esas fotos internas del PPTX** (son material "INTERNO"); usar el **estilo/ubicación**, con imágenes propias o con licencia.
- **Ubicación:** integradas al layout (paneles laterales, recortes circulares, franjas), nunca sueltas ni decorativas sin propósito. Deben respetar la paleta y no competir con los titulares.
- **Origen de las fotos:** el proyecto no contiene una biblioteca de fotos localizada; **Eduardo debe proveer o autorizar las imágenes** (propias o stock con licencia). No fabricar/inventar imágenes que impliquen datos o clientes reales.

**Logo Equifax (regla crítica de Eduardo)**
- **NUNCA tipografiar el logo con fuentes.** No escribir "EQUIFAX" en Montserrat ni en ninguna fuente para simular el logo.
- **Usar siempre el logo real:** archivo **`logo-equifax.png`** (raíz del repo `cotizadora.github.io/Cotizadora/`; el mismo que usan el cotizador, Gmail y Outlook).
- Tratamiento en la colección: recorte con **bounding box ajustado por umbral alfa**. Sobre fondos oscuros/rojos (portada) se invierte a blanco (`filter: brightness(0) invert(1)`), como en el cotizador.
- **Advertencia:** el PDF de referencia parece tener el wordmark tipografiado (no se detectó imagen raster) — ese es justamente el error a evitar. En Monitor, incrustar `logo-equifax.png`.

---

## 4. Información del producto Monitor (Portfolio Monitor)

> Todo lo siguiente proviene de fuentes oficiales del proyecto. Se marca el origen. **No inventar nada fuera de esto.**

### 4.1 Definición oficial (fuente: PPTX, slide 14)
"Es una herramienta que permite el análisis, monitoreo y control, de personas físicas y jurídicas, para entender la situación financiera y comercial, con el fin de definir acciones comerciales."

Tres capacidades núcleo (slide 14):
- Permite la revisión periódica de la cartera de clientes.
- Potencia clientes con alto potencial y limita clientes con mal comportamiento financiero.
- Identifica variaciones en situaciones de morosidad de los clientes.

### 4.2 Beneficios — "Desde Portfolio Monitor se podrá" (fuente: PPTX, slide 15)
- Tener personas naturales o jurídicas en seguimiento de forma individual o masiva.
- Ver la evolución de indicadores analíticos orientados a riesgo y marketing sobre las personas consultadas.
- Configurar y monitorear distintos tipos de alertas.
- Consultar reportes desde la plataforma. **(marcado como "*Próximamente*" en la fuente — usar con cautela o con la nota "próximamente"; no presentarlo como disponible.)**
- Frecuencias de actualización de indicadores: **semanal, quincenal o mensual, según contrato.**

### 4.3 Features destacados (fuente: PPTX, slide 16 — "Alertas Comerciales")
- Capacidad de generar carteras de grandes volúmenes.
- Indicadores analíticos que permiten detectar tendencias.
- Generación de carteras estáticas o dinámicas.
- Switch para cambiar entre visualizar información de personas y empresas.
- Filtros para visualizar información específica.

### 4.4 Situaciones / dolores del cliente (fuente: `index.html`, `SOL_SIT.pfm`)
- Buenos clientes que se deterioran sin que usted se entere.
- Cartera que cambia de riesgo y nadie la vigila.
- Morosidad detectada cuando ya es tarde.

### 4.5 Beneficios sintéticos (fuente: `index.html`, `SOL_BENE.pfm`)
- Anticipe la morosidad.
- Proteja su cartera vigente.
- Potencie a sus mejores clientes.

### 4.6 Características / bullets del cotizador (fuente: `index.html`)
`PITEMS.pfm` (versión corta, WhatsApp):
1. Monitoreo masivo o individual de cartera
2. Alertas automáticas ante cambios financieros
3. Indicadores analíticos de riesgo y marketing
4. Carteras estáticas o dinámicas configurables
5. Actualización semanal, quincenal o mensual

`PITEMS_MAIL.pfm` (versión enriquecida, Gmail/Outlook — incluye las 5 anteriores +):
6. Revisión periódica de toda la cartera
7. Potencia buenos clientes, limita los riesgosos
8. Detección temprana de deterioro financiero
9. Seguimiento de personas y empresas
10. Reevaluación al renovar líneas de crédito

### 4.7 Preguntas de venta (fuente: PPTX, slide 17 — producto complementario)
Insumo para redactar la página EL DESAFÍO / EL SIGUIENTE PASO, no necesariamente literal:
- ¿Tiene conocimiento del comportamiento financiero de su cartera de clientes actualmente?
- ¿Está monitoreando su cartera constantemente?
- En caso de renovar líneas de crédito o facilidades de pago, ¿cómo realiza la reevaluación?
- ¿Sabe si sus clientes han presentado crecimiento o decrecimiento en el tiempo?
- ¿Potencia a sus buenos clientes?

### 4.8 Metadatos del cotizador
- Badge / categoría: `MONITOREO` (`PINFO.pfm`).
- Nombre: `Portfolio Monitor`.
- Ícono en la UI: 📡 (solo referencia; los PDF no usan emojis).
- Público objetivo (inferido de la fuente, no textual): empresas con cartera de clientes activa —personas naturales y jurídicas— que otorgan crédito y necesitan vigilar su evolución. **Confirmar con Eduardo si se requiere afinar el segmento.**

### 4.9 Datos que NO existen (no inventar)
- **Sin cifras/estadísticas destacadas** (no hay "70%", "6×", ni porcentajes de detección).
- **Sin precios, planes ni valores UF** (regla de la colección).
- **Requisitos de contratación específicos de Monitor: NO documentados en la fuente.** Para la página 6, reutilizar el patrón genérico de contratación de la colección (ficha de contratación + cédula de representantes legales + escritura de la empresa + modalidad) **solo si Eduardo lo confirma**; de lo contrario, marcarlo como pendiente. **No inventar requisitos.**
- El "beneficio tributario / recuperación de IVA" es **exclusivo de Mora Control**: **NO trasladarlo** a Monitor.

---

## 5. Similitudes con los demás productos (mantener idéntico)

- **Formato:** A4 vertical, 8 páginas, WeasyPrint, Montserrat embebida.
- **Secuencia narrativa** de 8 páginas (sección 2) sin alterar el orden ni las etiquetas.
- **Paleta y tipografía** (sección 3) exactas.
- **Header/footer** en todas las páginas de contenido, con `EQUIFAX®` y el nombre del producto; página 8 con tagline `powering the world with knowledge™`.
- **Patrón de bloques:** ícono/acento rojo + título negrita corto + descripción de una frase.
- **Logo:** siempre el archivo real `logo-equifax.png`, nunca tipografiado (ver regla en Estilo).
- **Reglas congeladas:** sin precios, sin UF, sin comparativas de planes; sobriedad ante material escaso; contenido solo de fuentes oficiales verificadas.
- **Logo:** mismo tratamiento (recorte con bounding box ajustado por umbral alfa).

---

## 6. Elementos específicos de Monitor (contenido exclusivo)

- **Titular a dos tonos** (portada) centrado en la idea de **vigilancia continua de la cartera** (ej. anticipar el deterioro / no enterarse tarde). Redactar a partir de 4.1, 4.4 y 4.5. *No copiar los titulares de Mora Control.*
- **EL DESAFÍO:** 4 bloques construidos desde 4.4 y 4.7 → el riesgo de una cartera sin vigilancia (buenos clientes que se deterioran, cambios de riesgo no detectados, morosidad tardía, falta de reevaluación al renovar crédito).
- **LA SOLUCIÓN:** definición oficial 4.1 + las 3 capacidades núcleo (revisión periódica / potenciar-limitar / detectar variaciones).
- **BENEFICIOS:** grilla desde 4.2 + 4.5. Como **no hay stat numérico**, la página 4 debe funcionar **sin** el módulo de cifra destacada (o sustituirlo por un enunciado de valor cualitativo). *No fabricar un porcentaje.*
- **CÓMO FUNCIONA:** 4 pasos derivados del flujo real: seguir personas/empresas (individual o masivo) → configurar alertas → ver indicadores/tendencias → reevaluar y definir acciones comerciales. Base en 4.2, 4.3.
- **EL IMPACTO:** grilla 2×2 de resultados (anticipar morosidad / proteger cartera vigente / potenciar buenos clientes / decisiones comerciales informadas). Base en 4.5, 4.1.
- **Frecuencias de actualización** (semanal/quincenal/mensual, según contrato): dato distintivo de Monitor, útil en LA SOLUCIÓN o REQUISITOS.
- **Diferenciadores propios:** switch personas/empresas, carteras estáticas o dinámicas, alertas configurables, indicadores de riesgo **y marketing** (matiz que otros productos no tienen).
- **Posicionamiento complementario:** cierra el ciclo evaluar → cobrar → **monitorear**; encaja con el bundle `combo3` (RI + Mora Control + Portfolio Monitor).

---

## 7. Recomendaciones para Code

1. **Antes de escribir código, confirmar con Eduardo si existe el script/plantilla generador** de la colección (no está en este set de archivos). Si existe, **reutilizarlo** y solo cambiar el contenido (principio: reutilizar primero, extender después, inventar nunca). Si no existe, reconstruir la plantilla desde el PDF de referencia + esta especificación.
2. **Motor:** WeasyPrint (HTML → PDF). Página A4 vertical (595.276 × 841.89 pt).
3. **Tipografía:** Montserrat embebida como woff2 base64 (mismos pesos del PDF de referencia). **Ninguna otra fuente.**
4. **Paleta exacta:** rojo `#9b1c2e` (acento `#c0392b`), títulos `#1a1a1a`, cuerpo `#333`, tinte/borde `#e3c9cd`, fondo blanco. **Sin verde ni otros colores.**
5. **Respetar la secuencia de 8 páginas** y el patrón header/footer idénticos.
6. **Redactar todo el contenido a partir de la sección 4** (fuentes oficiales). **No inventar** cifras, requisitos ni claims. Mantener el tono ejecutivo y la longitud corta (título negrita + una frase).
7. **Página 4 sin stat numérico** para Monitor (o stat cualitativo); **no** trasladar métricas ni el beneficio tributario de Mora Control.
8. **"Consultar reportes"** → tratar como "próximamente" o excluir; no presentar como funcionalidad ya disponible.
9. **Página 6 (Requisitos):** confirmar con Eduardo antes de reutilizar el patrón genérico de contratación; **no** inventar requisitos específicos de Monitor.
10. **Logo:** **usar el archivo real `logo-equifax.png`** (raíz del repo), con recorte por bounding box (umbral alfa) e inversión a blanco sobre fondos oscuros. **Prohibido tipografiar "EQUIFAX" con fuentes.**
10b. **Imágenes/fotos:** incorporar fotografías bien ubicadas (personas, empresa, escenas de negocio, analítica) integradas al layout —estilo slides 14–15 del PPTX (recortes circulares, paneles laterales)—. **No reutilizar las fotos internas del PPTX**; usar imágenes propias o con licencia provistas por Eduardo.
11. **Nombre de salida:** `PortfolioMonitor_Equifax.pdf` (coincide con `DOCS_ADJUNTABLES`).
12. **Validación final:** revisar que sean 8 páginas A4, que solo aparezcan las fuentes Montserrat (`pdffonts`) y que no haya precios/UF ni colores fuera de paleta. Comparar visualmente contra `MoraControl_Informes.pdf`.

---

## 8. Restricciones (heredadas del proyecto)

- **Edición aditiva:** no refactorizar ni reordenar plantilla/código que ya funcione.
- **Sin invención de contenido comercial:** todo debe estar respaldado en fuente oficial (sección 4).
- **Sin precios, UF ni comparativas de planes** en el PDF.
- **Sin simulación:** ningún elemento visual debe implicar una funcionalidad que el producto no tenga.
- **Aprobación por fases:** fase editorial/diseño → aprobación explícita de Eduardo → implementación.
- **Comunicación:** español, formato ejecutivo (Función / Cambio / Riesgo durante implementación).

---

## 9. Fuentes usadas para este documento

- `MoraControl_Informes.pdf` — PDF de referencia de la colección (estructura, estilo, paleta).
- `PRODUCTOS_DE_INICIO_pptx` — material oficial Equifax, slides 13–17 (contenido de Portfolio Monitor).
- `index.html` — cotizador CotizadorGo: variables `PINFO.pfm`, `PITEMS.pfm`, `PITEMS_MAIL.pfm`, `SOL_SIT.pfm`, `SOL_BENE.pfm`, catálogo `DOCS_ADJUNTABLES`.
