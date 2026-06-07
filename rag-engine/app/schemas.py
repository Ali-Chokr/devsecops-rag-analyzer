from typing import Any

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="user | assistant")
    content: str = Field(..., min_length=1)


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Error code or incident description")
    environment: str | None = None
    source_types: list[str] | None = None
    messages: list[ChatMessage] | None = Field(
        default=None,
        description="Prior conversation turns for multi-turn RAG",
    )


class ChunkResult(BaseModel):
    id: str
    content: str
    source_type: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    score: float | None = None
    environment: str | None = None
    service_name: str | None = None


class QueryResponse(BaseModel):
    answer: str
    chunks: list[ChunkResult]


class IngestDocument(BaseModel):
    content: str
    source_type: str = Field(..., description="k8s | ansible | gitlab_ci | log | terraform")
    metadata: dict[str, Any] = Field(default_factory=dict)
    environment: str | None = None
    service_name: str | None = None
    source_key: str | None = Field(
        default=None,
        description="Unique key for dedup/reindex; existing chunks with this key are replaced",
    )


class IngestRequest(BaseModel):
    documents: list[IngestDocument]
    replace_source_keys: bool = Field(
        default=True,
        description="When true, delete existing chunks matching source_key before insert",
    )


class HealthResponse(BaseModel):
    status: str
    database: str
