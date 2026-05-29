# Implementation plan (mapped to repo)

| Phase | Goal | Location |
|-------|------|----------|
| **1** | Ingestion & chunking | `backend/src/webhooks`, future `rag-engine/app/ingestion/` |
| **2** | Hybrid RAG (dense + sparse + RRF) | `rag-engine/app/retrieval/` |
| **3** | API gateway & agent orchestration | `backend/src/chat`, `rag-engine/app/services/llm.py` |
| **4** | Angular dashboard & context panel | `frontend/src/app/features/dashboard/` |
| **5** | Docker & AWS | `docker-compose.yml`, Dockerfiles, `.env` AWS vars |

## Phase 1 checklist

- [ ] GitLab webhook → `POST /api/webhooks/gitlab`
- [ ] K8s manifest scraper script
- [ ] Ansible playbook fetcher
- [ ] Chunking by logical block / log traceback
- [ ] Metadata: timestamp, environment, source_type, service

## Phase 2 (started)

- [x] pgvector dense search
- [x] PostgreSQL FTS sparse search
- [x] RRF merge (`rag-engine/app/retrieval/rrf.py`)

## LLM options

Set in `.env`:

- `LLM_PROVIDER=openai` + `OPENAI_API_KEY` (fastest to prototype)
- `LLM_PROVIDER=ollama` for on-prem / private logs
