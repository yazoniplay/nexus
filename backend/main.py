"""Nexus API foundation.

Provider keys are only inspected server-side. Actual model calls, GitHub OAuth,
durable job storage, and isolated execution are deliberately not faked here.
"""
from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Nexus API",
    version="0.1.0",
    description="Multi-provider AI orchestration foundation",
)

_origins = [
    item.strip()
    for item in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000",
    ).split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

PROVIDER_ENV = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "ollama": "OLLAMA_API_KEY",
}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    mode: Literal["discuss", "plan", "build"] = "discuss"


@app.get("/")
def root():
    return {"name": "Nexus API", "version": "0.1.0", "docs": "/docs"}


@app.get("/api/status")
def status():
    configured = {
        provider: {"configured": bool(os.getenv(env_name, "").strip())}
        for provider, env_name in PROVIDER_ENV.items()
    }
    # Counts stay zero until durable task/repository integrations are implemented.
    return {
        "status": "ok",
        "providers": configured,
        "repository_count": 0,
        "active_runs": 0,
        "attention_count": 0,
    }


@app.post("/api/providers/{provider}/test")
async def test_provider(provider: str):
    if provider not in PROVIDER_ENV:
        raise HTTPException(status_code=404, detail="Unknown provider.")
    if not os.getenv(PROVIDER_ENV[provider], "").strip():
        raise HTTPException(status_code=400, detail="Provider API key is not configured on the backend.")
    # A key's presence is not proof of connectivity; provider-specific API tests are
    # implemented alongside each provider adapter in a later step.
    raise HTTPException(
        status_code=501,
        detail="Credential is present, but live provider verification is not implemented yet.",
    )


@app.get("/api/github/repositories")
def github_repositories():
    raise HTTPException(
        status_code=501,
        detail="GitHub App OAuth and repository selection are not implemented yet.",
    )


@app.post("/api/chat")
def chat(request: ChatRequest):
    # Do not imply model execution before adapters and orchestration exist.
    raise HTTPException(
        status_code=501,
        detail="AI orchestration is not implemented yet. No model was called and no task was started.",
    )
