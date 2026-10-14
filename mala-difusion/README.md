# Montador Mala Difusión

Aplicación web para componer, animar y exportar las caricaturas y el logo de Mala Difusión
en los formatos de Facebook, YouTube, Instagram y otras redes.

Publicada en: https://cotizadora.github.io/Cotizadora/mala-difusion/

## Qué hace

- **6 diseños**: Escenario, Muro de afiches, Megáfono, Línea crema, Primer plano y Serigrafía.
- **14 formatos** con zonas seguras y guías por plataforma (portadas de grupo y página de Facebook,
  publicaciones, historias, Reels, portada y miniatura de YouTube, X, enlace de WhatsApp y 16:9).
  Cada diseño se reacomoda solo al cambiar de formato.
- **Edición**: arrastrar, escalar (esquinas, rueda o pellizco), girar, voltear, orden de capas,
  opacidad, brillo, contraste y saturación por elemento; distribución del grupo, fondos, luz,
  viñeta, grano, sombras y tratamientos (color, grises, serigrafía B/N, duotono).
  Deshacer y rehacer (Ctrl+Z / Ctrl+Y). Todo se guarda en el navegador.
- **Animaciones**: zoom cinematográfico, paneo, parallax, aparición progresiva, transiciones entre
  integrantes, movimiento libre, luz y profundidad, y combinado. Duración, intensidad, velocidad,
  curva y bucle sin cortes.
- **Exportación PNG** renderizada en canvas a 1×–4× (según el límite del navegador), con fondo
  transparente opcional, verificación de dimensiones, ZIP de todos los formatos o de todos los
  diseños y lámina comparativa para el equipo.
- **Exportación MP4** real: WebCodecs + mp4-muxer (H.264 en Chrome, Edge y Safari; VP9/AV1 en MP4
  opcionales). Si el navegador no tiene codificador H.264, usa FFmpeg.wasm (libx264) incluido en
  `vendor/`. El archivo se inspecciona (cajas ftyp/moov/mdat y códec) antes de entregarlo.
- **Integrantes faltantes** (Cata, Raúl, Jaime): se cargan desde la app; se guardan en el navegador
  y se suman a todas las composiciones. Si el PNG trae fondo negro, se puede quitar desde los bordes.

## Archivos

- `index.html`, `app.css`, `app.js`: la aplicación.
- `img/`: copias de trabajo (opacidad 254 corregida a 255). `img/originales/`: imágenes extraídas sin cambios.
- `vendor/mp4-muxer.js` (MIT) y `vendor/ffmpeg/` (FFmpeg.wasm, se descarga solo si hace falta).

Para usarla en local hay que servir la carpeta por HTTP (por ejemplo `python -m http.server`),
ya que WebCodecs y FFmpeg.wasm requieren un contexto seguro (`https://` o `localhost`).
