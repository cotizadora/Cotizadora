# Extensión Cotizador Dental Bci

Popup para Chrome y Edge. Se escribe la fecha de nacimiento, se elige cuántas
cargas van, y muestra el plan que corresponde y lo que se paga con la UF del día.

## Instalar

No está en la tienda, así que se carga como extensión de desarrollador. Toma un
minuto y sólo se hace una vez.

1. Abre `chrome://extensions` (en Edge: `edge://extensions`).
2. Activa **Modo de desarrollador**, arriba a la derecha.
3. Clic en **Cargar descomprimida**.
4. Elige esta carpeta (`extension`), la que tiene el `manifest.json` adentro.
5. Ancla el icono a la barra con el alfiler, para tenerlo siempre a mano.

Si descargaste el ZIP, descomprímelo primero y apunta a la carpeta que queda.
No sirve seleccionar el ZIP.

## Usar

- **Cargas:** botones 0 a 3. Con eso ya tienes el precio: no hace falta
  ninguna fecha. **El número lo mandas tú**: nada lo cambia solo. Si escribes
  más edades que cargas marcadas, te lo avisa, pero el precio siempre va por
  el número que marcaste.
- **Edad de las cargas:** desplegable, cerrado por defecto. Ábrelo cuando
  necesites verificar a alguien.
  - **Edad:** escríbela, o súbela y bájala con las flechas del campo. También
    con las flechas ↑ ↓ del teclado estando dentro del campo.
  - **Fecha de nacimiento:** si la consigues durante la llamada, escríbela y
    el cálculo pasa a ser exacto. La edad se rellena sola y queda bloqueada;
    para volver a escribirla a mano, borra la fecha.
  - 8 dígitos seguidos, sin separadores: `05032016` se convierte en `05/03/2016`.
- **Veredicto por carga:** dice en qué planes entra.
  - Menor de 14 → sólo Plan 4 Full Niños.
  - De 14 a 23 años y 0 días → entra en Urgencia, Full y Full Niños.
  - 24 años y 0 días o más → no entra en ninguno.
  - Con 23 años o menos de 1 año te pide la fecha, porque con la edad sola no
    alcanza para decidir el borde.
- **Plan:** clic en la fila de la tabla para elegirlo. Sin menores el cliente
  elige entre Urgencia y Full; con un menor de 14 queda forzado el Plan 4 y
  los otros dos se tachan.
- **Copiar:** deja la cotización en el portapapeles, lista para pegar.

## Resumen siempre arriba

Bajo el valor UF hay una franja con lo que se está cotizando en ese momento:
plan, composición del grupo, UF y precio mensual. Parte en Plan Urgencias sin
cargas y cambia sola con cada ajuste, así no hay que mirar abajo para saber
qué se va a leer.

## Envío de la póliza

Dos botones, porque el cierre de la llamada cambia según el cliente:

- **En línea** (por defecto): el cliente tiene cuenta Bci y se le carga la prima
  a su cuenta corriente.
- **Link de pago**: no tiene cuenta Bci. Se le envía el correo con el link, que
  vence en 48 horas.

El script muestra sólo el texto que corresponde, tal como está en el documento
de venta. No hay que acordarse de saltarse el párrafo que no va.

## Buscador de clínicas por comuna

Escribes la comuna y salen las clínicas. La búsqueda es tolerante: da lo mismo
tildes, mayúsculas o la ñ, y aguanta una o dos letras mal escritas. `nunoa`,
`ÑUÑOA` y `nuñua` llegan todas a Ñuñoa; cuando corrige, lo dice ("Entendí
Ñuñoa") para que no quede duda.

Si la comuna no tiene clínica, muestra las más cercanas con la distancia en
kilómetros, siempre que el listado traiga coordenadas. Si no las trae, cae a
las clínicas de la misma región y avisa que no puede ordenarlas por distancia.

**La extensión se entrega sin listado de clínicas.** Una clínica inventada
termina leída a un cliente por teléfono, así que va vacío a propósito y el
buscador lo dice en pantalla.

### Cargar el listado

No hay que editar archivos. Abre **Clínica por comuna**, pincha **pégalo
aquí**, elige la red y pega el listado. Acepta dos formatos:

- **JSON**, con los campos del esquema (`nombre`, `direccion`, `comuna`,
  `region`, `telefono`, `lat`, `lng`).
- **Texto plano**, una línea por clínica separada por `|` en este orden:
  `nombre | dirección | comuna | región | teléfono | lat | lng`

Al cargar te dice cuántas entraron, cuántas traen coordenadas y qué líneas
rechazó con el motivo. Cargar una red no borra la otra, así que puedes pegar
Uno Salud y E-dental por separado y actualizar solo una cuando cambie.

Queda guardado en el navegador y sobrevive a las actualizaciones de la
extensión. **Borrar listado** lo elimina, con confirmación.

Las coordenadas son las que habilitan el orden por distancia. Sin ellas el
buscador funciona igual, pero avisa que no puede ordenar por cercanía.

### Comunas sin clínica

El tercer botón, **Comunas**, carga las comunas de Chile con sus coordenadas:
una por línea, `comuna | región | lat | lng`.

Sirve para el caso más frecuente en la llamada: el cliente vive en una comuna
donde no hay clínica. Con esta lista cargada, en vez de "no encuentro esa
comuna" responde "no hay clínica en Peñalolén, las más cercanas son Macul a
6,3 km y La Florida a 7,8 km".

Rechaza las coordenadas que caen fuera de Chile, para atajar un error de tipeo
antes de que produzca una distancia absurda.

### Ambas redes siempre representadas

Cuando muestra las más cercanas, toma las 3 mejores **de cada red**, no las 5
mejores en total. Si no, una red con sucursales más lejanas no aparecería
nunca, y justamente lo que se necesita es poder decirle al cliente que tiene
opciones de una y de la otra.

Arriba de los resultados hay un conteo por red, para responder de una mirada.

La fecha de captura se muestra bajo los resultados, para saber qué tan viejo es
el dato.

## No se pierde nada al cerrar

El popup de Chrome se cierra cada vez que pinchas fuera, y en una llamada real
hay que salir a buscar datos a otro sistema. Todo lo que escribas se guarda en
el momento y vuelve tal cual al abrir: cargas, edades, fechas, plan elegido y
hasta si el desplegable estaba abierto.

La barra gris de abajo indica a qué hora se guardó. Para empezar con otro
cliente, el botón **Nuevo cliente** borra todo, y pide confirmación antes.

Los datos quedan sólo en ese navegador, en ese equipo. No se suben a ninguna
parte.

**La edad del titular no se pide.** No cambia el plan ni el precio, así que
sólo se miden las cargas contra el corte de 14 años.

La tabla muestra siempre los tres planes para la composición elegida, así que
si el cliente pide otra opción está a la vista.

## Valor UF

Se actualiza solo al abrir el popup, desde `mindicador.cl` (respaldo
`api.boostr.cl`). El último valor queda guardado, así que si un día no hay
conexión sigue funcionando con el último conocido, y lo dice. También se puede
escribir a mano.

La conversión a pesos se hace con aritmética entera, sin redondeos: abajo
aparece el cálculo exacto con todos sus decimales.

## Cambiar las tarifas

Están al inicio de `popup.js`, en el objeto `PLANES`, en centésimas de UF
(0,43 UF se escribe `43`). Después de editar, vuelve a `chrome://extensions` y
pulsa recargar en la tarjeta de la extensión.

Las reglas de edad están justo debajo, en `REGLAS`.

De dónde sale cada cifra: `../PRODUCTO.md`.
