# Nexus — Multi-AI Command Center

Nexus is a responsive web workspace for coordinating Claude, OpenAI, Gemini, and Ollama Cloud. The first implementation uses a FastAPI backend and provider APIs; GitHub execution and durable background jobs are separate next stages.

## Current implementation

- Responsive dashboard and team chat UI.
- Live HTTP adapters for Anthropic Messages, OpenAI Chat Completions, Gemini generateContent, and Ollama Cloud chat.
- Provider connection tests that make a real, small model request.
- Bounded multi-model discussion: configured providers answer independently in parallel, then one configured model synthesizes the responses. No endless debate loop.
- Provider failures and timeouts are surfaced rather than represented as successful answers.
- Build mode runs a collaborative multi-agent loop: configured AIs propose changes, review one another's proposals, and a lead model integrates the patch. It commits files to a new branch and opens a pull request; it never writes directly to the default branch or merges/deploys automatically.
- A PAT-backed Supabase Edge Function supports repository/file reads, branches, file writes, draft pull requests, issues, pull-request actions, releases, and workflow controls. The GitHub PAT stays in Supabase secrets.
- A backend-only action client and local-development API route are wired to the Edge Function. Production action routes remain disabled until user authentication and audit logging are implemented.
- The legacy GitHub OAuth connection flow remains in the codebase but is not required for the PAT-backed Edge Function path.
- Durable background jobs and isolated code execution are **not implemented yet**. Build changes rely on repository-configured pull-request checks for CI.

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


## GitHub PAT through Supabase Edge Functions

The PAT-based path keeps the GitHub token out of source code and frontend JavaScript.

1. In Supabase, open **Project Settings → Edge Functions → Secrets** and set `GITHUB_TOKEN` to your fine-grained GitHub PAT. Never paste the token into this repository, browser JavaScript, or chat.
2. Grant the PAT only the repository permissions needed for your work. Common workflow actions need repository metadata read, contents read/write, issues read/write, pull requests read/write, and Actions read/write. Organization administration and secrets-management permissions are not needed for ordinary code edits.
3. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the backend environment. The service-role key is separate from the GitHub PAT and must stay server-side.
4. Start the backend locally and use `POST /api/github/actions` with JSON such as:
   ```json
   {"action":"list_repos","payload":{}}
   ```
   For repository operations, include `owner` and `repo` in `payload`. For example, branch creation uses `{"action":"create_branch","payload":{"owner":"OWNER","repo":"REPO","base_branch":"main","branch":"nexus/my-change"}}`.
5. Actions that delete files/branches, close issues or PRs, merge PRs, publish releases, or start/cancel workflow runs require `approved: true` in the payload. Only set this after the user has approved the specific operation.

Current supported actions include repository listing and metadata, file reads and writes, tree/branch/commit listing, branch creation/deletion, issue creation/comment/update/close/labels, draft PR creation/comments/reviews/close/merge, release listing/creation, and workflow listing/dispatch/rerun/cancel.

**Security boundary:** the action API is local-development-only until production authentication, per-user authorization, rate limits, and an audit log are implemented. Do not expose this backend publicly with `APP_ENV=development`. The function requires Supabase service-role authentication and stores the GitHub PAT only in Supabase secrets.

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
