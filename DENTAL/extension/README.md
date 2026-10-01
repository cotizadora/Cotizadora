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

- **Al abrir** se cotiza al titular solo, en Plan Urgencias.
- **Tiene cargas:** marca la casilla sólo si el cliente quiere sumar
  adicionales. Ahí aparece el número de cargas (1 a 3) y una fila de edad por
  cada una. Sin la casilla no se pide ninguna edad.
- **Edad de cada carga:** escríbela, o súbela y bájala con las flechas del
  campo o del teclado. Si consigues la fecha de nacimiento (8 dígitos
  seguidos, `05032016`), el cálculo pasa a ser exacto.
- **Veredicto por carga:**
  - Menor de 14 → sólo Plan 4 Full Niños.
  - De 14 a 23 años y 0 días → entra en Urgencias, Full y Full Niños.
  - 24 años y 0 días o más → no entra en ninguno.
  - Con 23 años o menos de 1 año pide la fecha, porque la edad sola no basta.
- **Plan:** clic en la fila. Sin menores se puede subir a Full; con un menor
  de 14 queda forzado el Plan 4 y los otros se tachan.
- **Script:** clic en el **nombre** del plan y se despliega a la derecha.
- **Copiar:** deja la cotización en el portapapeles.
- **Nuevo cliente:** dos toques. Deja todo en cero: titular solo, Plan
  Urgencias, sin cargas, sin comuna, envío en línea.

## Sucursales por comuna

Escribe la comuna del cliente y la extensión lee, en ese momento:

- **Uno Salud:** la página de esa comuna en `unosalud.cl/region-comuna/`.
- **i-dental:** el listado de clínicas de `e-dentalsys.com`.

Muestra las sucursales de cada red con nombre, dirección, teléfono y horario
cuando el sitio los trae, y un enlace a la fuente.

- La búsqueda tolera tildes, mayúsculas, la ñ y errores de tipeo. Si lo
  escrito calza con varias comunas (`las c`), ofrece las opciones.
- La lista de comunas sale del propio sitio de Uno Salud, así que funciona
  aunque la dirección de la página no sea el nombre de la comuna
  (Valparaíso es `rv-rv`).
- Lo leído se guarda un día. La segunda búsqueda de la misma comuna es
  instantánea y no vuelve a consultar el sitio. "Volver a leer" fuerza una
  lectura nueva.
- Si i-dental no indica la comuna en cada clínica y sólo las agrupa bajo un
  título, lo avisa y pide confirmar la dirección.

**Si una red no muestra resultados y debería**, el sitio puede haber cambiado
su diseño. Pincha **copiar diagnóstico** y pega el texto en la conversación:
trae lo que la extensión vio, y con eso se ajusta el lector.

Esto funciona en la extensión. En la versión web no, porque una página no
puede leer otros sitios.

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
