#!/usr/bin/env bash
# DevSecOps RAG Analyzer - first-time setup (Linux/macOS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== DevSecOps RAG Analyzer setup ==="

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example - add OPENAI_API_KEY or set LLM_PROVIDER=ollama"
fi

VENV_PATH="$ROOT/rag-engine/.venv"
if [[ ! -d "$VENV_PATH" ]]; then
  echo "Creating Python venv in rag-engine/.venv ..."
  python3 -m venv "$VENV_PATH"
fi
"$VENV_PATH/bin/pip" install --upgrade pip
"$VENV_PATH/bin/pip" install -r "$ROOT/rag-engine/requirements.txt"

echo "Node dependencies (backend + frontend) ..."
(cd "$ROOT/backend" && npm install)
(cd "$ROOT/frontend" && npm install)

echo ""
echo "Setup complete."
echo "Next steps:"
echo "  1. docker compose up -d"
echo "  2. ./scripts/seed.ps1  # or python scripts/seed.py on Unix"
echo "  3. Open http://localhost:4200"
echo "  4. Optional Ollama: docker compose --profile ollama up -d"
