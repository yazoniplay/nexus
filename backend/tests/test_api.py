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
