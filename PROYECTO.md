# CONFIANZA INMOBILIARIA — PROYECTO GITHUB + CLAUDE CODE

**Objetivo:** Reconstruir la app web desde cero en GitHub, conectado a Claude Code, respetando el diseño actual. App para vendedores: subir CSV, filtrar propiedades buenas, generar posts para redes.

---

## 1. STACK TECNOLÓGICO

- **Frontend:** React 18 + Vite (desarrollo rápido)
- **Backend:** FastAPI (Python)
- **Base de datos:** SQLite (local) — escalable después
- **Hosting:** GitHub (código) + Vercel (frontend) + Railway/Render (backend)
- **CSV:** Carga centralizada en servidor, acceso web

---

## 2. ESTRUCTURA DE CARPETAS

```
confianza-inmobiliaria/
│
├── README.md                     (descripción del proyecto)
├── .gitignore                    (node_modules, __pycache__, .env)
│
├── /frontend                     (React + Vite)
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── /src
│   │   ├── App.jsx               (componente principal)
│   │   ├── main.jsx
│   │   ├── /components
│   │   │   ├── Dashboard.jsx     (listado + filtros)
│   │   │   ├── PostGenerator.jsx (generar post)
│   │   │   ├── CSVUpload.jsx     (subir CSV)
│   │   │   └── PropertyCard.jsx  (tarjeta propiedad)
│   │   └── /styles
│   │       └── index.css         (diseño actual)
│   └── .env.local                (API_URL=http://localhost:8000)
│
├── /backend                      (FastAPI + Python)
│   ├── main.py                   (app FastAPI)
│   ├── requirements.txt          (deps)
│   ├── .env                      (DATABASE_URL, etc)
│   ├── /app
│   │   ├── models.py             (SQLAlchemy models)
│   │   ├── schemas.py            (Pydantic schemas)
│   │   ├── database.py           (conexión BD)
│   │   ├── /routes
│   │   │   ├── properties.py     (GET /properties, filtros)
│   │   │   ├── csv_upload.py     (POST /csv/upload)
│   │   │   └── posts.py          (POST /posts/generate)
│   │   └── /utils
│   │       ├── csv_parser.py     (parsear CSV Assetplan)
│   │       └── filters.py        (lógica de filtros)
│   └── run.py                    (python run.py)
│
└── /data
    └── export.csv                (CSV actualizado)
```

---

## 3. FUNCIONALIDADES CORE

### **Frontend (React)**

**Dashboard (página principal)**
- [ ] Filtros: Comuna, Precio min-max, Dormitorios, Disponibilidad
- [ ] Lista de propiedades que cumplen criterios (tarjetas)
- [ ] Botón "Generar post" por propiedad
- [ ] Botón "Subir CSV nuevo"

**Generar Post**
- [ ] Texto automático: precio, ubicación, habitaciones, metros
- [ ] Foto destacada
- [ ] Link WhatsApp directo (`56975459683`)
- [ ] Copiar a portapapeles
- [ ] Enviar a Facebook (después — API Graph)

**Subir CSV**
- [ ] Solo admin (vendedor principal)
- [ ] Valida estructura (semicolon-separated, UTF-8 BOM)
- [ ] Parsea correctamente (newlines en Comentario)
- [ ] Actualiza base de datos

**Diseño**
- [ ] Respetar colores: navy (#0d1b3e), verde (#10b981), dorado (#f59e0b)
- [ ] Plus Jakarta Sans (font actual)
- [ ] Responsive mobile-first
- [ ] Dark mode por defecto

---

### **Backend (FastAPI)**

**Endpoints**

```
GET /properties
  ?comuna=Santiago&precio_min=400000&precio_max=800000&dormitorios=1,2
  → lista propiedades filtradas

POST /csv/upload
  file: CSV
  → parsea y guarda en BD

POST /posts/generate
  property_id: 123
  → JSON con texto + foto del post

GET /health
  → server está vivo
```

**Modelos (SQLAlchemy)**
```python
Property:
  - id
  - titulo
  - precio (en números, no string)
  - comuna
  - dormitorios
  - baños
  - metros
  - disponible_desde (fecha)
  - foto_url
  - descripcion
  - link_whatsapp
  - created_at
  - updated_at
```

---

## 4. FILTROS — CRITERIOS PARA "SE ARRIENDA RÁPIDO"

*Define estos según tu experiencia:*

- ✅ **Comuna:** Santiago, Estación Central, La Florida, Ñuñoa, San Miguel, Independencia
- ✅ **Precio:** $400.000 — $800.000 (ajustable por usuario)
- ✅ **Dormitorios:** 1 o 2 (más popular)
- ✅ **Disponibilidad:** Próximos 30 días
- ✅ **Metros:** 40–80 m² (opcional)

**Lógica:** Si cumple todos → aparece primero en ranking.

---

## 5. CSV — ESTRUCTURA ASSETPLAN

**Assetplan envía semicolon-separated con estos campos (ejemplo):**

```
Título;Precio;Comuna;Dormitorios;Baños;Metros;Disponible;Foto;Comentario;...
Depto Centro;$550.000;Santiago;1;1;45;2024-08-15;foto.jpg;Buen estado; mucha luz...
```

**Problemas conocidos:**
- UTF-8 BOM (primeros 3 bytes invisibles)
- Campo "Comentario" contiene newlines crudos
- Parser correcto: leer líneas, contar columnas, mergear hasta coincidir

**Solución:** Función `parse_assetplan_csv()` en `csv_parser.py` que:
1. Lee con `encoding='utf-8-sig'`
2. Detecta saltos en Comentario
3. Retorna lista de dicts con columnas nombradas

---

## 6. VARIABLES DE ENTORNO

**.env (backend)**
```
DATABASE_URL=sqlite:///./confianza.db
WHATSAPP_PHONE=56975459683
CORS_ORIGINS=http://localhost:3000,https://tudominio.com
JWT_SECRET=tu_secret_aqui
```

**.env.local (frontend)**
```
VITE_API_URL=http://localhost:8000
```

---

## 7. COMO CORRER LOCALMENTE

**Backend (Terminal 1)**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
# → Corre en http://localhost:8000
# → Docs en http://localhost:8000/docs
```

**Frontend (Terminal 2)**
```bash
cd frontend
npm install
npm run dev
# → Corre en http://localhost:5173
```

---

## 8. TAREAS INICIALES (EN ORDEN)

1. **Crear repo en GitHub**
   - Nombre: `confianza-inmobiliaria`
   - Privado (solo tú)

2. **Conectar a Claude Code**
   - New Project → GitHub → autorizar → seleccionar repo

3. **Inicializar carpetas**
   - `/frontend` con `npm create vite@latest . -- --template react`
   - `/backend` con estructura FastAPI básica

4. **Setup Backend**
   - `requirements.txt`: FastAPI, SQLAlchemy, python-multipart, python-dotenv, cors
   - `main.py` con CORS activado
   - `/app/routes` con endpoints básicos

5. **Setup Frontend**
   - `App.jsx` con Layout básico (header, filtros, grid propiedades)
   - Conectar a API en `localhost:8000`

6. **Cargar CSV**
   - Endpoint POST `/csv/upload`
   - Parser robusto para Assetplan
   - Guardar en BD

7. **Filtros dinámicos**
   - React state para cada filtro
   - Llamadas GET `/properties?filters` a backend

8. **Generar posts**
   - Tomar data de propiedad
   - Template de texto
   - Copiar a portapapeles

9. **Deploy**
   - Backend: Railway o Render
   - Frontend: Vercel

---

## 9. COMANDOS GIT BÁSICOS

```bash
# Clonar localmente
git clone https://github.com/tuusuario/confianza-inmobiliaria.git
cd confianza-inmobiliaria

# Crear rama de feature
git checkout -b feature/filtros-dinamicos

# Después de cambios
git add .
git commit -m "Agrego filtros por comuna y precio"
git push origin feature/filtros-dinamicos

# En GitHub: crear Pull Request → Review → Merge a main
```

---

## 10. QUÉ DECIRLE A CLAUDE CODE

**Cuando abras nuevo proyecto:**

```
Nombre del proyecto: Confianza Inmobiliaria
Descripción: 
"App web para vendedores de arriendo. Sube CSV Assetplan, 
filtra propiedades que se arriendan rápido (por comuna, 
precio, disponibilidad), genera post automático para redes. 
React frontend + FastAPI backend."

Stack: React + FastAPI + SQLite
GitHub repo: [tu repo URL]
```

**Archivo que le pasas:** Este PROYECTO.md completo.

---

## 11. PRÓXIMOS PASOS (DESPUÉS DE MVP)

- [ ] Integración Facebook API (postear automático a grupo)
- [ ] Sistema de login (vendedores diferentes)
- [ ] Base de datos PostgreSQL (escalar)
- [ ] Dashboard de analytics (qué se arrenda más)
- [ ] Notificaciones cuando sube propiedad nueva

---

## RESUMEN RÁPIDO

| Qué | Cómo | Dónde |
|-----|------|-------|
| Código | GitHub | /confianza-inmobiliaria |
| Desarrollar | Claude Code | conectado a repo |
| Frontend | React + Vite | /frontend |
| Backend | FastAPI | /backend |
| Base datos | SQLite | local, después PostgreSQL |
| Datos | CSV Assetplan | POST /csv/upload |
| Correr | `npm run dev` + `python run.py` | localhost:3000 + localhost:8000 |
| Deploy | Vercel (frontend) + Railway (backend) | después del MVP |

---

**¿LISTO? Copia esto, abre Claude Code, y pasale este archivo.**
