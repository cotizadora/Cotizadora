# Contexto para retomar con Claude

Pega este archivo al empezar una sesión nueva para que Claude sepa dónde quedamos.
Última actualización: 06-10-2026.

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

## 1. Cotizador Dental Bci (extensión) — v3.1.2

- **En mi PC:** `Documentos\DENTAL\extension`
- **Paquete:** `DENTAL/extension-cotizador-dental.zip`
- **Versión web:** `DENTAL/cotizador-web.html`, generada desde los archivos de la extensión.

Qué hace:
- Popup en dos columnas: cotización a la izquierda y script de venta a la derecha, sin manija de ancho. Desde la v3.0.3 va dentro de un marco azul grisáceo con borde fino, esquinas redondeadas y sombra, para que no se pierda sobre el blanco de Vicidial. Desde la v3.0.4 cada módulo es una tarjeta redondeada con su color según jerarquía: cliente (azul), tipificación (menta), plan y cotización (blanco), clínicas (turquesa), guardado (arena), total (azul marino suave); las secciones del script también son tarjetas en contraste Normal. El scroll va dentro de cada columna: el popup no pasa de 800 × 600. Desde la v3.0.9 las cabeceras de las dos columnas son una sola franja azul de igual altura, sin línea divisoria ni barra de desplazamiento arriba, y ambas columnas comparten fondo. Desde la v3.1.1 la tarjeta del cliente queda fija bajo la cabecera al desplazar la columna izquierda.
- Autollenado desde la pantalla de agente de Vicidial: cliente, cargas del FORM, correo, teléfono, comuna, datos de validación y cierre.
- **Apertura del script (v3.0.2):** "Muy buenos días / buenas tardes (según la hora: antes de las 12:00, días), ¿me comunico con [primer nombre y primer apellido del cliente]? Mi nombre es [ejecutivo], llamo desde Bci." Los nombres de Vicidial vienen sin tilde; se reponen las de los nombres y apellidos comunes (Pérez, González, José…).
- **Se abre solo al entrar una llamada (v3.0.5):** cuando cae un lead nuevo en Vicidial, el cotizador se despliega aunque esté en otra pestaña (una vez por cliente; Chrome tiene que estar al frente). Se apaga con la casilla "Abrir solo al entrar una llamada" al pie del cotizador. Requiere Chrome 127 o más nuevo (el PC del trabajo tiene Chrome 154). Desde la v3.0.6 la vigilancia de Vicidial se reconecta sola tras actualizar la extensión (antes había que recargar Vicidial para que se abriera solo).
- **Más rápido (v3.0.7):** el popup aparece de una vez con su ancho final (sin animación al abrir). Al caer una llamada se detecta el lead en ~0,4 s (antes cada 3 s y esperando el nombre), se trae al frente la pestaña de Vicidial y se abre el cotizador; los datos del FORM que llegan después se completan solos en los primeros 10 s sin pisar lo editado a mano.
- **Barra del script compacta + atajos de tipificación (v3.0.8):** la barra del script es una sola fila de íconos (A↓ A↑ letra, 4 muestras de color para el contraste, ¶ ▲ n/82 ▼ lectura guiada). Debajo, 2 filas × 3 botones con las tipificaciones grabadas en ShortCut-Vicidial-GO, leídas de la pestaña de Vicidial (localStorage `vca_states`) sin volver a grabarlas; las pausas no salen. Un clic las deja en cola como el ▶ de ShortCut (escribe `vca2_armed`); otro clic cancela. Muestra las 6 más usadas desde el cotizador. Colores por nombre: rojo (no le interesa, equivocado, ya tiene), ámbar (lo pensará, agendar, buzón), verde (interesado, venta), azul (otros).
- **Cuenta regresiva para tipificar (v3.1.0):** el cotizador también trae el reloj (en `vicidial-captura.js`). Aparece SOLO en la página de Vicidial, arriba a la derecha, al abrirse el formulario de tipificación; no hay que abrir ninguna extensión. Si ShortCut-Vicidial-GO está cargado, se ve su reloj y el del cotizador se oculta (comparten límite `vca_tipif_lim` y posición). Ofrece calibrar cuando el formulario dura más que el límite. Desde cotizador v3.1.2 / ShortCut v1.0.7 aparece bajo los menús y el botón "Cortar y Tipificar", a la izquierda (donde no lo tapa el popup); se arrastra con la manito ✋ y recuerda siempre la posición (`vca_tipif_pos`); doble clic en la manito lo devuelve bajo los menús.
- **📊 Historial de clientes:** planilla tipo Excel con las mismas opciones de la cotizadora de Equifax. Registra cada cliente que cae, permite editar, tipificar y agendar, y hace respaldos automáticos (internos y un archivo diario en `Descargas/DENTAL-respaldos`).
- **UF del día (v3.0.1):** consulta mindicador.cl, api.boostr.cl y findic.cl al mismo tiempo, con 6 s de tope, y usa la primera que responde. Si ninguna responde, pide escribirla a mano; el motivo aparece al pasar el mouse por "no se pudo traer". La versión se ve chica en la barra de la UF.

**Pendiente:** confirmar que la UF carga en el PC del trabajo. Antes se quedaba en "actualizando…". Si falla, mandar captura del motivo para saber si la red de Bci bloquea esos sitios y buscar otra fuente.

## 2. ShortCut-Vicidial-GO (extensión aparte) — v1.1.6

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
- **Cuenta regresiva para tipificar (v1.0.5):** Vicidial da ~30 s desde que se entra al formulario de tipificación (no desde que se corta). Al abrirse el formulario aparece un reloj (arriba a la derecha, arrastrable): verde, ámbar ≤10 s, rojo ≤5 s, con pitidos. Se apaga al pulsar "Cortar y Tipificar". − / + ajusta el límite (25 s por defecto, se recuerda); clic en el número reinicia. Si el formulario se cierra solo sin tipificar, mide el tiempo real y ofrece usarlo con 2 s de margen.
- **RUT del cliente en GO (v1.0.8, etapa 1):** el puente en Vicidial lee el RUT del cliente en pantalla (campos `rut`+`dv` del FORM o `vendor_lead_code`; si no hay DV aparte y tiene más de 7 caracteres, el último es el DV — misma regla que el cotizador, ej. 107038973 = 10.703.897-3; con 7 o menos se calcula) y lo deja en `chrome.storage.local.vcaCliente`; en GO se copia a `localStorage.vca_cliente`. Al grabar, si se escribe en un campo ese RUT (o la palabra RUT), el paso queda `dyn:'rut'` con su formato, y al repetir usa el RUT del cliente del momento. El panel muestra "🪪 Cliente en Vicidial: …". Desde la v1.0.9 el panel conecta solo (sin recargar) las pestañas de Vicidial/GO que no responden, para que la grabación llegue a todas. Desde la v1.1.0, al apretar Grabar el panel busca las pestañas en ese momento (antes, recién abierto, a veces no había reconocido GO y la orden sólo llegaba a Vicidial: "No se capturó ningún clic"), y una pestaña que se conecte durante la grabación se suma sola. Desde la v1.1.1: GO borra su localStorage (al iniciar sesión en go.bciseguros.cl/login): la grabación en curso y los atajos se respaldan en chrome.storage (`vcaSitio:<sitio>`) y el motor guarda la grabación en memoria; se reponen solos. El panel muestra clics por página mientras graba. Las contraseñas nunca se graban (que las complete Chrome). Grabar en GO no depende de Vicidial. Pendiente etapa 2: que un atajo siga después de un cambio de página (ej. tras "Ingresar"). Objetivo: grabar en go.bciseguros.cl/dashboard/go el camino ☰ → Nueva Oportunidad → Rut cliente (campo `#rut-cliente`, Angular 11 + PrimeNG) → CREAR. Pendiente: grabar el ingreso con usuario y la configuración de perfil (etapa 2) y luego llevarlo al cotizador.
- **Repetir en GO (v1.1.5):** el ▶ va a la pestaña de GO que se está mirando (con dos pestañas abiertas iba a la otra: "no hace nada"). GO (Angular/PrimeNG) renumera clases como `ng-tns-c124-3` al reabrir menús y las rutas grabadas dejaban de calzar: ahora se ignoran las clases `ng-*` y de estado, también en atajos ya grabados, y los botones sólo con ícono se buscan por su ícono. En GO no se reintenta con Escape ni volviendo al ☰; si un paso no aparece en 15 s, el atajo se detiene y el panel avisa en rojo qué paso faltó (`vca_fallo`).
- **Grabación que no se detenía (v1.1.6):** con varias pestañas de GO, una pestaña dormida (o el respaldo) reponía la grabación ya detenida/guardada y el panel mostraba "Grabando…" sin parar, aun tras reiniciar. Ahora el puente anota en `vca_learn_marcas` (página) y `vcaSitio:<sitio>:marcas` (chrome.storage) el `ts` de la grabación detenida (`stop`) y terminada (`fin`); ninguna copia con `ts` ≤ `fin` se repone, y con `ts` ≤ `stop` queda detenida. Sólo la página principal repone desde la memoria del motor.
- **📋 Copiar registro** (en ⚙️ Configuración): copia el registro para mandárselo a Claude si algo falla.

Problemas que se arreglaron:
- **Formulario de otro servidor:** el "Formulario de Tipificación" (Corte Llamadas BCISALUR, en la pestaña SCRIPT) viene de otro servidor dentro de un marco. Hasta la 1.0.1 sus 3 menús y "Cortar y Tipificar" no se grababan. Desde la 1.0.2 sí, porque la extensión corre dentro de ese marco y se comunica con la página por mensajes.
- **Motor viejo pegado (v1.0.3):** al actualizar, Vicidial seguía con el motor anterior hasta recargar. Ahora el motor nuevo se conecta solo al abrir el panel ⚡ y reemplaza al viejo. Si no lo logra, el panel muestra un aviso.
- **Aviso que parpadeaba (v1.0.4):** si en la página seguía vivo el motor 1.0.2, éste seguía anotando su versión y el aviso "Conectando el motor" aparecía y desaparecía. Ahora el panel pregunta directo qué motor corre y usa claves nuevas que la 1.0.2 no toca.
- **Botones-imagen de Vicidial:** son imágenes sin texto. Ahora se reconocen por su acción (onclick), para que nunca se apriete otro botón por error.

**Pendiente:**
1. Instalar la v1.1.6 con INSTALAR.bat (si el panel sigue en "Grabando…" de antes: ■ Detener y "Descartar" una vez). Probar el atajo de GO con ▶ desde la misma pantalla donde se grabó.
2. **Borrar los atajos de tipificación antiguos** ("NO LE INTERESA\*\*\*", "no le interesa\*\*\*\*", BUZÓN si es del formulario) y grabarlos de nuevo. Los antiguos no tienen los menús.
3. Al grabar, el contador debe subir con cada menú. Al final el atajo debe decir 6 pasos (5 sin "Colgar").
4. Probarlo en una llamada real con ▶.

Cuando funcione bien, decidir si se deja en la versión principal (con el merge del pull request #1).

## Notas para Claude

- Esta sesión corre en la nube y no puede tocar archivos de mi PC. Los cambios se suben a la rama y yo ejecuto INSTALAR.bat.
- Desde la nube no hay salida a mindicador.cl, boostr.cl, findic.cl ni al Vicidial real: se prueba con copias locales (Playwright + Chromium + servidor HTTPS falso con `--host-resolver-rules`).
- No hacer push a `main`: se publica sólo con el merge del pull request.
