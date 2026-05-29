"""LLM generation with retrieved context."""

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


def generate_answer(settings: Settings, prompt: str) -> str:
    if settings.llm_provider == "ollama":
        return _generate_ollama(settings, prompt)
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return _generate_openai(settings, prompt)
    return (
        "[RAG engine] Configure OPENAI_API_KEY or set LLM_PROVIDER=ollama. "
        "Retrieval ran; generation skipped."
    )


def _generate_openai(settings: Settings, prompt: str) -> str:
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key)
    response = llm.invoke(prompt)
    return response.content if hasattr(response, "content") else str(response)


def _generate_ollama(settings: Settings, prompt: str) -> str:
    from langchain_community.chat_models import ChatOllama

    llm = ChatOllama(base_url=settings.ollama_base_url, model=settings.ollama_model)
    response = llm.invoke(prompt)
    return response.content if hasattr(response, "content") else str(response)
