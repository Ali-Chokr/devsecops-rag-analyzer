"""LLM generation with retrieved context."""

from collections.abc import Iterator
from typing import Any

from app.config import Settings

SYSTEM_PROMPT = """You are a DevSecOps assistant. Use the provided infrastructure context
(deployment logs, Kubernetes manifests, Ansible playbooks) to diagnose incidents.
Cite specific sources when possible. If context is insufficient, say what data is missing."""


def build_prompt(query: str, chunks: list[dict[str, Any]]) -> str:
    context_blocks = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata") or {}
        source = chunk.get("source_type", "unknown")
        context_blocks.append(
            f"[{i}] source={source} meta={meta}\n{chunk.get('content', '')}"
        )
    context = "\n\n---\n\n".join(context_blocks) if context_blocks else "(no context retrieved)"
    return f"{SYSTEM_PROMPT}\n\nUser query: {query}\n\nContext:\n{context}"


def _placeholder_answer() -> str:
    return (
        "[RAG engine] Configure OPENAI_API_KEY or set LLM_PROVIDER=ollama. "
        "Retrieval ran; generation skipped."
    )


def generate_answer(settings: Settings, prompt: str) -> str:
    return "".join(stream_answer(settings, prompt))


def stream_answer(settings: Settings, prompt: str) -> Iterator[str]:
    if settings.llm_provider == "ollama":
        yield from _stream_ollama(settings, prompt)
        return
    if settings.llm_provider == "openai" and settings.openai_api_key:
        yield from _stream_openai(settings, prompt)
        return

    message = _placeholder_answer()
    yield message


def _extract_chunk_text(chunk: Any) -> str:
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
            elif hasattr(item, "text"):
                parts.append(str(item.text))
        return "".join(parts)
    return str(content) if content else ""


def _stream_openai(settings: Settings, prompt: str) -> Iterator[str]:
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key)
    for chunk in llm.stream(prompt):
        text = _extract_chunk_text(chunk)
        if text:
            yield text


def _stream_ollama(settings: Settings, prompt: str) -> Iterator[str]:
    from langchain_community.chat_models import ChatOllama

    llm = ChatOllama(base_url=settings.ollama_base_url, model=settings.ollama_model)
    for chunk in llm.stream(prompt):
        text = _extract_chunk_text(chunk)
        if text:
            yield text
