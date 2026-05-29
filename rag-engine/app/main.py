import json

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
from app.services.llm import build_prompt, generate_answer

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


@app.post("/query", response_model=QueryResponse)
def query(
    body: QueryRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> QueryResponse:
    embedding = embed_query(settings, body.query)
    raw_chunks = hybrid_retrieve(db, settings, body.query, embedding)
    prompt = build_prompt(body.query, raw_chunks)
    answer = generate_answer(settings, prompt)

    chunks = [
        ChunkResult(
            id=str(c["id"]),
            content=c["content"],
            source_type=c.get("source_type", "unknown"),
            metadata=c.get("metadata") or {},
            score=c.get("rrf_score") or c.get("dense_score") or c.get("sparse_score"),
        )
        for c in raw_chunks
    ]
    return QueryResponse(answer=answer, chunks=chunks)


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
            VALUES (:content, {emb_sql}, :metadata::jsonb, :source_type, :environment, :service_name)
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
