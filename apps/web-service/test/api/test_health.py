from fastapi.testclient import TestClient

from app.main import app


def test_live_health_check() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "zhiliu-api"}
    assert response.headers["x-request-id"]


def test_authentication_is_required() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    payload = response.json()["error"]
    assert payload["code"] == "AUTHENTICATION_REQUIRED"
    assert payload["requestId"]


def test_core_routes_are_in_openapi() -> None:
    paths = app.openapi()["paths"]

    assert "/api/v1/auth/register" in paths
    assert "/api/v1/auth/wechat/qr-config" in paths
    assert "/api/v1/workspaces" in paths
    assert "/api/v1/documents/{document_id}" in paths
