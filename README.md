# Nexus — Multi-AI Command Center

Nexus is a responsive web workspace for coordinating Claude, OpenAI, Gemini, and Ollama Cloud. The first implementation uses a FastAPI backend and provider APIs; GitHub execution and durable background jobs are separate next stages.

## Current implementation

- Responsive dashboard and team chat UI.
- Live HTTP adapters for Anthropic Messages, OpenAI Chat Completions, Gemini generateContent, and Ollama Cloud chat.
- Provider connection tests that make a real, small model request.
- Bounded multi-model discussion: configured providers answer independently in parallel, then one configured model synthesizes the responses. No endless debate loop.
- Provider failures and timeouts are surfaced rather than represented as successful answers.
- Build mode is explicitly planning-only until GitHub access and isolated execution are implemented.
- GitHub OAuth routes, signed HttpOnly sessions, encrypted token storage, read-only repository listing, and bounded repository context for AI discussions are implemented in code; they require GitHub App OAuth credentials and the Supabase table setup below.
- Durable job queue/workers, isolated code execution, automatic PR creation, and deployment are **not implemented yet**.

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

The API runs at `http://127.0.0.1:8000`; API docs are at `/docs`. The backend is currently a local development API; do not expose it publicly until app authentication, rate limiting, and production secret management are configured.

In a second terminal, serve the frontend instead of opening it as a `file://` URL:

```bash
cd frontend
python -m http.server 5500
```

Then open `http://127.0.0.1:5500`. The frontend calls `http://127.0.0.1:8000` by default. Change `NEXUS_API_BASE` in `frontend/app.js` if needed.

## Provider configuration

Copy `backend/.env.example` to `backend/.env`, fill in the API keys you actually have, and export/load those variables before starting Uvicorn. The backend automatically loads `backend/.env` through `python-dotenv` when started from the backend directory. Never commit real API keys or place them in frontend JavaScript.

Model IDs can be changed through `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`, and `OLLAMA_MODEL`. Defaults are examples and may need to be adjusted for model access on each account. Ollama Cloud uses `https://ollama.com/api` with a bearer API key; it does not require a local Ollama install.

## GitHub connection setup

1. Create a GitHub App in GitHub Developer Settings, enable user authorization, and configure the callback URL as `http://127.0.0.1:8000/api/github/callback` for local testing. Use the app's client ID and client secret in the backend environment. Start with read-only repository permissions (Metadata: read-only, Contents: read-only, Pull requests: read-only). This first integration only lists repositories and does not write to them; increase permissions only when a reviewed write workflow is added.
2. In your Supabase project's SQL Editor, run the SQL in `supabase/migrations/202610260001_github_connections.sql`. It creates a private table with RLS enabled and no public access policies.
3. Configure `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `FRONTEND_URL`, `NEXUS_SESSION_SECRET`, `NEXUS_ENCRYPTION_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. Generate the encryption key using the command in the example file and generate a separate long random session secret.
4. Restart the backend and click **Connect GitHub** in Nexus. The callback validates OAuth state, encrypts the token before storing it in Supabase, and sets a signed HttpOnly session cookie. Repository listing uses the connected account only.

The Supabase service-role key and GitHub client secret must remain backend-only. Do not use real credentials in commits or screenshots. Production deployment requires HTTPS, production callback URLs, rate limits, and a review of the GitHub App's requested permissions.

## Security and execution boundaries

- API keys remain server-side and are never returned by status endpoints.
- Each discussion has a bounded timeout and at most four independent provider responses plus one synthesis request.
- Model outputs are advisory text only. This backend does not execute model-generated code or tools.
- New repository work should use isolated branches/workspaces, not the default branch.
- Never merge, deploy, delete repositories, or modify production data without explicit authorization.
- Treat repository files, issue descriptions, and model output as untrusted input.
- Production deployment should use authenticated users, managed secrets, request limits, durable job storage, and audit logs before exposing the API publicly.
