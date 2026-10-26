"""Minimal async adapters for Claude, OpenAI, Gemini, and Ollama Cloud.

Model names are configurable through environment variables. This module does not
execute tools or code; it only sends bounded text-generation requests.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

TIMEOUT = httpx.Timeout(45.0, connect=10.0)
MAX_OUTPUT_TOKENS = 1200

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-5",
    "openai": "gpt-4.1-mini",
    "gemini": "gemini-2.5-flash",
    "ollama": "gemma4:31b",
}

PROVIDER_KEYS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "ollama": "OLLAMA_API_KEY",
}


def configured(provider: str) -> bool:
    return bool(os.getenv(PROVIDER_KEYS[provider], "").strip())


def model_for(provider: str) -> str:
    return os.getenv(f"{provider.upper()}_MODEL", DEFAULT_MODELS[provider]).strip()


def _text_or_error(response: httpx.Response) -> dict[str, Any]:
    if response.is_error:
        # Avoid returning request headers or credentials to callers.
        try:
            payload = response.json()
            detail = payload.get("error", payload.get("message", "Provider request failed"))
            if isinstance(detail, dict):
                detail = detail.get("message", "Provider request failed")
        except ValueError:
            detail = "Provider request failed"
        raise RuntimeError(f"Provider returned HTTP {response.status_code}: {str(detail)[:500]}")
    return response.json()


async def generate(provider: str, prompt: str, *, system: str = "You are an agent in Nexus, a multi-model workbench.", max_tokens: int = MAX_OUTPUT_TOKENS) -> dict[str, str]:
    if provider not in PROVIDER_KEYS:
        raise ValueError("Unknown provider")
    key = os.getenv(PROVIDER_KEYS[provider], "").strip()
    if not key:
        raise RuntimeError("API key is not configured on the backend.")
    model = model_for(provider)
    headers: dict[str, str] = {"Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        if provider == "anthropic":
            headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json={"model": model, "max_tokens": max_tokens, "system": system,
                      "messages": [{"role": "user", "content": prompt}]},
            )
            data = _text_or_error(response)
            output = "\n".join(
                block.get("text", "") for block in data.get("content", [])
                if block.get("type") == "text"
            ).strip()
        elif provider == "openai":
            headers["Authorization"] = f"Bearer {key}"
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json={"model": model, "max_tokens": max_tokens,
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": prompt}]},
            )
            data = _text_or_error(response)
            output = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        elif provider == "gemini":
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": key},
                headers=headers,
                json={"systemInstruction": {"parts": [{"text": system}]},
                      "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                      "generationConfig": {"maxOutputTokens": max_tokens}},
            )
            data = _text_or_error(response)
            candidates = data.get("candidates") or []
            output = "\n".join(
                part.get("text", "")
                for part in (candidates[0].get("content", {}).get("parts", []) if candidates else [])
                if part.get("text")
            ).strip()
        else:
            base_url = os.getenv("OLLAMA_BASE_URL", "https://ollama.com/api").rstrip("/")
            headers["Authorization"] = f"Bearer {key}"
            response = await client.post(
                f"{base_url}/chat",
                headers=headers,
                json={"model": model, "stream": False,
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": prompt}],
                      "options": {"num_predict": max_tokens}},
            )
            data = _text_or_error(response)
            output = (data.get("message") or {}).get("content", "").strip()

    if not isinstance(output, str) or not output.strip():
        raise RuntimeError("Provider returned an empty text response.")
    return {"provider": provider, "model": model, "text": output.strip()}
