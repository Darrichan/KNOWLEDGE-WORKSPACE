# KW 单机生产部署

> 目标环境：已运行 HTML 发布系统的香港 Debian 12 服务器  
> 推荐域名：`kw.darrichan.top`  
> KW 项目目录：`/opt/knowledge-workspace`

## 1. 与现有项目的隔离

| 项目 | HTML 发布系统 | KW |
|---|---|---|
| 目录 | `/opt/html-publish` | `/opt/knowledge-workspace` |
| 域名 | `html.darrichan.top` | `kw.darrichan.top` |
| 宿主机回环端口 | `127.0.0.1:8080` | `127.0.0.1:8081` |
| Compose 项目名 | HTML 项目原名 | `knowledge-workspace` |
| PostgreSQL 卷 | `html_publish_postgres_data` | `kw_postgres_data` |
| 文件卷 | `html_publish_storage_data` | `kw_uploads_data` |

KW 的 PostgreSQL 和 FastAPI 不映射到宿主机或公网，只有 Web 容器绑定回环端口 `8081`。两个项目共用宿主机 Nginx 的 `80/443`，由 `server_name` 分流。

## 2. 部署前准备

1. 在 DNS 添加 A 记录：

   ```text
   kw.darrichan.top -> 156.225.23.173
   ```

2. 确认服务器仍只对公网开放 `22`/`80`/`443`。
3. 不要停止或修改 `/opt/html-publish` 的容器、端口和 Nginx 站点。

## 3. 拉取代码

```bash
git clone https://github.com/Darrichan/KNOWLEDGE-WORKSPACE.git /opt/knowledge-workspace
cd /opt/knowledge-workspace
git branch --show-current
git log -1 --oneline
```

## 4. 生产环境变量

```bash
cd /opt/knowledge-workspace
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

生成数据库密码和应用密钥：

```bash
openssl rand -hex 24
openssl rand -hex 32
```

将两个输出分别填入 `POSTGRES_PASSWORD` 和 `SECRET_KEY`。另外填写：

- `REGISTRATION_INVITE_CODES`：私有邀请码，多个用英文逗号分隔。
- `WECHAT_MINI_APP_ID`：KW 小程序 AppID。
- `WECHAT_MINI_APP_SECRET`：KW 小程序 AppSecret，只保存在服务器。

不需要配置微信开放平台网站应用 AppID。

## 5. 启动 KW

```bash
cd /opt/knowledge-workspace
make prod-up
make prod-status
curl -fsS http://127.0.0.1:8081/health
```

FastAPI 容器每次启动前会执行 `alembic upgrade head`。预期健康检查返回数据库 ready 状态。

## 6. 配置宿主机 Nginx

```bash
cp /opt/knowledge-workspace/deploy/nginx.host.kw.conf.example \
  /etc/nginx/sites-available/knowledge-workspace
ln -s /etc/nginx/sites-available/knowledge-workspace \
  /etc/nginx/sites-enabled/knowledge-workspace
nginx -t
systemctl reload nginx
```

先验证 HTTP 访问：

```bash
curl -i http://kw.darrichan.top/health
```

再使用 Certbot 申请独立证书，不会覆盖 `html.darrichan.top` 现有的阿里云证书：

```bash
certbot --nginx -d kw.darrichan.top
nginx -t
systemctl reload nginx
curl -fsS https://kw.darrichan.top/health
```

## 7. 小程序与云函数

小程序真机不应请求 `127.0.0.1`。后续的云函数网关将请求转发到：

```text
https://kw.darrichan.top/api/v1
```

小程序本身不存储业务数据，PC 端、小程序和以后的公开阅读端共用 KW PostgreSQL。

## 8. 更新与回滚

正常更新：

```bash
cd /opt/knowledge-workspace
git status --short
git pull --ff-only
make prod-up
make prod-status
curl -fsS https://kw.darrichan.top/health
```

回滚代码时优先在 GitHub 上创建 `git revert` 提交后重新部署。不要在服务器执行 `git reset --hard`。数据库迁移不会随代码自动降级。

## 9. 备份

创建独立备份目录：

```bash
mkdir -p /opt/backups/knowledge-workspace
chmod 700 /opt/backups/knowledge-workspace
```

备份 PostgreSQL：

```bash
cd /opt/knowledge-workspace
backup_stamp=$(date +%F-%H%M%S)
docker compose --env-file deploy/.env.production -f deploy/compose.prod.yaml \
  exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "/opt/backups/knowledge-workspace/database-${backup_stamp}.dump"
```

备份上传图片：

```bash
backup_stamp=$(date +%F-%H%M%S)
docker run --rm \
  -v kw_uploads_data:/source:ro \
  -v /opt/backups/knowledge-workspace:/backup \
  alpine tar -czf "/backup/uploads-${backup_stamp}.tar.gz" -C /source .
```

备份必须定期复制到另一台机器或对象存储。

## 10. 安全边界

- 不要执行 `docker compose down -v`，否则会删除 KW 数据库和图片卷。
- 不要在防火墙或云安全组开放 `8081`/`8000`/`5432`。
- `deploy/.env.production` 权限保持为 `600`，不提交 Git。
- 小程序 AppSecret 不得出现在 Taro 前端或云函数返回值中。
- 上线前确认 HTML 发布系统仍可通过 `https://html.darrichan.top/health` 访问。

## 11. GitHub Actions 自动更新

仓库已包含 `.github/workflows/deploy-production.yml`。PC 前端、FastAPI 或生产部署文件推送到 `main` 后，GitHub 会：

1. 构建 PC 前端并运行 Sites 测试。
2. 运行 Python `ruff` 检查。
3. 验证生产 Compose。
4. 通过 SSH 连接服务器。
5. 执行 `git pull --ff-only` 和 `make prod-up`。
6. 请求 `127.0.0.1:8081/health` 验收。

小程序或移动端单独改动不会重建服务器端；它们将使用各自的发布流程。

### 11.1 服务器一次性准备

推荐使用独立 `deploy` 用户，不使用 root 密码自动登录：

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
chown -R deploy:deploy /opt/knowledge-workspace
```

为 GitHub Actions 生成一把专用 SSH 密钥，将公钥写入服务器 `/home/deploy/.ssh/authorized_keys`，私钥只保存在 GitHub Actions Secret `KW_DEPLOY_SSH_KEY`。

如果仓库是私有的，服务器还需要一把只读 GitHub Deploy Key，使 `/opt/knowledge-workspace` 可以执行 `git pull`。不要把可写 PAT 放入 Git 远程 URL。

### 11.2 GitHub Secrets

在仓库 `Settings -> Secrets and variables -> Actions` 中配置：

| Secret | 值 |
|---|---|
| `KW_DEPLOY_HOST` | `156.225.23.173` |
| `KW_DEPLOY_PORT` | `22` |
| `KW_DEPLOY_USER` | `deploy` |
| `KW_DEPLOY_SSH_KEY` | GitHub Actions 专用 SSH 私钥完整内容 |
| `KW_DEPLOY_KNOWN_HOSTS` | 服务器 SSH host key |

首次服务器初始化完成后，再在 `Variables` 中添加：

| Variable | 值 |
|---|---|
| `KW_AUTO_DEPLOY` | `true` |

未配置该变量时，推送 `main` 仍会执行构建检查，但不会连接生产服务器，适合首次初始化。

在可信任的本地环境生成 `KW_DEPLOY_KNOWN_HOSTS` 内容：

```bash
ssh-keyscan -H -p 22 156.225.23.173
```

添加 GitHub `production` Environment，可选开启 Required reviewers。开启后，每次部署只需在 GitHub 点击一次批准，无需 SSH 登录服务器。

### 11.3 日常发布

自动部署：

```bash
git push origin main
```

也可在 GitHub `Actions -> Deploy KW production -> Run workflow` 手动重新发布当前 `main`。

生产目录有未提交的跟踪文件、无法 fast-forward、构建失败或健康检查失败时，流程会立即终止。

### 11.4 后续升级

当服务器构建变慢时，再将流程升级为 GitHub Actions 构建 Docker 镜像并发布到 GHCR，服务器只执行 `docker compose pull && up -d`。当前阶段不需要先引入镜像仓库。
