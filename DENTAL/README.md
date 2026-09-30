# DENTAL

Herramientas del producto dental. Carpeta separada a propósito, para no
mezclarla con el resto del repositorio.

## Contenido

| Archivo | Qué es |
|---|---|
| `calculadora-edad.html` | Calculadora de edad y cotizador de plan. Archivo único, se abre con doble clic, sin dependencias ni servidor. |
| `insumos/` | Material de referencia del producto (tarifas, condiciones, folletos). Ver `insumos/LEEME.md`. |
| `PRODUCTO.md` | **Base de conocimiento del producto**: planes, tarifas, coberturas, asegurabilidad, exclusiones, script de venta. De aquí sale todo lo demás. |
| `extension/` | Extensión de Chrome y Edge: popup para cotizar rápido. Ver `extension/README.md`. |
| `extension-cotizador-dental.zip` | La misma extensión empaquetada, para descargar y descomprimir. |
| `INSTALAR.bat` | Deja `Documents\DENTAL` conectada a este repositorio. Se ejecuta una sola vez. |
| `SUBIR.bat` | Sube a GitHub lo que haya en la carpeta. Doble clic. |

## Cómo se usa desde Windows

La carpeta `C:\Users\<usuario>\Documents\DENTAL` muestra directamente el
contenido de esta carpeta del repositorio, mediante un enlace de directorio
(`mklink /J`). El clon real vive en `Documents\Cotizadora`, fuera de la vista.

1. **Una sola vez:** doble clic en `INSTALAR.bat`. Descarga el repositorio,
   copia a `insumos/` lo que ya hubiera en la carpeta, guarda un respaldo en
   `Documents\DENTAL_respaldo` y crea el enlace.
2. **Cada vez que agregues archivos:** doble clic en `SUBIR.bat`.

Requiere Git para Windows (https://git-scm.com/download/win). Ninguno de los
dos scripts borra archivos.

## calculadora-edad.html

- Edad exacta en años, meses y días, con fecha de evaluación configurable.
- Cortes de edad: **14 años** y **24 años con cero días**, con la fecha exacta
  de cada uno y los días que faltan o que ya pasaron.
- Grupo de hasta 4 personas (titular + 3 adicionales). Si entra un menor de
  14 años, el grupo pasa obligatoriamente al **Plan 3 Full Niños**
  (0,81 / 1,13 / 1,44 UF según 1, 2 o 3 adicionales). Si no hay menores, se
  mantiene el **Seguro de Urgencia Simple** de 0,26 UF.
- Barra superior fija con el valor UF del día (`mindicador.cl`, respaldo
  `api.boostr.cl`, caché local e ingreso manual si no hay conexión).
- Conversión a pesos con aritmética entera, **sin redondeo**: se muestran los
  decimales exactos y, por separado, el redondeo al peso.

Las tarifas están en el objeto `PRECIOS`, al inicio del bloque `<script>`.
Cambiar un precio es editar una línea.

### Pendiente

Empaquetarlo como extensión de Chrome/Edge: hay que sacar el `<script>` a un
archivo `.js` aparte (Manifest V3 no permite scripts inline) y declarar
`mindicador.cl` en `host_permissions`.
