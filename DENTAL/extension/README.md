# Extensión Cotizador Dental Bci

Página para Chrome y Edge. Se marca si hay cargas y su edad (o fecha de
nacimiento), y muestra el plan que corresponde y lo que se paga con la UF del
día, junto al script de venta y las sucursales por comuna.

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

- **Abrir:** clic en el ícono de la extensión. El cotizador se abre como
  página en una pestaña; si ya estaba abierta, salta a esa pestaña en vez de
  abrir otra. No se cierra al hacer clic en otro lado. Conviene **fijarla**
  (clic derecho en la pestaña → Anclar) o arrastrarla a su propia ventana y
  dejarla al lado de Vicidial.
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
- **Script:** clic en el **nombre** del plan y se despliega abajo, a todo el ancho.
  Ver la sección *Leer el script*.
- **Copiar:** deja la cotización en el portapapeles.
- **Nuevo cliente:** dos toques. Deja todo en cero: titular solo, Plan
  Urgencias, sin cargas, sin comuna, envío en línea.

## Leer el script

El texto es el del script oficial, palabra por palabra y en su orden. No se
agregó ni se resumió nada. Lo que aparece en cursiva gris son notas internas
para el ejecutivo y no se leen al cliente.

- **Lectura guiada:** la frase que toca leer queda resaltada. Con **↓** (o
  Av Pág) se avanza a la siguiente y con **↑** (o Re Pág) se vuelve. Inicio y
  Fin van al principio y al final. Lo ya leído queda más tenue, así que al
  volver de otra pantalla se sabe dónde quedó. Un clic en cualquier frase la
  deja como la actual. Las flechas no mueven el script mientras se escribe en
  un campo (edad, fecha, comuna).
- **Tamaño de letra:** botones **A−** y **A+**, de 80 % a 220 %.
- **Contraste:** Normal, **Negro** (fondo negro, letra clara), **Alto**
  (negro con amarillo) y **Sepia** (más suave para la vista).
- **Ancho:** el script se abre a la derecha de la cotización, a todo el alto
  de la ventana. Arrastra hacia la derecha la manija azul de su borde (la
  franja con ↔ y puntos) y la zona de lectura se ensancha hasta el borde de
  la pantalla; el texto se reacomoda. Doble clic en la manija vuelve al
  ancho normal. El ancho elegido se recuerda.
- Tamaño, contraste y lectura guiada se recuerdan siempre, también después
  de *Nuevo cliente*. La frase en que vas se guarda por plan y se reinicia
  con cada cliente nuevo.
- Las coberturas y exclusiones van en lista, una por línea, para leerlas sin
  perderse.
- Los textos de medio de pago cambian según **En línea** (cliente con cuenta
  Bci, el que viene por defecto) o **Link de pago**.

## Sucursales por comuna

Escribe la comuna del cliente y la extensión lee, en ese momento:

- **Uno Salud:** la página de esa comuna en `unosalud.cl/region-comuna/`.
- **i-dental:** el listado de clínicas de `e-dentalsys.com`. Ese sitio arma
  su listado después de cargar, así que la extensión lo lee **aparte**, sin
  que el buscador lo espere: abre el sitio unos segundos en una pestaña de
  fondo, lee las tarjetas y la cierra sola. Cada tarjeta dice
  `Comuna - Provincia - REGIÓN`, y de ahí sale la comuna exacta. Si las
  tarjetas no se pueden leer, usa los datos que el propio sitio descarga, y
  anota esa dirección para leerla directo las veces siguientes.
- El listado de i-dental se carga solo al instalar o actualizar la extensión
  y al abrir el navegador si tiene más de una semana. Si en una búsqueda
  todavía no está, dice *cargando aparte…* y aparece solo, sin volver a
  buscar. Si una lectura no encuentra nada, no se reintenta antes de 6
  horas (salvo desde el mapeo completo).

Muestra las sucursales de cada red con nombre, dirección, teléfono y horario
cuando el sitio los trae, y un enlace a la fuente.

- La búsqueda tolera tildes, mayúsculas, la ñ, espacios de menos y errores
  de tipeo (`providensia`, `lascondes`, `nunoa`). Entiende abreviaturas:
  `valpo`, `stgo`, `conce`, `pto montt`, `pta arenas`, `sta`, `gral`. Si lo
  escrito calza con varias comunas (`las c`), ofrece las opciones.
- Si algo falla, el panel lo dice con un botón **copiar diagnóstico**.
- La lista de comunas sale del propio sitio de Uno Salud, así que funciona
  aunque la dirección de la página no sea el nombre de la comuna
  (Valparaíso es `rv-rv`).
- Lo leído se guarda: Uno Salud un día, i-dental una semana. Las búsquedas
  siguientes son instantáneas. El mapeo completo vuelve a leer todo.
- Si se cierra el cotizador mientras se lee i-dental, la lectura termina igual
  y queda guardada para la próxima búsqueda.

**Si una red no muestra resultados y debería**, el sitio puede haber cambiado
su diseño. Pincha **copiar diagnóstico** y pega el texto en la conversación:
trae lo que la extensión vio (páginas probadas, cómo está hecho el sitio,
scripts, iframes y posibles fuentes de datos), y con eso se ajusta el lector.

### Mapeo completo de comunas

En el panel de sucursales, el enlace **Mapeo completo de comunas** abre una pestaña que
recorre todas las comunas de Uno Salud y el listado de i-dental, y arma una
tabla comuna por comuna con las sucursales de ambas redes.

- Tarda un par de minutos la primera vez. Se guarda 30 días.
- Mientras exista el mapeo, el buscador responde desde él, sin
  consultar los sitios, al instante.
- Se puede filtrar, ver sólo las comunas con ambas redes, y descargar en
  **CSV** (abre en Excel) o **JSON**.
- Las sucursales de i-dental se asignan a la comuna que dice su dirección.

Esto funciona en la extensión. En la versión web no, porque una página no
puede leer otros sitios.

## No se pierde nada al cerrar

Todo lo que escribas se guarda en el momento y vuelve tal cual si cierras la
pestaña o el navegador: cargas, edades, fechas, plan elegido, script abierto
y hasta si el desplegable estaba abierto.

La barra gris de abajo indica a qué hora se guardó. Para empezar con otro
cliente, el botón **Nuevo cliente** borra todo, y pide confirmación antes.

Si pasan **45 minutos sin tocar nada**, lo guardado se da por terminado y el
cotizador abre limpio: Plan Urgencias, sin cargas, póliza en línea. Así no
aparece el cliente de la llamada anterior.

Los datos quedan sólo en ese navegador, en ese equipo. No se suben a ninguna
parte.

**La edad del titular no se pide.** No cambia el plan ni el precio, así que
sólo se miden las cargas contra el corte de 14 años.

La tabla muestra siempre los tres planes para la composición elegida, así que
si el cliente pide otra opción está a la vista.

## Valor UF

Se actualiza solo al abrir el cotizador, desde `mindicador.cl` (respaldo
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
