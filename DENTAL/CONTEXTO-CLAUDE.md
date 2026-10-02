# Contexto para retomar con Claude

Pega este archivo al empezar una sesión nueva para que Claude sepa dónde quedamos.
Última actualización: 02-10-2026.

## Quién soy y cómo trabajo

- Vendo el **Seguro Dental Modular Bci** en un call center (Vicidial, campaña BCIDENTA).
- **Escríbeme siempre en español.** No entiendo inglés.
- **Pon siempre el número de versión en el título** de cada extensión, para saber si estoy usando la última.
- **Nunca inventes texto del script de venta.** Usa sólo el material que te di.
- **No recargues Vicidial solo:** recargar la pantalla del agente puede cortar la llamada o sacarme de la sesión.
- Pruebo en el PC del trabajo. Las versiones nuevas me llegan con **INSTALAR.bat** y después aprieto 🔄 en `chrome://extensions`.

## Dónde está todo

- **Repositorio:** `cotizadora/Cotizadora`, rama `claude/age-calculator-insurance-plans-tbygz8`, carpeta `DENTAL/`.
- **INSTALAR.bat:** descarga todo lo de `DENTAL/` de esa rama a `Documentos\DENTAL` en mi PC. No borra nada mío.
- **Pull request abierto:** [cotizadora/Cotizadora#1](https://github.com/cotizadora/Cotizadora/pull/1). Al hacer merge, GitHub Pages publica la página web en https://cotizadora.github.io/Cotizadora/DENTAL/cotizador-web.html. Todavía no lo he aprobado.

## 1. Cotizador Dental Bci (extensión) — v3.0.4

- **En mi PC:** `Documentos\DENTAL\extension`
- **Paquete:** `DENTAL/extension-cotizador-dental.zip`
- **Versión web:** `DENTAL/cotizador-web.html`, generada desde los archivos de la extensión.

Qué hace:
- Popup en dos columnas: cotización a la izquierda y script de venta a la derecha, sin manija de ancho. Desde la v3.0.3 va dentro de un marco azul grisáceo con borde fino, esquinas redondeadas y sombra, para que no se pierda sobre el blanco de Vicidial. Desde la v3.0.4 cada módulo es una tarjeta redondeada con su color según jerarquía: cliente (azul), tipificación (menta), plan y cotización (blanco), clínicas (turquesa), guardado (arena), total (azul marino suave); las secciones del script también son tarjetas en contraste Normal. El scroll va dentro de cada columna: el popup no pasa de 800 × 600.
- Autollenado desde la pantalla de agente de Vicidial: cliente, cargas del FORM, correo, teléfono, comuna, datos de validación y cierre.
- **Apertura del script (v3.0.2):** "Muy buenos días / buenas tardes (según la hora: antes de las 12:00, días), ¿me comunico con [primer nombre y primer apellido del cliente]? Mi nombre es [ejecutivo], llamo desde Bci." Los nombres de Vicidial vienen sin tilde; se reponen las de los nombres y apellidos comunes (Pérez, González, José…).
- **📊 Historial de clientes:** planilla tipo Excel con las mismas opciones de la cotizadora de Equifax. Registra cada cliente que cae, permite editar, tipificar y agendar, y hace respaldos automáticos (internos y un archivo diario en `Descargas/DENTAL-respaldos`).
- **UF del día (v3.0.1):** consulta mindicador.cl, api.boostr.cl y findic.cl al mismo tiempo, con 6 s de tope, y usa la primera que responde. Si ninguna responde, pide escribirla a mano; el motivo aparece al pasar el mouse por "no se pudo traer". La versión se ve chica en la barra de la UF.

**Pendiente:** confirmar que la UF carga en el PC del trabajo. Antes se quedaba en "actualizando…". Si falla, mandar captura del motivo para saber si la red de Bci bloquea esos sitios y buscar otra fuente.

## 2. ShortCut-Vicidial-GO (extensión aparte) — v1.0.4

- **En mi PC:** `Documentos\DENTAL\ShortCut-Vicidial-GO`. Se carga en Chrome con "Cargar descomprimida".
- **En el repositorio:** `DENTAL/ShortCut-Vicidial-GO/`
- Basada en mi ShortCut-VocalCRM 4.1.0. Funciona en `vicidial.recaall.simtastic.cl` y `go.bciseguros.cl`.

Qué hace:
- Graba una secuencia de clics una vez y la repite con ▶:
  - **Vicidial:** pausas con código (Baño, Break, Colación…), disposiciones y la tipificación del formulario.
  - **GO Bci:** tipificaciones.
- **Vicidial:** si estoy en llamada, el atajo queda en cola (⏳) y se aplica apenas se puede. ■ lo cancela.
- **GO:** se aplica en el momento, sin cola.
- **Reloj de pausa:** aparece abajo a la derecha con el nombre de la pausa.
- **📋 Copiar registro** (en ⚙️ Configuración): copia el registro para mandárselo a Claude si algo falla.

Problemas que se arreglaron:
- **Formulario de otro servidor:** el "Formulario de Tipificación" (Corte Llamadas BCISALUR, en la pestaña SCRIPT) viene de otro servidor dentro de un marco. Hasta la 1.0.1 sus 3 menús y "Cortar y Tipificar" no se grababan. Desde la 1.0.2 sí, porque la extensión corre dentro de ese marco y se comunica con la página por mensajes.
- **Motor viejo pegado (v1.0.3):** al actualizar, Vicidial seguía con el motor anterior hasta recargar. Ahora el motor nuevo se conecta solo al abrir el panel ⚡ y reemplaza al viejo. Si no lo logra, el panel muestra un aviso.
- **Aviso que parpadeaba (v1.0.4):** si en la página seguía vivo el motor 1.0.2, éste seguía anotando su versión y el aviso "Conectando el motor" aparecía y desaparecía. Ahora el panel pregunta directo qué motor corre y usa claves nuevas que la 1.0.2 no toca.
- **Botones-imagen de Vicidial:** son imágenes sin texto. Ahora se reconocen por su acción (onclick), para que nunca se apriete otro botón por error.

**Pendiente:**
1. Instalar la v1.0.4 con INSTALAR.bat.
2. **Borrar los atajos de tipificación antiguos** ("NO LE INTERESA\*\*\*", "no le interesa\*\*\*\*", BUZÓN si es del formulario) y grabarlos de nuevo. Los antiguos no tienen los menús.
3. Al grabar, el contador debe subir con cada menú. Al final el atajo debe decir 6 pasos (5 sin "Colgar").
4. Probarlo en una llamada real con ▶.

Cuando funcione bien, decidir si se deja en la versión principal (con el merge del pull request #1).

## Notas para Claude

- Esta sesión corre en la nube y no puede tocar archivos de mi PC. Los cambios se suben a la rama y yo ejecuto INSTALAR.bat.
- Desde la nube no hay salida a mindicador.cl, boostr.cl, findic.cl ni al Vicidial real: se prueba con copias locales (Playwright + Chromium + servidor HTTPS falso con `--host-resolver-rules`).
- No hacer push a `main`: se publica sólo con el merge del pull request.
