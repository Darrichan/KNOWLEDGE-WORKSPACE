import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("REGISTRATION_INVITE_CODES", "database-test-invite")

from app.main import app

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DATABASE_TESTS") != "1",
    reason="set RUN_DATABASE_TESTS=1 to run PostgreSQL integration tests",
)


def captcha_ticket(client: TestClient) -> str:
    challenge = client.get("/api/v1/auth/captcha/challenge")
    assert challenge.status_code == 200, challenge.text
    verified = client.post(
        "/api/v1/auth/captcha/verify",
        json={
            "challenge_token": challenge.json()["challenge_token"],
            "answer": challenge.json()["target"],
        },
    )
    assert verified.status_code == 200, verified.text
    return verified.json()["captcha_ticket"]


def test_register_create_and_version_document() -> None:
    email = f"codex-{uuid4().hex[:10]}@example.com"
    password = "codex-test-password"

    with TestClient(app) as client:
        rejected_register = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "display_name": "Codex 测试用户",
                "password": password,
                "invite_code": "database-test-invite",
                "captcha_ticket": "invalid-captcha-ticket",
            },
        )
        assert rejected_register.status_code == 400, rejected_register.text
        assert rejected_register.json()["error"]["code"] == "CAPTCHA_REQUIRED"

        rejected_invite = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "display_name": "Codex 测试用户",
                "password": password,
                "invite_code": "wrong-private-invite",
                "captcha_ticket": captcha_ticket(client),
            },
        )
        assert rejected_invite.status_code == 403, rejected_invite.text
        assert rejected_invite.json()["error"]["code"] == "INVALID_INVITE_CODE"

        register = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "display_name": "Codex 测试用户",
                "password": password,
                "invite_code": "database-test-invite",
                "captcha_ticket": captcha_ticket(client),
            },
        )
        assert register.status_code == 201, register.text

        workspaces = client.get("/api/v1/workspaces")
        assert workspaces.status_code == 200, workspaces.text
        workspace_id = workspaces.json()[0]["id"]

        created = client.post(
            "/api/v1/documents",
            json={
                "workspace_id": workspace_id,
                "title": "集成测试文档",
                "content": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "attrs": {"blockId": str(uuid4())},
                            "content": [{"type": "text", "text": "第一版内容"}],
                        }
                    ],
                },
            },
        )
        assert created.status_code == 201, created.text
        document_id = created.json()["id"]
        assert created.json()["plain_text"] == "第一版内容"

        missing_map = client.get(f"/api/v1/documents/{document_id}/mind-map")
        assert missing_map.status_code == 404

        created_map = client.put(
            f"/api/v1/documents/{document_id}/mind-map",
            json={
                "base_version": None,
                "graph": {
                    "nodes": [{"id": "root", "data": {"label": "集成测试文档"}}],
                    "edges": [],
                },
            },
        )
        assert created_map.status_code == 200, created_map.text
        assert created_map.json()["version"] == 1

        updated_map = client.put(
            f"/api/v1/documents/{document_id}/mind-map",
            json={
                "base_version": 1,
                "graph": {
                    "nodes": [
                        {"id": "root", "data": {"label": "集成测试文档"}},
                        {"id": "child", "data": {"label": "新主题"}},
                    ],
                    "edges": [{"id": "edge", "source": "root", "target": "child"}],
                },
            },
        )
        assert updated_map.status_code == 200, updated_map.text
        assert updated_map.json()["version"] == 2

        stale_map = client.put(
            f"/api/v1/documents/{document_id}/mind-map",
            json={"base_version": 1, "graph": {"nodes": [], "edges": []}},
        )
        assert stale_map.status_code == 409
        assert stale_map.json()["error"]["code"] == "MIND_MAP_VERSION_CONFLICT"

        second_map = client.post(
            f"/api/v1/documents/{document_id}/mind-maps",
            json={
                "title": "第二张导图",
                "graph": {
                    "nodes": [{"id": "root", "data": {"label": "第二张导图"}}],
                    "edges": [],
                },
            },
        )
        assert second_map.status_code == 201, second_map.text
        second_map_id = second_map.json()["id"]

        maps = client.get(f"/api/v1/documents/{document_id}/mind-maps")
        assert maps.status_code == 200, maps.text
        assert len(maps.json()) == 2

        duplicated_map = client.post(
            f"/api/v1/documents/{document_id}/mind-maps/{second_map_id}/duplicate"
        )
        assert duplicated_map.status_code == 201, duplicated_map.text
        assert duplicated_map.json()["title"] == "第二张导图 副本"

        removed_map = client.delete(
            f"/api/v1/documents/{document_id}/mind-maps/{second_map_id}"
        )
        assert removed_map.status_code == 204, removed_map.text

        updated = client.patch(
            f"/api/v1/documents/{document_id}",
            json={
                "base_version": 1,
                "title": "第二版标题",
                "reason": "manual",
            },
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["version"] == 2

        migrated = client.patch(
            f"/api/v1/documents/{document_id}",
            json={"base_version": 2, "reason": "migration"},
        )
        assert migrated.status_code == 200, migrated.text
        assert migrated.json()["version"] == 3

        conflict = client.patch(
            f"/api/v1/documents/{document_id}",
            json={"base_version": 2, "title": "过期客户端标题"},
        )
        assert conflict.status_code == 409, conflict.text
        assert conflict.json()["error"]["code"] == "DOCUMENT_VERSION_CONFLICT"

        versions = client.get(f"/api/v1/documents/{document_id}/versions")
        assert versions.status_code == 200, versions.text
        assert versions.json()[0]["version"] == 2

        collaborator_email = f"collaborator-{uuid4().hex[:10]}@example.com"
        with TestClient(app) as collaborator:
            collaborator_register = collaborator.post(
                "/api/v1/auth/register",
                json={
                    "email": collaborator_email,
                    "display_name": "协作测试用户",
                    "password": password,
                    "invite_code": "database-test-invite",
                    "captcha_ticket": captcha_ticket(collaborator),
                },
            )
            assert collaborator_register.status_code == 201, collaborator_register.text

            shared = client.post(
                f"/api/v1/documents/{document_id}/shares",
                json={"email": collaborator_email, "permission": "editor"},
            )
            assert shared.status_code == 201, shared.text
            assert shared.json()["permission"] == "editor"

            shared_documents = collaborator.get("/api/v1/documents/shared")
            assert shared_documents.status_code == 200, shared_documents.text
            assert shared_documents.json()[0]["id"] == document_id
            assert shared_documents.json()[0]["access_role"] == "editor"

            viewed = collaborator.get(f"/api/v1/documents/{document_id}")
            assert viewed.status_code == 200, viewed.text

            collaborator_update = collaborator.patch(
                f"/api/v1/documents/{document_id}",
                json={"base_version": 3, "title": "协作者更新标题", "reason": "manual"},
            )
            assert collaborator_update.status_code == 200, collaborator_update.text
            assert collaborator_update.json()["version"] == 4

            recent = collaborator.get("/api/v1/documents/recent")
            assert recent.status_code == 200, recent.text
            assert recent.json()[0]["id"] == document_id
            assert recent.json()[0]["last_viewed_at"] is not None

        logout = client.post("/api/v1/auth/logout")
        assert logout.status_code == 204

        login = client.post(
            "/api/v1/auth/login",
            json={
                "email": email,
                "password": password,
                "captcha_ticket": captcha_ticket(client),
            },
        )
        assert login.status_code == 200, login.text
