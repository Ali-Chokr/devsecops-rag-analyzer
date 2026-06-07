# Backend (NestJS)

API gateway for the DevSecOps RAG Analyzer. Proxies chat to the RAG engine, receives webhooks and logs, orchestrates ingestion jobs, and broadcasts incident events over WebSocket.

See the [root README](../README.md) for full-stack setup.

## Run locally

```bash
npm install
npm run start:dev
```

Requires PostgreSQL and the RAG engine. Default port: **3000** (override with `BACKEND_PORT`).

**Do not** run alongside `docker compose up backend` — both bind port 3000.

## Key modules

| Path | Purpose |
|------|---------|
| `src/chat/` | `POST /api/chat`, `POST /api/chat/stream` |
| `src/ingest/` | Logs, scrape triggers, job status API |
| `src/webhooks/` | GitLab webhook receiver |
| `src/rag/` | HTTP client to FastAPI RAG engine |
| `src/events/` | WebSocket incident feed |

## Configuration

Reads from repo-root `.env`:

| Variable | Purpose |
|----------|---------|
| `RAG_ENGINE_URL` | FastAPI base URL (default `http://localhost:8000`) |
| `DATABASE_URL` | PostgreSQL for `ingestion_jobs` |
| `API_KEY` | Optional protection for chat/ingest |
| `GITLAB_WEBHOOK_SECRET` | Webhook token validation |
| `DATA_DIR` | Job queue filesystem (Docker: `/data`) |

## Tests

```bash
npm test
npm run build
```

OpenAPI docs when running: **http://localhost:3000/api/docs**
