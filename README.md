# DevSecOps RAG Analyzer

Hybrid RAG platform for DevSecOps incident analysis: **Angular** UI, **NestJS** API, **FastAPI** RAG engine, **PostgreSQL + pgvector**.

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| Node.js | 20+ | Required |
| Python | 3.11–3.12 recommended | 3.14 works; use venv from setup script |
| Docker Desktop | Latest | Required for PostgreSQL and full stack |
| VS Code / Cursor | Latest | Open `devsecops-rag-analyzer.code-workspace` |

## Quick start

```powershell
cd C:\Users\Ali\Documents\Projects\devsecops-rag-analyzer
.\scripts\setup.ps1
```

On Linux/macOS:

```bash
cd devsecops-rag-analyzer
./scripts/setup.sh
```

1. Copy secrets: edit `.env` (from `.env.example`).
2. Start the full stack:
   ```powershell
   docker compose up -d
   ```
3. Seed demo data:
   ```powershell
   .\scripts\seed.ps1
   ```
4. Open **http://localhost:4200**

Recommended startup order for manual dev: `postgres` → `rag-engine` → `backend` → `frontend` → `ingest-worker`.

## API overview

| Endpoint | Service | Purpose |
|----------|---------|---------|
| `POST /api/chat` | NestJS | User queries → RAG engine |
| `POST /api/chat/stream` | NestJS | SSE streaming answers |
| `GET /api/health` | NestJS | API + RAG health |
| `POST /api/webhooks/gitlab` | NestJS | CI/CD webhooks |
| `POST /api/ingest/logs` | NestJS | Runtime log forwarding |
| `POST /api/ingest/scrape/k8s` | NestJS | K8s manifest scrape |
| `POST /api/ingest/scrape/ansible` | NestJS | Ansible playbook scrape |
| `GET /api/ingest/jobs` | NestJS | List ingestion jobs |
| `GET /api/ingest/jobs/:id` | NestJS | Job status detail |
| `POST /query` | RAG | Hybrid retrieval + LLM |
| `POST /ingest` | RAG | Index chunks |

WebSocket events: `ws://localhost:3000/events` (incident feed).

Use `api/dev.http` with the REST Client extension.

## LLM choice

**Development:** `LLM_PROVIDER=openai` with `OPENAI_API_KEY` is the fastest path.

**Private / on-prem:** `LLM_PROVIDER=ollama` — Ollama runs in Docker Compose; pull models on first use:

```powershell
docker exec devops-rag-ollama ollama pull llama3.2
docker exec devops-rag-ollama ollama pull nomic-embed-text
```

Hybrid retrieval works without an LLM key; generation returns a placeholder until configured.

## Project structure

```
devsecops-rag-analyzer/
├── frontend/          # Angular dashboard
├── backend/           # NestJS API gateway
├── rag-engine/        # FastAPI + hybrid RAG
├── scripts/           # setup.ps1, setup.sh, seed, init-db.sql
├── deploy/aws/        # EKS manifests + deployment guide
├── docker-compose.yml
└── docs/
```

## Docker (full stack)

```powershell
docker compose up -d
# Optional periodic scraper:
docker compose --profile scraper up -d
```

Services: `postgres`, `rag-engine`, `backend`, `frontend`, `ingest-worker`, `ollama`.

## AWS deployment

See [deploy/aws/README.md](deploy/aws/README.md) for EKS deployment and S3 log archival.

## Troubleshooting

**"RAG engine is unreachable"** — the NestJS backend cannot reach FastAPI on `RAG_ENGINE_URL`.

1. Check health: `http://localhost:3000/api/health` — `rag_engine.status` should be `ok`.
2. Ensure the RAG engine is running:
   ```powershell
   cd rag-engine
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --port 8001
   ```
3. If port **8000** is taken by another app (common on Windows), set in `.env`:
   ```
   RAG_ENGINE_URL=http://localhost:8001
   ```
   and restart the backend.
4. Use `postgresql+psycopg://` in `DATABASE_URL` (not `postgresql://`) for local Python runs.

## Documentation

- [docs/Description.md](docs/Description.md) — full project assessment
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — phase checklist
- [docs/PROJECT_DESCRIPTION.md](docs/PROJECT_DESCRIPTION.md) — vision and architecture
