# DevOps RAG Assistant

Hybrid RAG platform for infrastructure context: **Angular** UI, **NestJS** API, **FastAPI** RAG engine, **PostgreSQL + pgvector**.

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| Node.js | 20+ | Installed ✓ |
| Python | 3.11–3.12 recommended | 3.14 works; use venv from setup script |
| Docker Desktop | Latest | Required for PostgreSQL locally (not detected on first setup) |
| VS Code / Cursor | Latest | Open `devops-rag-assistant.code-workspace` |

## Quick start

```powershell
cd C:\Users\chokr\OneDrive\Desktop\devops-rag-assistant
.\scripts\setup.ps1
```

1. Copy secrets: edit `.env` (from `.env.example`).
2. Start database:
   ```powershell
   docker compose up -d postgres
   ```
3. Run services (three terminals):

   ```powershell
   # Terminal 1 - RAG engine
   cd rag-engine
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --port 8000

   # Terminal 2 - NestJS API
   cd backend
   npm run start:dev

   # Terminal 3 - Angular UI
   cd frontend
   npm start
   ```

4. Open **http://localhost:4200**

Note: the RAG engine has a service-specific README with venv and uvicorn instructions at `rag-engine/README.md`.
Recommended startup order after running the setup script: `postgres` → `rag-engine` → `backend` → `frontend`.

## VS Code / Cursor workspace

Open **`devops-rag-assistant.code-workspace`** for:

- Multi-root folders (frontend, backend, rag-engine)
- Recommended extensions (Angular, Python, Docker, ESLint, Prettier)
- Debug configs: **Backend: NestJS**, **RAG Engine: FastAPI**, **Full stack** compound

Install recommended extensions when prompted.

## API overview

| Endpoint | Service | Purpose |
|----------|---------|---------|
| `POST /api/chat` | NestJS | User queries → RAG engine |
| `GET /api/health` | NestJS | API + RAG health |
| `POST /api/webhooks/gitlab` | NestJS | CI/CD webhooks (Phase 1) |
| `POST /query` | RAG | Hybrid retrieval + LLM |
| `POST /ingest` | RAG | Index chunks |

Use `api/dev.http` with the REST Client extension.

## LLM choice

**Development:** `LLM_PROVIDER=openai` with `OPENAI_API_KEY` is the fastest path.

**Private / on-prem:** `LLM_PROVIDER=ollama`, run [Ollama](https://ollama.com), pull `llama3.2` and `nomic-embed-text`.

Hybrid retrieval works without an LLM key; generation returns a placeholder until configured.

## Project structure

```
devops-rag-assistant/
├── frontend/          # Angular dashboard
├── backend/           # NestJS API gateway
├── rag-engine/        # FastAPI + hybrid RAG
├── scripts/           # setup.ps1, init-db.sql
├── docker-compose.yml
└── docs/IMPLEMENTATION_PLAN.md
```

## Docker (full stack)

After installing Docker Desktop:

```powershell
docker compose up -d
```

## Next implementation steps

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for phase-by-phase tasks aligned with your plan.
