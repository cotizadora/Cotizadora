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

## No subas acá

Datos de clientes reales, RUT, fichas médicas ni nada personal: este
repositorio guarda historial y no es el lugar. Si hace falta un ejemplo,
manda uno con datos inventados.
