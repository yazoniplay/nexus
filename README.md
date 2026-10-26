# Nexus — Multi-AI Command Center

Nexus is a web workspace for coordinating Claude, OpenAI models, Gemini, and Ollama Cloud across GitHub projects. It is designed for hybrid execution: interactive development workspaces plus GitHub Actions for CI and deployment.

## Current status

**Foundation scaffold.** The responsive dashboard and initial FastAPI API are in place. Real model calls, GitHub App OAuth, durable task storage, and isolated code execution are not implemented yet. The UI deliberately does not pretend that providers or repositories are connected.

## Planned capabilities

- Shared team chat with directed messages and bounded multi-model discussions.
- GitHub App integration for selecting repositories and working on isolated branches.
- Provider adapters for Anthropic, OpenAI, Google Gemini, and Ollama Cloud.
- Durable background tasks, run logs, budgets, retries, and cancellation.
- Isolated code execution, tests, review, and pull-request preparation.
- Human approval gates for destructive or production-impacting actions.

## Development

Requirements: Python 3.11+.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://127.0.0.1:8000`; interactive API docs are at `/docs`.

Open `frontend/index.html` in a browser for the current UI scaffold. The frontend uses `http://127.0.0.1:8000` by default. Set `NEXUS_API_BASE` in `frontend/app.js` if needed.

## Configuration

Copy `backend/.env.example` to `backend/.env` and add credentials privately. Never commit real API keys.

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `OLLAMA_API_KEY`
- `OLLAMA_BASE_URL` (defaults to `https://ollama.com/api`)

GitHub App and Supabase settings are documented as planned configuration and are not wired up in this scaffold.

Do not expose provider keys in frontend code. For production, use a managed secret store and authenticated backend.

## Safety defaults

- New work should happen on isolated branches/workspaces, not directly on a default branch.
- Never merge, deploy to production, delete repositories, or modify production data without explicit authorization.
- Treat repository content and issue text as untrusted input.
- Use bounded retries, timeouts, and token/cost budgets.
