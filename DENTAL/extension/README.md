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
  - **Edad:** escribe los años y listo. Sirve para preguntar al vuelo.
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
