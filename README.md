# Confianza Inmobiliaria

App web para vendedores de arriendo. Filtra el inventario de Assetplan
(por comuna, precio, dormitorios, baños, m², disponibilidad) y genera posts
automáticos para redes con link directo a WhatsApp.

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** FastAPI + SQLAlchemy + SQLite
- **Datos:** CSV centralizado en `backend/data/export.csv` (sin carga manual)

## Estructura

```
confianza-inmobiliaria/
├── backend/            FastAPI
│   ├── main.py         app + sincronización del CSV
│   ├── run.py          python run.py -> :8000
│   ├── app/
│   │   ├── config.py   settings por entorno
│   │   ├── database.py  conexión SQLite
│   │   ├── models.py   modelo Property
│   │   ├── schemas.py  schemas Pydantic
│   │   ├── routes/     properties, posts
│   │   └── utils/      csv_parser, filters
│   └── data/export.csv inventario (fuente de verdad)
├── frontend/           React + Vite + Tailwind
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       └── components/  Dashboard, Filters, PropertyCard, PostGenerator, Loader
└── README.md
```

## Cómo correr localmente

### Backend (terminal 1)

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows  (Linux/Mac: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env       # Linux/Mac: cp .env.example .env
python run.py
```

- API: http://localhost:8000
- Docs (Swagger): http://localhost:8000/docs

Al iniciar, el backend sincroniza la base de datos con `backend/data/export.csv`.

### Frontend (terminal 2)

```bash
cd frontend
npm install
copy .env.example .env.local   # Linux/Mac: cp .env.example .env.local
npm run dev
```

- Web: http://localhost:5173

## Actualizar el inventario

El CSV es la fuente de verdad. Para actualizar el inventario:

1. Reemplaza `backend/data/export.csv` con el nuevo export de Assetplan.
2. Súbelo al repo (`git add`, `commit`, `push`).
3. Reinicia / redespliega el backend: detecta el cambio y resincroniza la BD.

Los vendedores solo usan la web; no manipulan archivos.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor |
| GET | `/properties` | Lista filtrada (comuna, precio, dormitorios, baños, m², disponibilidad, orden) |
| GET | `/properties/comunas` | Comunas disponibles |
| GET | `/properties/{op}` | Detalle de una unidad |
| POST | `/posts/generate` | Genera texto + WhatsApp + link listing para una `op` |

## Variables de entorno

**backend/.env**

```
DATABASE_URL=sqlite:///./confianza.db
WHATSAPP_PHONE=56975459683
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
SEED_CSV_PATH=data/export.csv
```

**frontend/.env.local**

```
VITE_API_URL=http://localhost:8000
```

## Deploy (después del MVP)

- Backend: Railway o Render (incluye `backend/data/export.csv` en el repo).
- Frontend: Vercel (define `VITE_API_URL` apuntando al backend público).
