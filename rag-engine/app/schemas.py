from typing import Any

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Error code or incident description")
    environment: str | None = None
    source_types: list[str] | None = None


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
    source_type: str = Field(..., description="k8s | ansible | gitlab_ci | log")
    metadata: dict[str, Any] = Field(default_factory=dict)
    environment: str | None = None
    service_name: str | None = None


class IngestRequest(BaseModel):
    documents: list[IngestDocument]


class HealthResponse(BaseModel):
    status: str
    database: str
