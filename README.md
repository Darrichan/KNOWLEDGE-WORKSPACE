# Knowledge Workspace

自托管的文档、思维导图与智能体知识工作台。

## 当前工程

```text
src/                    React + Vite 前端原型
apps/web-service/       Python 3.12 + FastAPI 后端
deploy/compose.yaml     Web + API + PostgreSQL 16
TECHNICAL_DESIGN.md     完整技术方案
```

后端已经实现：

- 注册、登录、退出和当前用户，注册与登录前都必须完成服务端签名的滑块验证；注册额外要求服务端配置的邀请码；
- 注册后自动创建个人工作空间；
- 工作空间列表与创建；
- 文档和文件夹的创建、读取、更新、移动、复制、搜索和删除；
- “我的空间 / 与我共享 / 最近浏览”真实查询和访问记录；
- 按邮箱共享文档、查看者/编辑者权限和共享成员管理；
- Tiptap JSON 转纯文本；
- 乐观锁与 HTTP 409 版本冲突保护；
- 文档版本快照；
- PostgreSQL 16 数据迁移；
- 导图、智能体动作和审计日志数据模型；
- Docker Compose 完整部署链路。

当前 React 页面已接入真实登录、工作空间、Tiptap 文档编辑与思维导图 API；首页、我的空间、与我共享、最近浏览、目录、全文搜索、分享、移动、复制、删除和版本记录均有真实业务逻辑。文档和导图写入 PostgreSQL，并使用版本号处理并发保存冲突。智能体入口暂时明确禁用，待知识工作区验收完成后再接入真实模型。

## 启动完整容器栈

首次启动前复制部署配置并设置私有邀请码；支持用逗号配置多个邀请码，未配置时关闭新用户注册：

```bash
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env 中的 REGISTRATION_INVITE_CODES
```

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

- Web：<http://localhost:8080>
- API 文档：<http://localhost:18000/docs>
- API 健康检查：<http://localhost:18000/api/v1/health/ready>
- PostgreSQL：`localhost:65432`

## 验证

前端：

```bash
npm run build
npm run test:sites
```

后端：

```bash
cd apps/web-service
UV_CACHE_DIR=.uv-cache uv sync
UV_CACHE_DIR=.uv-cache uv run ruff check .
UV_CACHE_DIR=.uv-cache uv run pytest
```

真实 PostgreSQL 集成测试：

```bash
RUN_DATABASE_TESTS=1 DATABASE_URL=postgresql+psycopg://zhiliu:zhiliu-dev-password@localhost:65432/zhiliu UV_CACHE_DIR=.uv-cache uv run pytest test/api/test_database_flow.py
```

## 技术文档

- [技术方案](TECHNICAL_DESIGN.md)
- [后端说明](apps/web-service/README.md)
