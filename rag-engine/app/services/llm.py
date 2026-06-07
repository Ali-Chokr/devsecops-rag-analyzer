"""LLM generation with retrieved context and a deterministic fallback.

This module provides streaming generation and a small deterministic
fallback synthesizer that produces an evidence-cited answer from the
retrieved chunks when the configured LLM is unavailable or fails.
"""

from collections.abc import Iterator
from typing import Any, Iterable, List
import logging
import json

from app.config import Settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a DevSecOps assistant. Use ONLY the provided Context blocks to"
    " diagnose incidents. Cite supporting sources inline as [n], where n is the"
    " chunk index in the provided context. If the context clearly supports a"
    " single likely cause, state it in one sentence, then list concise evidence"
    " lines referencing the chunk numbers. If context is missing, say so and"
    " provide a short list of plausible causes labeled as speculation. Keep the"
    " answer focused and evidence-based."
)


def build_prompt(
    query: str,
    chunks: list[dict[str, Any]],
    messages: list[dict[str, str]] | None = None,
) -> str:
    context_blocks: List[str] = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata") or {}
        source = chunk.get("source_type", "unknown")
        context_blocks.append(f"[{i}] source={source} meta={meta}\n{chunk.get('content', '')}")
    context = "\n\n---\n\n".join(context_blocks) if context_blocks else "(no context retrieved)"

    history = ""
    if messages:
        history_lines = [
            f"{msg.get('role', 'user').title()}: {msg.get('content', '')}"
            for msg in messages
            if msg.get("content")
        ]
        if history_lines:
            history = "Conversation history:\n" + "\n".join(history_lines) + "\n\n"

    return f"{SYSTEM_PROMPT}\n\n{history}User query: {query}\n\nContext:\n{context}"


def _synthesise_from_chunks(query: str, chunks: Iterable[dict[str, Any]]) -> str:
    chunks = list(chunks)
    if not chunks:
        return "No relevant context retrieved; cannot determine root cause from available data."

    keywords = ["timeout", "5s", "30s", "reduced", "change_ref", "timeout_ms"]
    evidence = []
    for idx, c in enumerate(chunks, 1):
        text = (c.get("content") or "").lower()
        meta = json.dumps(c.get("metadata", {})).lower()
        if any(k in text or k in meta for k in keywords):
            snippet = summarize_snippet(c.get("content", ""), 200)
            evidence.append((idx, snippet))

    if evidence:
        first_idx, first_snip = evidence[0]
        lines = [
            f"Likely cause: configuration change affecting timeouts or retries (see [{first_idx}]).",
            "Evidence:",
        ]
        for idx, snip in evidence:
            lines.append(f"[{idx}] {snip}")
        return "\n".join(lines)

    lines = ["Summary of retrieved context:"]
    for idx, c in enumerate(chunks[:3], 1):
        lines.append(f"[{idx}] {c.get('source_type','unknown')} - {summarize_snippet(c.get('content',''), 180)}")
    lines.append("No direct evidence of the root cause found; consider providing more logs or configuration.")
    return "\n".join(lines)


def summarize_snippet(text: str, max_chars: int) -> str:
    t = (text or "").strip().replace("\n", " ")
    return (t[: max_chars - 3] + "...") if len(t) > max_chars else t


def generate_answer(settings: Settings, prompt: str, raw_chunks: list[dict[str, Any]] | None = None) -> str:
    try:
        return "".join(stream_answer(settings, prompt, raw_chunks))
    except Exception as exc:
        logger.warning("LLM generation failed: %s", exc)
        return _synthesise_from_chunks(prompt, raw_chunks or [])


def stream_answer(settings: Settings, prompt: str, raw_chunks: list[dict[str, Any]] | None = None) -> Iterator[str]:
    raw_chunks = raw_chunks or []
    try:
        if settings.llm_provider == "ollama":
            yield from _stream_ollama(settings, prompt)
            return
        if settings.llm_provider == "anthropic" and getattr(settings, "anthropic_api_key", None):
            yield from _stream_anthropic(settings, prompt)
            return
        if settings.llm_provider == "openai" and getattr(settings, "openai_api_key", None):
            yield from _stream_openai(settings, prompt)
            return
    except Exception as exc:
        logger.warning("LLM stream failed: %s", exc)

    # deterministic fallback
    yield _synthesise_from_chunks(prompt, raw_chunks)


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


def _stream_anthropic(settings: Settings, prompt: str) -> Iterator[str]:
    from langchain_anthropic import ChatAnthropic

    llm = ChatAnthropic(
        model=getattr(settings, "anthropic_model", "claude-sonnet-4-20250514"),
        api_key=settings.anthropic_api_key,
    )
    for chunk in llm.stream(prompt):
        text = _extract_chunk_text(chunk)
        if text:
            yield text


def _stream_ollama(settings: Settings, prompt: str) -> Iterator[str]:
    try:
        from langchain_ollama import ChatOllama
    except Exception:
        from langchain_community.chat_models import ChatOllama

    llm = ChatOllama(base_url=settings.ollama_base_url, model=settings.ollama_model)
    for chunk in llm.stream(prompt):
        text = _extract_chunk_text(chunk)
        if text:
            yield text
