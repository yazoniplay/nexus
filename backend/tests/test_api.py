from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["name"] == "Nexus API"


def test_status_is_explicit_about_unimplemented_integrations():
    response = client.get("/api/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert set(payload["providers"]) == {"anthropic", "openai", "gemini", "ollama"}
    assert payload["capabilities"]["github_integration"] is False
    assert payload["capabilities"]["isolated_code_execution"] is False


def test_unknown_provider_connection_test_is_rejected():
    response = client.post("/api/providers/not-a-provider/test")
    assert response.status_code == 404


def test_chat_requires_non_empty_message():
    response = client.post("/api/chat", json={"message": ""})
    assert response.status_code == 422


def test_github_connection_is_not_authenticated_by_default():
    response = client.get("/api/github/connection")
    assert response.status_code == 200
    assert response.json()["connected"] is False
    assert "configured" in response.json()


def test_github_repository_list_requires_session():
    response = client.get("/api/github/repositories")
    assert response.status_code == 401


def test_github_connection_reports_unconfigured_when_credentials_are_missing(monkeypatch):
    for key in (
        "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_CALLBACK_URL",
        "NEXUS_SESSION_SECRET", "NEXUS_ENCRYPTION_KEY", "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    response = client.get("/api/github/connection")
    assert response.status_code == 200
    assert response.json()["configured"] is False


def test_chat_uses_pat_repository_context_without_oauth_session(monkeypatch):
    called = {}

    async def fake_repository_context(full_name):
        called["repository"] = full_name
        return {"repository": full_name, "default_branch": "main", "root_files": [], "readme": ""}

    monkeypatch.setattr("main.github_pat_repository_context", fake_repository_context)
    response = client.post(
        "/api/chat",
        json={"message": "Review this repository", "repository": "someone/project"},
    )
    # With repository context loaded, chat proceeds to provider validation.
    # CI has no model keys, so it should return the expected no-provider response.
    assert response.status_code == 400
    assert "No AI providers are configured" in response.json()["detail"]
    assert called["repository"] == "someone/project"


def test_github_actions_are_reported_separately_from_oauth():
    response = client.get("/api/status")
    assert response.status_code == 200
    assert "github_actions" in response.json()["capabilities"]


def test_github_actions_route_is_disabled_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    response = client.post(
        "/api/github/actions",
        json={"action": "list_repos", "payload": {}},
    )
    assert response.status_code == 503


def test_github_actions_route_forwards_allowlisted_action(monkeypatch):
    async def fake_invoke(action, **payload):
        return {"repos": [{"full_name": "owner/repo"}], "received": {"action": action, **payload}}

    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setattr("main.invoke_github", fake_invoke)
    response = client.post(
        "/api/github/actions",
        json={"action": "list_repos", "payload": {"limit": 10}},
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["result"]["received"] == {"action": "list_repos", "limit": 10}


def test_github_actions_route_rejects_unknown_action():
    response = client.post(
        "/api/github/actions",
        json={"action": "delete_everything", "payload": {}},
    )
    assert response.status_code == 422
