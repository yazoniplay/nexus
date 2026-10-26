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
    assert response.json() == {"connected": False}


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
