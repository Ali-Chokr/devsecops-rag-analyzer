# RAG Engine (FastAPI)

Quick startup instructions for local development of the RAG engine.

Prerequisites
- Python 3.11–3.12 (3.14 may work but 3.11/3.12 recommended)
- Docker Desktop (to run PostgreSQL via docker-compose)
- A `.env` file at the repo root populated from `.env.example`

Create and activate the venv (PowerShell)

```powershell
cd C:\Users\chokr\OneDrive\Desktop\devops-rag-assistant\rag-engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Create and activate the venv (macOS / Linux)

```bash
cd /path/to/devops-rag-assistant/rag-engine
python -m venv .venv
source .venv/bin/activate
```

Install Python dependencies

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

Run the app (development)

```powershell
# inside rag-engine with venv activated
uvicorn app.main:app --reload --port 8000
```

Notes on configuration
- The project reads configuration from the repository `.env` file (copy from `.env.example`).
- Required items include `DATABASE_URL` (Postgres), `LLM_PROVIDER` and provider-specific keys (for example `OPENAI_API_KEY` when `LLM_PROVIDER=openai`).
- Default RAG engine port: `8000`. Backend (NestJS) expects to reach this service via the URL set in its `.env` (RAG_ENGINE_URL).

Postgres (local)
- Start Postgres via docker compose from the repo root:

```powershell
cd C:\Users\chokr\OneDrive\Desktop\devops-rag-assistant
docker compose up -d postgres
```

Health checks
- Backend health endpoint: `GET http://localhost:3000/api/health` (if backend is running).
- RAG engine root: `GET http://localhost:8000/` or any health endpoint implemented in `app`.

Troubleshooting
- If `uvicorn` reports missing packages, make sure the venv is activated and `pip install -r requirements.txt` completed successfully.
- If Postgres is not reachable, confirm `docker compose ps` shows the `postgres` service and that `DATABASE_URL` matches the host/port.
- If you see warnings about `pip` upgrade, run the suggested upgrade inside the venv: `python -m pip install --upgrade pip`.

Developer tips
- Use the existing repository `scripts/setup.ps1` to automate venv creation and dependency installation on Windows.
- Use `uvicorn` with `--reload` for iterative development; for production, run with a proper process manager.

Contact
- If you need environment-specific help (LLM keys, provider selection), add details to the repo `README.md` or open an issue locally.
