# Vidday 部署说明

面向 `45.32.56.92`（Ubuntu）单机部署：Vite 静态前端 + Fastify 后端 + 本机 MySQL。

支持两种环境，`deploy.sh` 会自动判定：

| 环境 | Nginx | 静态根 | 后端托管 |
| --- | --- | --- | --- |
| 裸机 | 系统 Nginx | `/srv/vidday/web` | 本仓库 `deploy.sh` 直接调 pm2 |
| 宝塔面板 | 宝塔自带 Nginx | `/www/wwwroot/vidday-web` | 面板「Node项目」 |

判据是 `/www/server/panel` 是否存在，可用 `WEB_ROOT` / `WEB_USER` 覆盖。

## 架构

```
浏览器 ──HTTPS──▶ Cloudflare（橙云）
                    └──▶ Nginx (80/443)
                           ├── /              → 静态产物（Vite dist）
                           ├── /assets/       → 同上，长缓存
                           ├── /api/          → 127.0.0.1:8791   Fastify
                           └── /health        → 127.0.0.1:8791
                                                 └── MySQL 127.0.0.1:3306 (isee_videos_db)
```

端口约定：**8791 属于 Vidday**，8790 属于另一个项目 `moive-database-op`，不要混用。

关键设计：前端 `VITE_API_BASE_URL` **构建期烘焙**进代码（见 `src/lib/public-api.ts`）。走 Nginx 同源反代时把它留空，请求会打到同源 `/api/public/*`，免跨域、免域名硬编码。

## 前置条件（两种环境通用）

1. 仓库已 clone 到服务器，并 checkout 到目标分支。
2. 建好两个 `.env`（都在 `.gitignore` 里，不会随代码过来）：

   `server/.env` —— 参照 `server/.env.example`

   ```ini
   PORT=8791
   APP_API_KEY=<64 位随机串>
   CORS_ORIGINS=*
   MEDIA_ASSETS_BASE_URL=https://media.laybackzzz.com/Assets
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=<库用户>
   MYSQL_PASSWORD=<库密码>
   MYSQL_DATABASE=isee_videos_db
   ```

   根 `.env` —— 参照 `.env.example`

   ```ini
   VITE_API_BASE_URL=
   VITE_APP_API_KEY=<与上面 APP_API_KEY 完全一致>
   VITE_ENABLE_ADS=true
   ```

   > `.env.example` 里没列 `VITE_APP_API_KEY`，但代码在读（`src/lib/public-api.ts`），必须补。
   > 它是**构建期**变量，改了要重新 `npm run build`，重启后端无效。

   `MYSQL_HOST` 用 `127.0.0.1`：MySQL 就在本机，走回环能省掉一大段公网 RTT。

## 裸机部署（Nginx + pm2）

### 首次

```bash
cd /srv/vidday/app

# 1. 装依赖、建目录、渲染 Nginx 配置、构建前端、拉起后端
sudo -E DOMAIN=<你的域名> bash deploy/setup.sh

# 2. 放置 Cloudflare Origin Certificate（Dashboard → SSL/TLS → Origin Server）
sudo tee /etc/ssl/vidday/origin.pem >/dev/null   # 粘贴 Origin Certificate
sudo tee /etc/ssl/vidday/origin.key >/dev/null   # 粘贴 Private Key
sudo chmod 600 /etc/ssl/vidday/origin.key
sudo nginx -t && sudo systemctl reload nginx

# 3. 开机自启
pm2 startup        # 按它输出的提示执行一次，否则重启机器后进程不会自启
```

Cloudflare 侧把 SSL/TLS 加密模式设为 **Full (strict)**。

### 更新

```bash
cd /srv/vidday/app
bash deploy/deploy.sh                 # 拉代码 → 装依赖 → 构建 → 发布 → reload
BRANCH=dev bash deploy/deploy.sh      # 指定分支
```

## 宝塔面板部署

> **装了宝塔就不要跑 `deploy/setup.sh`。** 它会 `apt install nginx` 并往 `/etc/nginx/sites-available/` 写站点，而机器上真正干活的是宝塔编译的那套 Nginx（`/www/server/nginx`，站点配置在 `/www/server/panel/vhost/nginx/*.conf`）。跑下去会装出第二套 Nginx 抢 80/443。

### 1. 目录

| 用途 | 路径 |
| --- | --- |
| 代码仓库 | `/www/wwwroot/vidday` |
| 前端静态根 | `/www/wwwroot/vidday-web` |
| 后端目录 | `/www/wwwroot/vidday/server` |

### 2. 后端：用「Node项目」

宝塔 8.x 左侧「网站」菜单下有 **Node项目**（没有的话先去「软件商店」装 **Node.js版本管理器**）。

1. Node.js版本管理器 → 安装 **v22**（`.nvmrc` 要求 22.22.0；后端用了 `--experimental-strip-types` 和 `process.loadEnvFile`，低于 22 直接崩）。
2. 「Node项目」→「添加Node项目」：

   | 字段 | 值 |
   | --- | --- |
   | 项目目录 | `/www/wwwroot/vidday/server` |
   | 项目名称 | `vidday-api` |
   | Node版本 | `22` |
   | 启动选项 / 启动命令 | 选 `npm start`，或手填 `node --experimental-strip-types src/index.ts` |
   | 端口 | `8791` |
   | 运行用户 | `www` |

3. 环境变量**不用在面板里填**。后端会自己 `loadEnvFile` 读 `server/.env`（见 `server/src/env.ts`）。
4. 权限：

   ```bash
   chown -R www:www /www/wwwroot/vidday/server
   chmod 600 /www/wwwroot/vidday/server/.env
   ```

> 备选：不用 Node项目插件，改用「软件商店」→ **Supervisor管理器** 守护，命令 `npm start`、目录 `server/`、用户 `www`。
> **不要**再去 `npm i -g pm2`：宝塔「Node项目」底下是它自己的 pm2 实例，两套 daemon 互相看不见进程。

### 3. 前端站点

1. 「网站」→「添加站点」：域名填你的域名，根目录 `/www/wwwroot/vidday-web`，**PHP版本选「纯静态」**，FTP / 数据库都不勾。
2. 构建发布：跑 `deploy.sh` 即可，它会自动识别宝塔、发布到 `/www/wwwroot/vidday-web` 并 `chown www:www`。

   ```bash
   cd /www/wwwroot/vidday
   bash deploy/deploy.sh
   ```

   脚本最后会提示「请到面板重启 vidday-api」——在「Node项目」里点一下重启即可。

### 4. Nginx：SPA 回退 + /api 反代

站点「设置」→「配置文件」，在 `server { }` 内补三段（宝塔默认只有 `location / { }` 和静态资源 expires 块）：

```nginx
# SPA 路由回退：/watch/123、/person/8 直接访问或刷新时不 404
location / {
    try_files $uri $uri/ /index.html;
}

location = /index.html {
    add_header Cache-Control "no-store";
}

location /api/ {
    proxy_pass http://127.0.0.1:8791;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```

也可走「设置」→「反向代理」→ 新增（代理目录 `/api`、目标 `http://127.0.0.1:8791`），但生成位置不受控，手改配置文件更确定。保存时宝塔会自动 `nginx -t` 并 reload，报错去「日志」看。

后端 `server/src/index.ts` 已开 `trustProxy: true`，真实 IP 能透传。

### 5. 数据库

「数据库」→「添加数据库」，库名 `isee_videos_db`（若内容管理端的库已在宝塔里，直接复用，别新建）。`server/.env` 里 `MYSQL_HOST=127.0.0.1`。

### 6. SSL

站点「设置」→「SSL」→「其他证书」，粘贴 Cloudflare Origin Certificate 的 cert 与 key。

**别用 Let's Encrypt**：域名挂橙云时 HTTP 校验要回源，会失败。同时在 Cloudflare 把加密模式设为 **Full (strict)**。

### 7. 防火墙

宝塔「安全」放行 `80`、`443`。**`8791` 不要对外开放**——它只由本机 Nginx 反代访问，暴露出去等于绕过 WAF 还能被扫。

## 验证

```bash
curl -s http://127.0.0.1:8791/health                     # 后端 + MySQL 探活
curl -s https://<你的域名>/health
curl -s -H 'x-app-key: <你的key>' https://<你的域名>/api/public/genres | head -c 300
curl -s https://<你的域名>/title/123 | grep -o '<title>.*</title>'   # 验证 SPA 回退
```

浏览器打开 → 登录 → 首页轮播有数据 → 进详情页点「播放」能起播，即链路通。

## 排错

| 现象 | 原因与处理 |
| --- | --- |
| 接口全量 401 | 两端密钥不一致。对比根 `.env` 的 `VITE_APP_API_KEY` 与 `server/.env` 的 `APP_API_KEY`，改完重新 `npm run build`（构建期烘焙） |
| 子路由刷新 404 | Nginx 缺 `try_files $uri $uri/ /index.html` |
| `/health` 报数据库错 | `MYSQL_*` 配置有误，或库未启动 |
| 前端拿到旧数据 | 后端有进程内 TTL 缓存，重启后端或等待过期 |
| 播放域名是旧的 | 后端 TTL 缓存 + `video-player.tsx` 的 `FALLBACK_SOURCE_URL` 兜底，两者都要排查 |
| 证书相关 502 / 证书错误 | 裸机确认 `/etc/ssl/vidday/` 两文件存在且 `origin.key` 权限 600；宝塔确认 SSL「其他证书」已保存。Cloudflare 模式为 Full (strict) |
| 重启机器后服务没起来 | 裸机没执行 `pm2 startup`；宝塔在「Node项目」里确认已开启自启 |
| `pm2` 找不到 node | node 用了 nvm 安装。改回系统级安装（`deploy/setup.sh` 走的是 NodeSource） |
| 宝塔下页面 403 | 静态产物属主不对：`sudo chown -R www:www /www/wwwroot/vidday-web` |
| 宝塔下接口 502 | 「Node项目」未启动，或端口不是 8791。检查面板项目状态与 `server/.env` 的 `PORT` |
| 宝塔下 `pm2` 看不到后端进程 | 正常。「Node项目」用的是它自己的 pm2 实例，与本机全局 pm2 互不可见 |
| 两套 Nginx 抢 80/443 | 装过宝塔后又跑了 `deploy/setup.sh`。卸载系统 Nginx：`apt remove --purge nginx nginx-common` |
| 构建 OOM | 内存 < 2G 时本地 `npm run build` 后 scp `dist/` 上去 |
