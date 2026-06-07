import json
import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.retrieval.hybrid import hybrid_retrieve
from app.schemas import (
    ChunkResult,
    HealthResponse,
    IngestDocument,
    IngestRequest,
    QueryRequest,
    QueryResponse,
)
from app.services.embeddings import embed_query
from app.services.llm import build_prompt, generate_answer, stream_answer
from app.services.sse import format_sse

app = FastAPI(
    title="DevOps RAG Engine",
    description="Hybrid dense + sparse retrieval with RRF for infrastructure context",
    version="0.1.0",
)

logger = logging.getLogger(__name__)

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
    prior_messages = (
        [{"role": m.role, "content": m.content} for m in body.messages]
        if body.messages
        else None
    )
    prompt = build_prompt(body.query, raw_chunks, prior_messages)
    answer = generate_answer(settings, prompt, raw_chunks)
    return QueryResponse(answer=answer, chunks=chunks)


@app.post("/query/stream")
def query_stream(
    body: QueryRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    raw_chunks, chunks = _run_retrieval(body, db, settings)
    prior_messages = (
        [{"role": m.role, "content": m.content} for m in body.messages]
        if body.messages
        else None
    )
    prompt = build_prompt(body.query, raw_chunks, prior_messages)

    def event_stream():
        try:
            yield format_sse(
                "chunks",
                {"chunks": [chunk.model_dump() for chunk in chunks]},
            )
            parts: list[str] = []
            for token in stream_answer(settings, prompt, raw_chunks):
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


def _delete_by_source_keys(db: Session, source_keys: set[str]) -> int:
    if not source_keys:
        return 0
    result = db.execute(
        text(
            """
            DELETE FROM document_chunks
            WHERE metadata->>'source_key' = ANY(:keys)
            """
        ),
        {"keys": list(source_keys)},
    )
    return result.rowcount or 0


@app.post("/ingest")
def ingest(
    body: IngestRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Ingest documents (Phase 1 pipeline entry point). Embeddings optional until API key set."""
    source_keys = {
        doc.source_key
        for doc in body.documents
        if doc.source_key
    }
    deleted = 0
    if body.replace_source_keys and source_keys:
        deleted = _delete_by_source_keys(db, source_keys)

    inserted = 0
    for doc in body.documents:
        try:
            embedding = embed_query(settings, doc.content)
        except Exception as exc:
            logger.warning("Embedding generation failed during ingest; storing chunk without embedding: %s", exc)
            embedding = None
        # Validate embedding dimensionality to avoid DB errors (pgvector expects fixed dim)
        if embedding is not None and hasattr(settings, "embedding_dimension"):
            try:
                if len(embedding) != settings.embedding_dimension:
                    logger.warning(
                        "Embedding dimension mismatch (%s != %s); storing NULL instead",
                        len(embedding),
                        settings.embedding_dimension,
                    )
                    embedding = None
            except Exception:
                # If embedding isn't sized as expected, drop it
                embedding = None
        emb_sql = "CAST(:embedding AS vector)" if embedding else "NULL"
        sql = text(
            f"""
            INSERT INTO document_chunks (content, embedding, metadata, source_type, environment, service_name)
            VALUES (:content, {emb_sql}, CAST(:metadata AS jsonb), :source_type, :environment, :service_name)
            """
        )
        metadata = dict(doc.metadata)
        if doc.source_key:
            metadata["source_key"] = doc.source_key
        params = {
            "content": doc.content,
            "metadata": json.dumps(metadata),
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
    return {"inserted": inserted, "deleted": deleted, "replaced_keys": sorted(source_keys)}


@app.delete("/chunks")
def delete_chunks(
    source_key: str | None = None,
    seed_file: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Delete chunks by source_key or legacy seed_file metadata."""
    if source_key:
        result = db.execute(
            text("DELETE FROM document_chunks WHERE metadata->>'source_key' = :key"),
            {"key": source_key},
        )
        db.commit()
        return {"deleted": result.rowcount or 0, "source_key": source_key}
    if seed_file:
        result = db.execute(
            text("DELETE FROM document_chunks WHERE metadata->>'seed_file' = :file"),
            {"file": seed_file},
        )
        db.commit()
        return {"deleted": result.rowcount or 0, "seed_file": seed_file}
    raise HTTPException(
        status_code=400,
        detail="Provide source_key or seed_file query parameter",
    )


@app.patch("/chunks/{chunk_id}")
def update_chunk(
    chunk_id: str,
    body: IngestDocument,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Update a single chunk's content and metadata."""
    embedding = None
    try:
        embedding = embed_query(settings, body.content)
    except Exception as exc:
        logger.warning("Embedding update failed; keeping existing embedding: %s", exc)

    metadata = dict(body.metadata)
    if body.source_key:
        metadata["source_key"] = body.source_key

    params = {
        "id": chunk_id,
        "content": body.content,
        "metadata": json.dumps(metadata),
        "source_type": body.source_type,
        "environment": body.environment,
        "service_name": body.service_name,
    }

    if embedding is not None and len(embedding) == settings.embedding_dimension:
        db.execute(
            text(
                """
                UPDATE document_chunks
                SET content = :content,
                    embedding = CAST(:embedding AS vector),
                    metadata = CAST(:metadata AS jsonb),
                    source_type = :source_type,
                    environment = :environment,
                    service_name = :service_name,
                    updated_at = NOW()
                WHERE id::text = :id
                """
            ),
            {**params, "embedding": str(embedding)},
        )
    else:
        db.execute(
            text(
                """
                UPDATE document_chunks
                SET content = :content,
                    metadata = CAST(:metadata AS jsonb),
                    source_type = :source_type,
                    environment = :environment,
                    service_name = :service_name,
                    updated_at = NOW()
                WHERE id::text = :id
                """
            ),
            params,
        )

    db.commit()
    return {"updated": True, "id": chunk_id}


@app.delete("/chunks/{chunk_id}")
def delete_chunk(
    chunk_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Delete a single chunk by ID."""
    result = db.execute(
        text("DELETE FROM document_chunks WHERE id::text = :id"),
        {"id": chunk_id},
    )
    db.commit()
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Chunk not found")
    return {"deleted": 1, "id": chunk_id}
