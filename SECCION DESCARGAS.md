# SECCIÓN DESCARGAS — CotizadorGo!

Guía de referencia del **Centro de Descargas** de la cotizadora, para futuras
modificaciones. Explica qué archivo sirve cada tarjeta, dónde vive el archivo
(hosting) y cómo actualizar cada uno **sin romper la app**.

> La UI del Centro de Descargas está en `index.html`, en el bloque
> `<div id="descargas-view">` (aprox. líneas 2105–2179). Cada tarjeta es un
> `.dl-card` con su botón `.dl-btn`.

---

## Regla de oro

- **No se edita `index.html` para actualizar un archivo.** Los botones apuntan a
  URLs fijas; para "cambiar el archivo" se reemplaza el archivo en su hosting,
  manteniendo el **mismo nombre / misma ruta**.
- Solo se edita `index.html` si cambia el **texto**, el **nombre visible**, se
  **agrega/quita una tarjeta** o cambia la **URL de destino**.

---

## Inventario de descargas

| # | Nombre visible      | Tipo              | Archivo / URL de destino | Hosting |
|---|---------------------|-------------------|--------------------------|---------|
| 1 | **CRM Extractor Pro** | Extensión (Chrome/Edge) | `https://github.com/cotizadora/extractor-crm/releases/latest/download/extractor-crm.zip` | **GitHub Releases** (repo `cotizadora/extractor-crm`) |
| 2 | ShortCut Vocal CRM  | Extensión         | `https://cotizadora.github.io/Cotizadora/shortcut-vocalcrm_v1.zip` | GitHub Pages (`cotizadora/Cotizadora`) |
| 3 | MuteReal            | Programa Windows  | `https://cotizadora.github.io/Cotizadora/mutereal_v1.exe` | GitHub Pages (`cotizadora/Cotizadora`) |
| 4 | NotasSmart          | Programa Windows  | `https://cotizadora.github.io/Cotizadora/notassmart_v1.exe` | GitHub Pages (`cotizadora/Cotizadora`) |
| 5 | Smart               | Programa Windows  | `https://cotizadora.github.io/Cotizadora/BlocNotasFlotante.zip` | GitHub Pages (`cotizadora/Cotizadora`) |

---

## Cómo actualizar cada tipo

### A) CRM Extractor Pro → **GitHub Releases** (mecanismo distinto al resto)

El botón usa `releases/latest/download/...`, es decir **siempre sirve la última
release** publicada en el repo `cotizadora/extractor-crm`. Para actualizarlo hay
que **reemplazar el asset `extractor-crm.zip`** de la release más reciente
(o publicar una release nueva con ese asset).

- Fuente local del `.zip` nuevo: `C:\Users\eduardo.perez\Documents\Cotizadora\DESCARGAS\extractor-crm.zip`
- El nombre del asset **debe** ser exactamente `extractor-crm.zip` (si cambia, se
  rompe el enlace `latest/download/extractor-crm.zip`).

**Opción 1 — Web (manual, sin token):**
1. Ir a `https://github.com/cotizadora/extractor-crm/releases`.
2. Editar la release marcada como *Latest* (ej. `v3.3.1`).
3. Borrar el asset `extractor-crm.zip` viejo y arrastrar el nuevo.
4. Guardar. El botón de la cotizadora ya sirve el nuevo, sin tocar nada más.

**Opción 2 — API de GitHub (requiere PAT con scope `repo`/`contents:write`):**
```bash
OWNER=cotizadora; REPO=extractor-crm; TOKEN=***tu_PAT***
NEW="C:/Users/eduardo.perez/Documents/Cotizadora/DESCARGAS/extractor-crm.zip"

# 1) id de la release "latest" y del asset viejo
REL=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/releases/latest")
REL_ID=$(echo "$REL" | grep -m1 '"id"' | grep -o '[0-9]\+')
ASSET_ID=$(echo "$REL" | grep -B2 '"name": "extractor-crm.zip"' | grep -m1 '"id"' | grep -o '[0-9]\+')

# 2) borrar asset viejo
curl -s -X DELETE -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/releases/assets/$ASSET_ID"

# 3) subir el nuevo (mismo nombre)
curl -s -X POST -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @"$NEW" \
  "https://uploads.github.com/repos/$OWNER/$REPO/releases/$REL_ID/assets?name=extractor-crm.zip"
```

### B) Los demás (ShortCut Vocal, MuteReal, NotasSmart, Smart) → **GitHub Pages**

Viven como archivos sueltos en la raíz del repo `cotizadora/Cotizadora`
(el mismo que sirve `index.html`). Para actualizar uno, se **sube el archivo con
el mismo nombre** al repo (por la API de GitHub Contents o por la web), respetando
el nombre exacto de la tabla. La URL del botón no cambia.

---

## Notas de mantenimiento

- Al reemplazar un `.zip` de extensión, avisar al equipo que la recarguen en
  `chrome://extensions` / `edge://extensions` (**Cargar descomprimida** de nuevo
  o botón *Actualizar*), porque las extensiones desempaquetadas no se
  autoactualizan.
- Versionado de CRM Extractor Pro: la última release conocida es **v3.3.1**
  (asset `extractor-crm.zip`). Mantener el mismo nombre de asset en cada update.
- Este archivo se mantiene en dos lugares: la carpeta local
  `C:\Users\eduardo.perez\Documents\Cotizadora\` y el repo/hosting del proyecto.

---

## Accesos externos de la barra de navegación (Atlas · Vocal · PeopleWork)

Independiente del Centro de Descargas. Son **enlaces directos** a herramientas
externas, ubicados en la **barra de navegación superior** (`<nav id="view-nav">`
en `index.html`), después de Cotizadora / Planilla / Biblioteca, separados por un
divisor `.vn-div`. Abren en pestaña nueva (`target="_blank"` + `rel="noopener noreferrer"`).

| Nombre visible | Qué es    | Ícono | URL |
|----------------|-----------|-------|-----|
| **Atlas**      | CRM       | 🗂️   | `https://atlas.geimser.cl/app/calls/new?campaignId=b5df1732-476e-4475-a21a-bae8e0942829` |
| **Vocal**      | Discador  | 📞    | `https://cdn.s-br01a-product.prod1.vocalcomcx.com/hermes360/Admin/Launcher/dashboard?screen=workspace` |
| **PeopleWork** | Asistencia| 🏢    | `https://app.peoplework.cl/login` |

**Cómo modificarlos:** editar el bloque `<nav id="view-nav">` en `index.html`.
Cada acceso es un `<a class="vn-btn vn-ext" style="--acc:var(--COLOR)">` con
`<span class="vn-ic">ícono</span>`, `<span class="vn-lb">nombre</span>` y la flecha
`<span class="vn-ext-go">↗</span>`. Colores de acento usados: Atlas `--bl` (azul),
Vocal `--gn` (verde), PeopleWork `--or` (naranja). Estilos en el CSS bajo el
comentario *"Enlaces útiles en la nav"* (`.vn-ext`, `.vn-div`, `.vn-ext-go`).
No usan `data-target`, por eso nunca quedan marcados como sección activa.
