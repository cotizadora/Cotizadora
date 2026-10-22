# Insumos del producto DENTAL

Esta carpeta es para **los archivos fuente del producto**: tablas de tarifas,
condiciones, folletos, mallas de cobertura, capturas, planillas, lo que sea.
Yo (Claude) leo desde aquí para entender el producto antes de programar.

## Importante: cómo hago para verlos

Trabajo en un contenedor en la nube, **no veo tu disco**. Un archivo que dejes
en esta carpeta en tu computador no me llega hasta que lo subas al repositorio:

**Desde Windows es un doble clic:** deja los archivos en esta carpeta y
ejecuta `SUBIR.bat`, que está un nivel más arriba. Eso es todo.

Si prefieres la terminal:

```bash
git add DENTAL/insumos/
git commit -m "Insumos producto dental"
git push
```

Recién ahí puedo abrirlos. Si es un archivo suelto, también sirve arrastrarlo
directo al chat.

## Qué me sirve

Formatos que puedo leer sin problema: **PDF, Excel (.xlsx), CSV, Word (.docx),
imágenes (JPG/PNG), texto**. De una foto o una captura de pantalla de una tabla
de precios también saco los datos.

Lo más útil para cotizar bien:

- Tabla de precios por plan y por composición del grupo (titular solo,
  titular + 1, + 2, + 3…).
- Topes y cortes de edad, y qué pasa exactamente en cada corte.
- Reglas de quién puede entrar como adicional o carga.
- Carencias, topes anuales, coberturas y exclusiones.

## ATENCIÓN: este repositorio es PÚBLICO

`cotizadora/Cotizadora` es un repositorio público: cualquiera en internet
puede ver lo que se suba acá, y queda en el historial de git aunque después
se borre.

**No subas a esta carpeta:**

- Documentos internos de Bci: scripts de venta, tarifas, condiciones,
  presentaciones comerciales.
- Datos de clientes: nombres, RUT, teléfonos, correos, fichas médicas.
- Cualquier cosa que tu empresa no publicaría en su sitio web.

Mientras el repositorio siga siendo público, pásame los documentos
arrastrándolos al chat. Los leo igual y no quedan publicados.
