# Image Validator

A full-stack image upload and validation app. **Runs entirely locally — no AWS account or cloud credentials needed.**

## Architecture

```
React (Vite)  ──►  Express API  ──►  MinIO  (image files, S3-compatible)
                        │
                   PostgreSQL  (metadata)
                        │
                  face-api.js  (local face detection, SSD MobileNet v1)
                   sharp/libvips (blur, resize, HEIC conversion, pHash)
```

---

## Quick start — everything runs locally

### Prerequisites

- Node.js 18+
- Docker + Docker Compose

### 1. Start Postgres + MinIO

```bash
docker compose up -d
```

| Service | URL | Credentials |
|---|---|---|
| MinIO S3 API | http://localhost:9000 | minioadmin / minioadmin |
| MinIO web console | http://localhost:9001 | minioadmin / minioadmin |
| PostgreSQL | localhost:5432 | postgres / postgres |

### 2. Download face detection models (one-time, ~25 MB)

```bash
cd backend
node scripts/download-models.js
```

### 3. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev        # http://localhost:4000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

---

## Validation rules

| Check | Implementation |
|---|---|
| Format | Magic byte detection — HEIC/PNG/JPEG only |
| File size | Rejects < 10 KB or > 20 MB |
| Resolution | Rejects < 200×200 px |
| HEIC → JPEG | Converted automatically via sharp before storage |
| Blur | Laplacian variance on greyscale pixels — score < 100 rejects |
| Duplicate | 64-bit DCT perceptual hash, Hamming distance ≤ 10 rejects |
| Faces | Local SSD MobileNet v1 via face-api.js — 0, >1, or too-small face rejects |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API port |
| `DB_HOST` | `localhost` | Postgres host |
| `DB_PORT` | `5432` | Postgres port |
| `DB_NAME` | `image_validator` | Database name |
| `DB_USER` | `postgres` | DB user |
| `DB_PASSWORD` | `postgres` | DB password |
| `STORAGE_ENDPOINT` | `http://localhost:9000` | MinIO endpoint |
| `STORAGE_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `STORAGE_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `STORAGE_BUCKET` | `images` | Bucket name |
| `MAX_FILE_SIZE_MB` | `20` | Max upload size |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin |

---

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/images/upload` | Upload images (multipart, field: `images`) |
| `GET` | `/api/images` | List images (`?status=accepted\|rejected&page=1&limit=20`) |
| `GET` | `/api/images/stats` | Counts by status |
| `GET` | `/api/images/:id` | Single image |
| `DELETE` | `/api/images/:id` | Delete image |
| `GET` | `/health` | Health check |
