# Implementation plan (mapped to repo)

| Phase | Goal | Location |
|-------|------|----------|
| **1** | Ingestion & chunking | `backend/src/ingest`, `backend/src/webhooks`, `rag-engine/app/ingestion/` |
| **2** | Hybrid RAG (dense + sparse + RRF) | `rag-engine/app/retrieval/` |
| **3** | API gateway & agent orchestration | `backend/src/chat`, `rag-engine/app/services/llm.py` |
| **4** | Angular dashboard & context panel | `frontend/src/app/features/dashboard/` |
| **5** | Docker & AWS | `docker-compose.yml`, `deploy/aws/`, Dockerfiles |

## Phase 1 checklist

- [x] GitLab webhook → `POST /api/webhooks/gitlab`
- [x] K8s manifest scraper (`rag-engine/app/ingestion/scrapers/k8s.py`, `POST /api/ingest/scrape/k8s`)
- [x] Ansible playbook fetcher (`rag-engine/app/ingestion/scrapers/ansible.py`, `POST /api/ingest/scrape/ansible`)
- [x] Runtime log forwarding → `POST /api/ingest/logs`
- [x] Chunking by logical block / log traceback
- [x] Metadata: timestamp, environment, source_type, service
- [x] DB-backed `ingestion_jobs` + job status API
- [x] Terraform scraper

## Phase 2

- [x] pgvector dense search
- [x] PostgreSQL FTS sparse search
- [x] RRF merge (`rag-engine/app/retrieval/rrf.py`)
- [x] Metadata filters (`environment`, `source_types`)

## Phase 3

- [x] `POST /api/chat` and `POST /api/chat/stream` (SSE)
- [x] Request validation (`ValidationPipe`)
- [x] Optional API key auth
- [x] WebSocket incident events (`/events`)
- [x] Rate limiting / OpenAPI

## Phase 4

- [x] Streaming chat UI
- [x] Context visualizer with line highlighting
- [x] Environment and source-type filters
- [x] Multi-turn chat history
- [x] Real-time incident feed (WebSocket)
- [x] Markdown answer rendering

## Phase 5

- [x] docker-compose (postgres, rag-engine, backend, frontend, ingest-worker)
- [x] Ollama service (`docker compose --profile ollama up -d`)
- [x] AWS EKS manifests + deployment guide (`deploy/aws/`)
- [x] Linux/macOS setup script (`scripts/setup.sh`)
- [x] Full Terraform IaC for AWS

## LLM options

Set in `.env`:

- `LLM_PROVIDER=openai` + `OPENAI_API_KEY` (fastest to prototype)
- `LLM_PROVIDER=ollama` for on-prem / private logs (Docker: `docker compose --profile ollama up -d`)
