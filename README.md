# Image Validator

A full-stack image upload and validation app. **Runs entirely locally — no AWS account or cloud credentials needed.**

> **S3 note:** the assignment asks for "Amazon S3 or an equivalent cloud storage service." This project uses **MinIO**, a self-hosted, S3-API-compatible object store (same `@aws-sdk/client-s3` client Amazon S3 uses — `PutObjectCommand`/`DeleteObjectCommand`). Swapping to real S3 is a config-only change: point `STORAGE_ENDPOINT` at `https://s3.<region>.amazonaws.com`, drop `forcePathStyle` in `src/config/storage.js`, and supply real AWS credentials.

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
| `JWT_SECRET` | *(random dev fallback)* | **Required in production** — signs session tokens. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `7d` | Session token lifetime |

---

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account — `{ email, password }` (password ≥ 8 chars). Returns `{ token, user }`. |
| `POST` | `/api/auth/login` | `{ email, password }` → `{ token, user }`. Same generic error for a wrong password and a nonexistent email (no account enumeration). |
| `GET` | `/api/auth/me` | Current account for the bearer token. |
| `POST` | `/api/images/upload` | **Auth required.** Queue images for processing (multipart, field: `images`). Returns **202** immediately with `{ queued: [{id, status: 'queued'}] }` — does not wait for validation. |
| `GET` | `/api/images/batch?ids=a,b,c` | **Auth required.** Poll processing status for a batch of ids (used by the frontend while waiting on the queue) |
| `GET` | `/api/images` | **Auth required.** List the caller's own images (`?status=accepted\|rejected&page=1&limit=20`) |
| `GET` | `/api/images/stats` | **Auth required.** Counts by status, for the caller |
| `GET` | `/api/images/:id` | **Auth required.** Single image, must be owned by the caller (404 otherwise) |
| `DELETE` | `/api/images/:id` | **Auth required.** Delete an image, must be owned by the caller |
| `POST` | `/api/images/claim` | **Auth required.** One-time: adopt any images left ownerless from before accounts existed. Idempotent. |
| `GET` | `/health` | Health check |

Every `/api/images/*` route requires `Authorization: Bearer <token>` from `/api/auth/login` or `/api/auth/register`.

---

## Auth & per-user privacy

Every image belongs to exactly one account (`images.user_id`, enforced at the query layer — see `src/models/Image.js`, where every read/write takes `userId` and filters or matches on it). There is no admin bypass: `GET/DELETE /api/images/:id` for an image you don't own returns a plain 404, not a 403 — wrong-owner and doesn't-exist are indistinguishable from the outside, so ids can't be used to probe what exists. Passwords are hashed with bcrypt (`bcryptjs`, 10 rounds); sessions are JWTs (`jsonwebtoken`, 7-day expiry, `JWT_SECRET` in `.env`) sent as `Authorization: Bearer <token>` and checked by `requireAuth` middleware in front of every images route.

**Storage privacy, not just app-level auth:** the MinIO bucket has no public-read policy — `docker-compose.yml`'s `minio-init` no longer runs `mc anonymous set download`. Every image URL the API returns is a short-lived (15 min) presigned S3 GET URL minted fresh per request (`getPresignedUrl` in `src/services/storageService.js`), never persisted. Object keys are also namespaced per user (`images/<userId>/accepted|rejected/<file>`). So even someone with a leaked/logged image URL loses access once it expires, and can't derive other users' objects from a key pattern.

**Duplicate detection is per-user, not global** — `Image.getAllPhashes(userId)` only ever compares a new upload against that same user's own accepted images, so one user's private photo can never cause (or be inferred from) another user's upload being rejected as "too similar."

**Pre-auth data:** rows created before accounts existed have `user_id = NULL` and are invisible to every query until claimed. `POST /api/images/claim` assigns all currently-ownerless rows to the calling account — the frontend calls this automatically right after your first login/register, so any images from before you had an account just show up in your gallery once you sign in.

---

## Async processing

Uploads no longer block on the full validation pipeline. `POST /upload` writes a `queued` row per file and hands each one to an in-process, concurrency-limited queue (`src/services/uploadQueue.js`, default concurrency `3`, tune via `UPLOAD_CONCURRENCY`); the response returns as soon as files are recorded. The frontend polls `GET /api/images/batch` every 1.5s until every file reaches `accepted`/`rejected`.

Because multiple files can now be validated concurrently, the duplicate-image check (which reads and mutates a shared list of known perceptual hashes) is serialized through a small async mutex (`src/utils/Mutex.js`) so two similar images processed at the same instant can't both slip past rule 3.

**Face detection is fail-closed.** The upload route is gated by `requireFaceModels` middleware — while the SSD MobileNet model is still loading (a few seconds after server start), uploads get a `503` with `Retry-After` rather than silently skipping the face-size/multiple-face checks. If model loading fails outright, the validation pipeline itself also rejects with "Face detection temporarily unavailable" as a second line of defense.

---

## Tests

```bash
cd backend
npm test
```

Covers: blur/pHash/similarity math, the face-bounding-box size filter, the `AsyncQueue`/`Mutex` primitives, and an integration test against the upload + batch-status endpoints (with DB/storage/model-loading mocked) that asserts the upload response returns *before* background processing finishes, and that two similar images uploaded in the same batch don't both get accepted.
