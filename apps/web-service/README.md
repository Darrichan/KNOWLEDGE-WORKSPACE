# Knowledge Workspace Web Service

Python 3.12、FastAPI、SQLAlchemy 2、Alembic 和 PostgreSQL 16 构成的模块化单体 API。

## 本地开发

```bash
cp .env.example .env
docker compose -f ../../deploy/compose.yaml up -d db
UV_CACHE_DIR=.uv-cache uv sync
UV_CACHE_DIR=.uv-cache uv run alembic upgrade head
UV_CACHE_DIR=.uv-cache uv run uvicorn app.main:app --reload --port 8000
```

接口文档：`http://localhost:8000/docs`

健康检查：

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

## 测试和质量检查

```bash
UV_CACHE_DIR=.uv-cache uv run ruff check .
UV_CACHE_DIR=.uv-cache uv run pytest
```

## 首批业务接口

```text
POST  /api/v1/auth/register
POST  /api/v1/auth/login
POST  /api/v1/auth/logout
GET   /api/v1/auth/me
GET   /api/v1/workspaces
POST  /api/v1/workspaces
GET   /api/v1/workspaces/{workspaceId}/documents
POST  /api/v1/documents
GET   /api/v1/documents/{documentId}
PATCH /api/v1/documents/{documentId}
GET   /api/v1/documents/{documentId}/versions
```

注册接口必须提交 `invite_code`。服务端通过 `REGISTRATION_INVITE_CODES` 配置一个或多个逗号分隔的邀请码；未配置时拒绝所有新用户注册，已有用户登录不受影响。

文档更新必须传 `base_version`。当其他客户端已经保存新版本时，接口返回 HTTP 409，避免静默覆盖。

## Docker Compose

在仓库根目录执行：

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yaml up --build
```

前端入口：`http://localhost:8080`

API 文档：`http://localhost:18000/docs`
