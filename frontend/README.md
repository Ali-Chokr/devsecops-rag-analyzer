# Frontend (Angular)

Dashboard for incident queries: streaming chat, retrieved-context panel, environment/source filters, and a live incident feed.

See the [root README](../README.md) for full-stack setup.

## Run locally

```bash
npm install
npm start
```

Opens **http://localhost:4200**. Dev server proxies `/api` to the NestJS backend.

Requires the backend and RAG engine to be running (or use `docker compose up`).

## Key paths

| Path | Purpose |
|------|---------|
| `src/app/features/dashboard/` | Chat UI, filters, streaming status |
| `src/app/core/services/chat.service.ts` | SSE client for `/api/chat/stream` |
| `src/app/core/pipes/markdown.pipe.ts` | Markdown rendering for answers |
| `src/environments/` | API URL and optional API key |

## Build

```bash
npm run build          # production bundle
ng test                # unit tests
```

Production image is built via `frontend/Dockerfile` and served by nginx in Docker Compose.
