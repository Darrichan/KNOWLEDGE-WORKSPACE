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
# 微信开放平台网页登录

PC 端微信扫码登录使用微信开放平台“网站应用”能力。首次授权仍然需要邀请码，已经绑定的微信之后可直接扫码登录。

需要配置以下环境变量：

```env
WECHAT_OPEN_APP_ID=网站应用AppID
WECHAT_OPEN_APP_SECRET=网站应用AppSecret
WECHAT_OPEN_REDIRECT_URI=https://你的域名/api/v1/auth/wechat/callback
WECHAT_LOGIN_SUCCESS_URL=https://你的域名/
```

开放平台后台填写的授权回调域必须与 `WECHAT_OPEN_REDIRECT_URI` 所属域名一致，线上地址需要使用 HTTPS。数据库迁移 `20260803_0007` 会创建微信身份绑定表。

## 小程序微信绑定

已登录用户可在小程序“我的”页点击“绑定当前微信”。后端使用小程序 `AppID` 和 `AppSecret` 将 `wx.login` 的临时 `code` 换成 `openid`，并强制一个 KW 账号只绑定一个微信、一个微信只绑定一个 KW 账号。

```env
WECHAT_MINI_APP_ID=小程序AppID
WECHAT_MINI_APP_SECRET=小程序AppSecret
WECHAT_MINI_ENV_VERSION=release
```

`AppSecret` 只能配置在后端或云函数中，不能写入小程序前端代码。使用云函数中转时，保留同样的一对一数据库约束即可。

PC 端扫码登录复用这组小程序参数。后端生成五分钟有效的一次性小程序码，微信扫码后直接进入 `pages/scan-login/index` 确认；PC 使用独立轮询密钥领取登录态，不依赖微信开放平台网站应用。
