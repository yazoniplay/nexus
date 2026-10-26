# Nexus — Multi-AI Command Center

Nexus is a responsive web workspace for coordinating Claude, OpenAI, Gemini, and Ollama Cloud. The first implementation uses a FastAPI backend and provider APIs; GitHub execution and durable background jobs are separate next stages.

## Current implementation

- Responsive dashboard and team chat UI.
- Live HTTP adapters for Anthropic Messages, OpenAI Chat Completions, Gemini generateContent, and Ollama Cloud chat.
- Provider connection tests that make a real, small model request.
- Bounded multi-model discussion: configured providers answer independently in parallel, then one configured model synthesizes the responses. No endless debate loop.
- Provider failures and timeouts are surfaced rather than represented as successful answers.
- Build mode is explicitly planning-only until GitHub access and isolated execution are implemented.
- GitHub App OAuth, repository listing, Supabase-backed durable jobs, background workers, isolated code execution, automatic PR creation, and deployment are **not implemented yet**.

## Development

Requirements: Python 3.11+.

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://127.0.0.1:8000`; API docs are at `/docs`.

In a second terminal, serve the frontend instead of opening it as a `file://` URL:

```bash
cd frontend
python -m http.server 5500
```

Then open `http://127.0.0.1:5500`. The frontend calls `http://127.0.0.1:8000` by default. Change `NEXUS_API_BASE` in `frontend/app.js` if needed.

## Provider configuration

Copy `backend/.env.example` to `backend/.env`, fill in the API keys you actually have, and export/load those variables before starting Uvicorn. The backend automatically loads `backend/.env` through `python-dotenv` when started from the backend directory. Never commit real API keys or place them in frontend JavaScript.

Model IDs can be changed through `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`, and `OLLAMA_MODEL`. Defaults are examples and may need to be adjusted for model access on each account. Ollama Cloud uses `https://ollama.com/api` with a bearer API key; it does not require a local Ollama install.

## Security and execution boundaries

- API keys remain server-side and are never returned by status endpoints.
- Each discussion has a bounded timeout and at most four independent provider responses plus one synthesis request.
- Model outputs are advisory text only. This backend does not execute model-generated code or tools.
- New repository work should use isolated branches/workspaces, not the default branch.
- Never merge, deploy, delete repositories, or modify production data without explicit authorization.
- Treat repository files, issue descriptions, and model output as untrusted input.
- Production deployment should use authenticated users, managed secrets, request limits, durable job storage, and audit logs before exposing the API publicly.
