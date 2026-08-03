# KW 单机生产部署

> 目标环境：已运行 HTML 发布系统的香港 Debian 11 服务器
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
install -d -m 700 -o root -g root /etc/knowledge-workspace
cp /opt/knowledge-workspace/deploy/.env.production.example \
  /etc/knowledge-workspace/env
chmod 600 /etc/knowledge-workspace/env
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
- `WECHAT_MINI_ENV_VERSION`：PC 扫码打开的小程序版本；正式发布后使用 `release`，体验阶段可临时使用 `trial`。

PC 微信登录使用后端生成的一次性小程序码：微信扫一扫会直接打开 KW 小程序确认页，因此不需要配置或付费申请微信开放平台网站应用 AppID。

## 5. 启动 KW

安装由 root 持有的固定运行配置：

```bash
cd /opt/knowledge-workspace

install -m 644 deploy/secure/compose.yaml \
  /etc/knowledge-workspace/compose.yaml
install -m 644 deploy/secure/Dockerfile.api \
  /etc/knowledge-workspace/Dockerfile.api
install -m 644 deploy/secure/Dockerfile.web \
  /etc/knowledge-workspace/Dockerfile.web
install -m 755 deploy/secure/deploy-kw \
  /usr/local/sbin/deploy-kw

docker compose --env-file /etc/knowledge-workspace/env \
  -f /etc/knowledge-workspace/compose.yaml up -d --build
docker compose --env-file /etc/knowledge-workspace/env \
  -f /etc/knowledge-workspace/compose.yaml ps
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

再使用 Certbot 申请独立证书，不会覆盖 `html.darrichan.top` 的现有证书：

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

正常更新由 GitHub Actions 自动执行。需要手动重新发布当前 `main` 时：

```bash
cd /opt/knowledge-workspace
git fetch origin main
export KW_DEPLOY_SHA="$(git rev-parse origin/main)"
/usr/local/sbin/deploy-kw
curl -fsS https://kw.darrichan.top/health
```

回滚代码时优先在 GitHub 上创建 `git revert` 提交后重新部署。不要在服务器执行 `git reset --hard`。数据库迁移不会随代码自动降级。

## 9. 备份

安装自动备份脚本和 systemd 定时器：

```bash
cd /opt/knowledge-workspace
install -d -m 700 -o root -g root /opt/backups/knowledge-workspace
install -m 755 -o root -g root deploy/secure/backup-kw \
  /usr/local/sbin/backup-kw
install -m 644 -o root -g root deploy/secure/kw-backup.service \
  /etc/systemd/system/kw-backup.service
install -m 644 -o root -g root deploy/secure/kw-backup.timer \
  /etc/systemd/system/kw-backup.timer
systemctl daemon-reload
systemctl enable --now kw-backup.timer
systemctl list-timers kw-backup.timer
```

定时器每天北京时间 `03:30` 后随机延迟最多 15 分钟执行，备份 PostgreSQL 与上传图片，生成 SHA-256 校验文件，并自动清理超过 14 天的本机备份。手动执行并检查：

```bash
/usr/local/sbin/backup-kw
systemctl status kw-backup.timer --no-pager
journalctl -u kw-backup.service -n 50 --no-pager
find /opt/backups/knowledge-workspace -maxdepth 2 -type f -print
```

恢复前应先在临时环境验证校验文件：

```bash
cd /opt/backups/knowledge-workspace/backup-YYYYMMDD-HHMMSS
sha256sum --check SHA256SUMS
```

本机备份只能处理误删或应用故障，不能防止服务器磁盘损坏。备份仍需定期复制到另一台机器或对象存储。

当前使用独立的只读 `kwbackup` 账号，每天将新备份拉取到管理员 Mac 的 `~/Backups/knowledge-workspace`。Mac 端保留 30 天，下载完成后再次验证 `SHA256SUMS`。定时任务配置位于 `deploy/macos/top.darrichan.kw-backup-pull.plist`，拉取脚本位于 `scripts/pull-production-backups`。

## 10. 安全边界

- 不要执行 `docker compose down -v`，否则会删除 KW 数据库和图片卷。
- 不要在防火墙或云安全组开放 `8081`/`8000`/`5432`。
- `/etc/knowledge-workspace/env` 由 `root:root` 持有，权限保持为 `600`。
- `deploy` 用户不加入 Docker 组；Docker 组等价于接近 root 权限。
- Compose、生产 Dockerfile 和部署脚本由 root 安装到 `/etc/knowledge-workspace` 和 `/usr/local/sbin`。
- 小程序 AppSecret 不得出现在 Taro 前端或云函数返回值中。
- 上线前确认 HTML 发布系统仍可通过 `https://html.darrichan.top/health` 访问。

## 11. GitHub Actions 自动更新

仓库已包含 `.github/workflows/deploy-production.yml`。PC 前端、FastAPI 或生产部署文件推送到 `main` 后，GitHub 会：

1. 构建 PC 前端并运行 Sites 测试。
2. 运行 Python `ruff` 检查。
3. 验证生产 Compose。
4. 通过 SSH 连接服务器。
5. 传入当前 `main` 的精确 40 位 SHA，调用受限的 `/usr/local/sbin/deploy-kw`。
6. 请求 `127.0.0.1:8081/health` 验收。

小程序或移动端单独改动不会重建服务器端；它们将使用各自的发布流程。

### 11.1 服务器一次性准备

使用独立 `deploy` 用户，但不要将它加入 Docker 组：

```bash
adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

为 GitHub Actions 生成一把专用 SSH 密钥，将公钥以 `restrict` 选项写入 `/home/deploy/.ssh/authorized_keys`，禁用 PTY 和各类转发。私钥只保存在 GitHub Actions Secret `KW_DEPLOY_SSH_KEY`。

安装受限 sudo 规则：

```bash
cd /opt/knowledge-workspace
visudo -cf deploy/secure/sudoers.kw-deploy
install -m 440 -o root -g root deploy/secure/sudoers.kw-deploy \
  /etc/sudoers.d/kw-deploy
visudo -cf /etc/sudoers.d/kw-deploy
```

`deploy` 用户只能无密码执行 `/usr/local/sbin/deploy-kw`，不能执行 `docker ps`、修改固定 Compose 或读取生产环境变量。

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

请求的 SHA 不是服务器刚获取到的 `origin/main`、生产目录存在未提交的跟踪文件、root 固定配置权限异常、构建失败或健康检查失败时，流程会立即终止。

### 11.4 后续升级

当服务器构建变慢时，再将流程升级为 GitHub Actions 构建 Docker 镜像并发布到 GHCR，服务器只执行 `docker compose pull && up -d`。当前阶段不需要先引入镜像仓库。
