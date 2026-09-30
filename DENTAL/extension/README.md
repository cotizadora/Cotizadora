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
  ninguna fecha.
- **¿Hay hijos menores de 14?** Es un desplegable, cerrado por defecto. Ábrelo
  sólo cuando sospeches que hay un menor. Escribes la fecha de nacimiento del
  hijo y te dice derecho si califica para el plan de Urgencia o si obliga a
  pasar al Plan 4, más la diferencia de precio.
- **Fecha:** 8 dígitos seguidos, sin separadores. `05032016` se convierte solo
  en `05/03/2016`.
- **Plan:** se elige solo. Un hijo menor de 14 tacha los otros dos planes.
- **Copiar:** deja la cotización en el portapapeles, lista para pegar.

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
