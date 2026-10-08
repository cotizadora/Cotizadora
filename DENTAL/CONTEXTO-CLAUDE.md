# Contexto para retomar con Claude

Pega este archivo al empezar una sesión nueva para que Claude sepa dónde quedamos.
Última actualización: 07-10-2026.

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

## 1. Cotizador Dental Bci (extensión) — v3.1.6

- **En mi PC:** `Documentos\DENTAL\extension`
- **Paquete:** `DENTAL/extension-cotizador-dental.zip`
- **Versión web:** `DENTAL/cotizador-web.html`, generada desde los archivos de la extensión.

Qué hace:
- Popup en dos columnas: cotización a la izquierda y script de venta a la derecha, sin manija de ancho. Desde la v3.0.3 va dentro de un marco azul grisáceo con borde fino, esquinas redondeadas y sombra, para que no se pierda sobre el blanco de Vicidial. Desde la v3.0.4 cada módulo es una tarjeta redondeada con su color según jerarquía: cliente (azul), tipificación (menta), plan y cotización (blanco), clínicas (turquesa), guardado (arena), total (azul marino suave); las secciones del script también son tarjetas en contraste Normal. El scroll va dentro de cada columna: el popup no pasa de 800 × 600. Desde la v3.0.9 las cabeceras de las dos columnas son una sola franja azul de igual altura, sin línea divisoria ni barra de desplazamiento arriba, y ambas columnas comparten fondo. Desde la v3.1.1 la tarjeta del cliente queda fija bajo la cabecera al desplazar la columna izquierda.
- **Dos botones fijos (v3.1.5):** en la tarjeta del cliente, "1 · Logueo GO" (fuerza el login) y "2 · Evaluar medio de pago" (usa GO abierto), visibles a la vez. Cada uno usa el atajo de ShortCut con su nombre (LOGUEO GO / EVALUAR MEDIO DE PAGO), si no uno parecido; con ✏️ se cambia el nombre del botón y el atajo (se guarda en `chrome.storage.local.prefGo`). Nunca usan el mismo atajo los dos. Reemplaza al 🚀 único de la v3.1.3.
- **DV 0 (v3.1.6):** el DV "0" de Vicidial se descartaba como vacío (`val()` ignora los "0") y 12780633 + DV 0 salía 1.278.063-3. Ahora el DV se lee aparte; sin DV, 9 caracteres traen el DV al final y con 8 sólo si el último cuadra con el módulo 11 (`dvRut` en historial-db.js).
- **RUT en la tarjeta (v3.1.4):** se muestra sin puntos y con guion (12199895-5) con un botón 📋 que lo copia (también en la versión web).
- **🚀 Cotizar en GO (v3.1.3):** en la tarjeta del cliente, un botón con el nombre del flujo de ShortCut (por defecto el más nuevo que pasa por el multicotizador; si hay varios, se elige en una lista). Al apretarlo copia el RUT sin puntos y con guion (ej. 12199895-5) y le pide a ShortCut que ejecute el flujo. Casilla "Abrir siempre el login de GO" (marcada por defecto, se recuerda): parte siempre en el login (navega la pestaña de GO o la abre); desmarcada, usa GO abierto y se salta el login si la sesión sigue. Necesita ShortCut 1.2.2 (el cotizador lo encuentra por `localStorage.vca_ext_id` en Vicidial y le habla con `chrome.runtime.sendMessage(id, …)`: `listarFlujos` / `ejecutarFlujo`). No aparece en la versión web.
- Autollenado desde la pantalla de agente de Vicidial: cliente, cargas del FORM, correo, teléfono, comuna, datos de validación y cierre.
- **Apertura del script (v3.0.2):** "Muy buenos días / buenas tardes (según la hora: antes de las 12:00, días), ¿me comunico con [primer nombre y primer apellido del cliente]? Mi nombre es [ejecutivo], llamo desde Bci." Los nombres de Vicidial vienen sin tilde; se reponen las de los nombres y apellidos comunes (Pérez, González, José…).
- **Se abre solo al entrar una llamada (v3.0.5):** cuando cae un lead nuevo en Vicidial, el cotizador se despliega aunque esté en otra pestaña (una vez por cliente; Chrome tiene que estar al frente). Se apaga con la casilla "Abrir solo al entrar una llamada" al pie del cotizador. Requiere Chrome 127 o más nuevo (el PC del trabajo tiene Chrome 154). Desde la v3.0.6 la vigilancia de Vicidial se reconecta sola tras actualizar la extensión (antes había que recargar Vicidial para que se abriera solo).
- **Más rápido (v3.0.7):** el popup aparece de una vez con su ancho final (sin animación al abrir). Al caer una llamada se detecta el lead en ~0,4 s (antes cada 3 s y esperando el nombre), se trae al frente la pestaña de Vicidial y se abre el cotizador; los datos del FORM que llegan después se completan solos en los primeros 10 s sin pisar lo editado a mano.
- **Barra del script compacta + atajos de tipificación (v3.0.8):** la barra del script es una sola fila de íconos (A↓ A↑ letra, 4 muestras de color para el contraste, ¶ ▲ n/82 ▼ lectura guiada). Debajo, 2 filas × 3 botones con las tipificaciones grabadas en ShortCut-Vicidial-GO, leídas de la pestaña de Vicidial (localStorage `vca_states`) sin volver a grabarlas; las pausas no salen. Un clic las deja en cola como el ▶ de ShortCut (escribe `vca2_armed`); otro clic cancela. Muestra las 6 más usadas desde el cotizador. Colores por nombre: rojo (no le interesa, equivocado, ya tiene), ámbar (lo pensará, agendar, buzón), verde (interesado, venta), azul (otros).
- **Cuenta regresiva para tipificar (v3.1.0):** el cotizador también trae el reloj (en `vicidial-captura.js`). Aparece SOLO en la página de Vicidial, arriba a la derecha, al abrirse el formulario de tipificación; no hay que abrir ninguna extensión. Si ShortCut-Vicidial-GO está cargado, se ve su reloj y el del cotizador se oculta (comparten límite `vca_tipif_lim` y posición). Ofrece calibrar cuando el formulario dura más que el límite. Desde cotizador v3.1.2 / ShortCut v1.0.7 aparece bajo los menús y el botón "Cortar y Tipificar", a la izquierda (donde no lo tapa el popup); se arrastra con la manito ✋ y recuerda siempre la posición (`vca_tipif_pos`); doble clic en la manito lo devuelve bajo los menús.
- **📊 Historial de clientes:** planilla tipo Excel con las mismas opciones de la cotizadora de Equifax. Registra cada cliente que cae, permite editar, tipificar y agendar, y hace respaldos automáticos (internos y un archivo diario en `Descargas/DENTAL-respaldos`).
- **UF del día (v3.0.1):** consulta mindicador.cl, api.boostr.cl y findic.cl al mismo tiempo, con 6 s de tope, y usa la primera que responde. Si ninguna responde, pide escribirla a mano; el motivo aparece al pasar el mouse por "no se pudo traer". La versión se ve chica en la barra de la UF.

**Pendiente:** confirmar que la UF carga en el PC del trabajo. Antes se quedaba en "actualizando…". Si falla, mandar captura del motivo para saber si la red de Bci bloquea esos sitios y buscar otra fuente.

## 2. ShortCut-Vicidial-GO (extensión aparte) — v1.2.9

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
- **RUT del cliente en GO (v1.0.8, etapa 1):** el puente en Vicidial lee el RUT del cliente en pantalla (campos `rut`+`dv` del FORM o `vendor_lead_code`; si no hay DV aparte y tiene más de 7 caracteres, el último es el DV — misma regla que el cotizador, ej. 107038973 = 10.703.897-3; con 7 o menos se calcula) y lo deja en `chrome.storage.local.vcaCliente`; en GO se copia a `localStorage.vca_cliente`. Al grabar, si se escribe en un campo ese RUT (o la palabra RUT), el paso queda `dyn:'rut'` con su formato, y al repetir usa el RUT del cliente del momento. El panel muestra "🪪 Cliente en Vicidial: …". Desde la v1.0.9 el panel conecta solo (sin recargar) las pestañas de Vicidial/GO que no responden, para que la grabación llegue a todas. Desde la v1.1.0, al apretar Grabar el panel busca las pestañas en ese momento (antes, recién abierto, a veces no había reconocido GO y la orden sólo llegaba a Vicidial: "No se capturó ningún clic"), y una pestaña que se conecte durante la grabación se suma sola. Desde la v1.1.1: GO borra su localStorage (al iniciar sesión en go.bciseguros.cl/login): la grabación en curso y los atajos se respaldan en chrome.storage (`vcaSitio:<sitio>`) y el motor guarda la grabación en memoria; se reponen solos. El panel muestra clics por página mientras graba. La clave de GO se graba oculta desde la 1.2.3 (ver más abajo). Grabar en GO no depende de Vicidial. Pendiente etapa 2: que un atajo siga después de un cambio de página (ej. tras "Ingresar"). Objetivo: grabar en go.bciseguros.cl/dashboard/go el camino ☰ → Nueva Oportunidad → Rut cliente (campo `#rut-cliente`, Angular 11 + PrimeNG) → CREAR. Pendiente: grabar el ingreso con usuario y la configuración de perfil (etapa 2) y luego llevarlo al cotizador.
- **Repetir en GO (v1.1.5):** el ▶ va a la pestaña de GO que se está mirando (con dos pestañas abiertas iba a la otra: "no hace nada"). GO (Angular/PrimeNG) renumera clases como `ng-tns-c124-3` al reabrir menús y las rutas grabadas dejaban de calzar: ahora se ignoran las clases `ng-*` y de estado, también en atajos ya grabados, y los botones sólo con ícono se buscan por su ícono. En GO no se reintenta con Escape ni volviendo al ☰; si un paso no aparece en 15 s, el atajo se detiene y el panel avisa en rojo qué paso faltó (`vca_fallo`).
- **Grabación que no se detenía (v1.1.6):** con varias pestañas de GO, una pestaña dormida (o el respaldo) reponía la grabación ya detenida/guardada y el panel mostraba "Grabando…" sin parar, aun tras reiniciar. Ahora el puente anota en `vca_learn_marcas` (página) y `vcaSitio:<sitio>:marcas` (chrome.storage) el `ts` de la grabación detenida (`stop`) y terminada (`fin`); ninguna copia con `ts` ≤ `fin` se repone, y con `ts` ≤ `stop` queda detenida. Sólo la página principal repone desde la memoria del motor.
- **Sólo clics de la persona (v1.1.7):** en el PC del trabajo algo hace clics automáticos en Vicidial (posible extensión "MIC ACTIVO"): al grabar aparecía "VICIDIAL (90)" sin tocarlo. Ahora el grabador sólo acepta clics con `isTrusted`, y cambios de menú si son `isTrusted` o vienen ≤1,5 s después de un clic/tecla real (librerías de menús). En las pruebas con Playwright hay que hacer clic en el `<select>` antes de `selectOption`.
- **Atajos que cruzan páginas (v1.2.0):** un atajo sigue tras un cambio de página, en otra pestaña o en otro sitio: GO (login → panel → ☰ → Nueva Oportunidad → RUT → "Continuar cotización") → multicotizadorvida.bciseguros.cl ("Siguiente" × n hasta el medio de pago). Cómo: cada paso grabado lleva `sitio` y `t`; antes de cada clic el motor anota "voy en el paso N" (`vca:pendiente` → bridge → background, `chrome.storage.session.vcaPendiente`, 60 s de vigencia); la página que carga pregunta (`pendienteTomar`) y continúa si el paso que sigue es de su sitio (misma pestaña, o pestaña de otro sitio). Grabación compartida: el panel anota `vcaGrab {ts,on}` y toda página de Vicidial/Bci que se abra se suma; al guardar se juntan los pasos de todas las páginas (también de los respaldos `vcaSitio:*`) ordenados por `t`, sin los de Vicidial si hay pasos de Bci. Entre pasos espera 40 % de lo grabado (400 ms–2,5 s) y no repite el mismo botón antes de 2,5 s. El buscador prefiere controles visibles (varios "Siguiente" ocultos). RUT: un campo con "rut" en id/nombre/placeholder y valor con forma de RUT queda `dyn:'rut'`; el puente repone `vca_cliente` en las páginas de Bci cada 2 s (GO lo borra al iniciar sesión). Sitios: Vicidial y `*.bciseguros.cl`.
- **Flujo completo con un ▶ (v1.2.1):** cada paso guarda `ruta` y `url`. ▶ en un atajo de Bci trae la pestaña al frente o, si no hay, la abre en la URL del primer paso (el panel deja `vcaPendiente` con `sitio:'panel'` y `vence` 3 min). `inicioSegunPantalla`: si la página ya está en una pantalla posterior (sesión abierta), se salta el login. Si el paso es un clic con una clave visible vacía (Chrome no entrega la clave guardada sin gesto), muestra el aviso "Ingresa tu clave…" (sin bloquear clics), espera hasta 3 min a que cambie la pantalla y sigue; si "Ingresar" recarga, sigue la página nueva. El panel lista los atajos de Bci desde el respaldo aunque GO esté cerrado.
- **Pedidos del cotizador (v1.2.2):** el puente deja `localStorage.vca_ext_id = chrome.runtime.id`; `background.js` atiende `onMessageExternal` sólo `listarFlujos` (atajos de Bci desde `vcaSitio:*`) y `ejecutarFlujo {id, forzarLogin}` (arma en la pestaña de GO y la trae al frente; si no hay pestaña o se fuerza el login, deja `vcaPendiente` y navega/abre la URL del primer paso).
- **Clave de GO (v1.2.3, a pedido de Eduardo):** el campo de contraseña SÍ se graba, oculto (`secreto:true`, valor `v1:` + base64 de XOR con una llave fija; no es cifrado fuerte, sólo evita leerla de un vistazo); el registro dice "clave (oculta)" y Exportar la deja vacía. Al repetir se escribe y se aprieta Ingresar: el flujo entra solo. Si un flujo no tiene clave grabada y Chrome la autocompletó (Chrome no la entrega sin un gesto), sale el aviso clicable "👆 Haz clic aquí para entrar…": tras el clic, si la clave aparece, el atajo aprieta Ingresar (botón grabado o uno con "Ingresar/Entrar") y sigue.
- **v1.2.4:** el plazo de un atajo en Bci es de 30 s por tramo y se renueva tras esperar el login (antes 15 s desde el inicio: si la persona tardaba en entrar, el atajo se rendía y quedaba quieto en "Oportunidades"); tras entrar espera hasta 30 s a que aparezca el próximo botón. El aviso de login ya no recibe clics (cualquier clic en la página basta para que Chrome entregue la clave). Si un atajo se detiene, aviso rojo arriba de la página con el paso.
- **v1.2.5:** guardar con el nombre de un atajo existente lo reemplaza (mismo id, color y lugar).
- **v1.2.6:** borrar / renombrar / color / orden de atajos de un sitio sin pestaña abierta (GO cerrado) se aplica al respaldo `vcaSitio:<sitio>` con `statesT`; al abrir la página, si el respaldo es más nuevo que `vca_states_t` de la página, la lista del respaldo reemplaza a la de la página (antes la orden iba a Vicidial y no pasaba nada).
- **v1.2.7:** un ▶ nuevo cancela una ejecución anterior que seguía esperando en esa página (turno; antes se ignoraba y el panel quedaba "⏳ Ejecutando" sin hacer nada). Indicador "▶ nombre · paso N de M" abajo a la izquierda de GO, aviso "✅ listo" al terminar, y en el panel las últimas 4 líneas del registro de GO bajo "Ejecutando…".
- **v1.2.8:** al guardar, botones de nombre rápido "1 · LOGUEO GO" / "2 · EVALUAR MEDIO DE PAGO" (los nombres que buscan los dos botones del cotizador).
- **v1.2.9:** el puente ya no descarta el DV "0" de Vicidial (antes 12780633 + DV 0 llegaba a GO como 1278063-3 → "Rut inválido" y el atajo se detenía esperando "Crear"). Sin DV aparte: 9 caracteres traen el DV; con 8 sólo si el último cuadra con el módulo 11.
- **📋 Copiar registro** (en ⚙️ Configuración): copia el registro para mandárselo a Claude si algo falla.

Problemas que se arreglaron:
- **Formulario de otro servidor:** el "Formulario de Tipificación" (Corte Llamadas BCISALUR, en la pestaña SCRIPT) viene de otro servidor dentro de un marco. Hasta la 1.0.1 sus 3 menús y "Cortar y Tipificar" no se grababan. Desde la 1.0.2 sí, porque la extensión corre dentro de ese marco y se comunica con la página por mensajes.
- **Motor viejo pegado (v1.0.3):** al actualizar, Vicidial seguía con el motor anterior hasta recargar. Ahora el motor nuevo se conecta solo al abrir el panel ⚡ y reemplaza al viejo. Si no lo logra, el panel muestra un aviso.
- **Aviso que parpadeaba (v1.0.4):** si en la página seguía vivo el motor 1.0.2, éste seguía anotando su versión y el aviso "Conectando el motor" aparecía y desaparecía. Ahora el panel pregunta directo qué motor corre y usa claves nuevas que la 1.0.2 no toca.
- **Botones-imagen de Vicidial:** son imágenes sin texto. Ahora se reconocen por su acción (onclick), para que nunca se apriete otro botón por error.

**Pendiente:**
1. Instalar ShortCut v1.2.9 y Cotizador v3.1.6 con INSTALAR.bat, grabar "LOGUEO GO" y "EVALUAR MEDIO DE PAGO" (escribiendo la clave en el login) y usarlos desde los botones 1 y 2 del cotizador.
2. **Borrar los atajos de tipificación antiguos** ("NO LE INTERESA\*\*\*", "no le interesa\*\*\*\*", BUZÓN si es del formulario) y grabarlos de nuevo. Los antiguos no tienen los menús.
3. Al grabar, el contador debe subir con cada menú. Al final el atajo debe decir 6 pasos (5 sin "Colgar").
4. Probarlo en una llamada real con ▶.

Cuando funcione bien, decidir si se deja en la versión principal (con el merge del pull request #1).

## 3. Afiche Urgencia Dental (redes sociales)

- **Enlace para las compañeras:** https://cotizadora.github.io/Cotizadora/afiche/ (GitHub Pages, desde la carpeta `afiche/` de `main`; con mi permiso se publica sólo esa carpeta en main).
- App instalable (Android: botón Instalar; iPhone: Safari → Compartir → Agregar a inicio; no se ofrece si ya está instalada), funciona sin señal, miniatura para WhatsApp (`og.jpg`).
- Base: afiche Uno Salud Dental hecho en ChatGPT (`afiche/base-urgencia.jpg`). Encima: celular en el botón azul (tapa "Contrátalo hoy") y tarjeta con nombre, celular y QR a WhatsApp o llamada. Formatos 1:1, 4:5 y 9:16.
- Prompts para ChatGPT: `DENTAL/redes/PROMPT-URGENCIA-1-PERSONA.md` (incluye uno con zona libre para la tarjeta). Sin logo ni nombre de Bci; sí logo Uno Salud Dental.
- Al cambiar la app: editar en la rama, copiar `afiche/` a main y subir la versión del caché en `afiche/sw.js`.

## Notas para Claude

- Esta sesión corre en la nube y no puede tocar archivos de mi PC. Los cambios se suben a la rama y yo ejecuto INSTALAR.bat.
- Desde la nube no hay salida a mindicador.cl, boostr.cl, findic.cl ni al Vicidial real: se prueba con copias locales (Playwright + Chromium + servidor HTTPS falso con `--host-resolver-rules`).
- No hacer push a `main`: se publica sólo con el merge del pull request.
