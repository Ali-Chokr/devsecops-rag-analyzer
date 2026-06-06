import json

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.retrieval.hybrid import hybrid_retrieve
from app.schemas import (
    HealthResponse,
    IngestRequest,
    QueryRequest,
    QueryResponse,
    ChunkResult,
)
from app.services.embeddings import embed_query
from app.services.llm import build_prompt, generate_answer, stream_answer
from app.services.sse import format_sse

app = FastAPI(
    title="DevOps RAG Engine",
    description="Hybrid dense + sparse retrieval with RRF for infrastructure context",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        db_status = f"error: {exc}"
    return HealthResponse(
        status="ok" if db_status == "connected" else "degraded",
        database=db_status,
    )


def _serialize_chunks(raw_chunks: list[dict]) -> list[ChunkResult]:
    return [
        ChunkResult(
            id=str(c["id"]),
            content=c["content"],
            source_type=c.get("source_type", "unknown"),
            metadata=c.get("metadata") or {},
            score=c.get("rrf_score") or c.get("dense_score") or c.get("sparse_score"),
            environment=c.get("environment"),
            service_name=c.get("service_name"),
        )
        for c in raw_chunks
    ]


def _run_retrieval(
    body: QueryRequest,
    db: Session,
    settings: Settings,
) -> tuple[list[dict], list[ChunkResult]]:
    embedding = embed_query(settings, body.query)
    raw_chunks = hybrid_retrieve(
        db,
        settings,
        body.query,
        embedding,
        environment=body.environment,
        source_types=body.source_types,
    )
    return raw_chunks, _serialize_chunks(raw_chunks)


@app.post("/query", response_model=QueryResponse)
def query(
    body: QueryRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> QueryResponse:
    raw_chunks, chunks = _run_retrieval(body, db, settings)
    prompt = build_prompt(body.query, raw_chunks)
    answer = generate_answer(settings, prompt)
    return QueryResponse(answer=answer, chunks=chunks)


@app.post("/query/stream")
def query_stream(
    body: QueryRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    raw_chunks, chunks = _run_retrieval(body, db, settings)
    prompt = build_prompt(body.query, raw_chunks)

    def event_stream():
        try:
            yield format_sse(
                "chunks",
                {"chunks": [chunk.model_dump() for chunk in chunks]},
            )
            parts: list[str] = []
            for token in stream_answer(settings, prompt):
                parts.append(token)
                yield format_sse("token", {"content": token})
            yield format_sse("done", {"answer": "".join(parts)})
        except Exception as exc:
            yield format_sse("error", {"message": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/ingest")
def ingest(
    body: IngestRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Ingest documents (Phase 1 pipeline entry point). Embeddings optional until API key set."""
    inserted = 0
    for doc in body.documents:
        embedding = embed_query(settings, doc.content)
        emb_sql = ":embedding::vector" if embedding else "NULL"
        sql = text(
            f"""
            INSERT INTO document_chunks (content, embedding, metadata, source_type, environment, service_name)
            VALUES (:content, {emb_sql}, CAST(:metadata AS jsonb), :source_type, :environment, :service_name)
            """
        )
        params = {
            "content": doc.content,
            "metadata": json.dumps(doc.metadata),
            "source_type": doc.source_type,
            "environment": doc.environment,
            "service_name": doc.service_name,
        }
        if embedding:
            params["embedding"] = str(embedding)
        try:
            db.execute(sql, params)
            inserted += 1
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    db.commit()
    return {"inserted": inserted}
