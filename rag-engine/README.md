# RAG Engine (FastAPI)

Hybrid retrieval service: pgvector dense search + PostgreSQL full-text search, merged with RRF. Handles `/ingest`, `/query`, and SSE `/query/stream`.

See the [root README](../README.md) for full-stack setup.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # source .venv/bin/activate on Linux/macOS
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Or use `scripts/setup.ps1` from the repo root to create the venv automatically.

Requires PostgreSQL. Configuration is read from the repo-root `.env`.

## Key paths

| Path | Purpose |
|------|---------|
| `app/retrieval/` | Hybrid search, RRF, BM25 rerank |
| `app/ingestion/` | Chunking and scrapers (K8s, Ansible, Terraform) |
| `app/services/llm.py` | OpenAI, Anthropic, Ollama providers |
| `app/main.py` | FastAPI routes |

## Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL + pgvector (`postgresql+psycopg://...`) |
| `LLM_PROVIDER` | `openai`, `anthropic`, or `ollama` |
| `EMBEDDING_DIMENSION` | `1536` (OpenAI) or `768` (Ollama) — must match DB column |
| `RETRIEVAL_TOP_K` | Chunks returned per query |

## Tests

```bash
.\.venv\Scripts\python.exe -m pytest tests/ -q
```

Health check: **http://localhost:8000/health**
