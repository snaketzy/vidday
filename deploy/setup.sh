#!/usr/bin/env bash
#
# Vidday 首次部署（在服务器上以 root 执行）。
#
#   DOMAIN=www.example.com bash deploy/setup.sh
#
# 做四件事：
#   1. 安装 Node 22（NodeSource）/ Nginx / pm2
#   2. 建目录并把 Nginx 站点配置渲染到 /etc/nginx/sites-available/vidday
#   3. 安装依赖、构建前端、发布到 /srv/vidday/web
#   4. 用 pm2 拉起后端 vidday-api
#
# 前置：
#   - 仓库已 clone 到服务器
#   - server/.env 与根 .env 已按各自 *.example 配置好（两端密钥必须一致）
#
# 证书（Cloudflare Origin Certificate）：
#   先放到 /etc/ssl/vidday/origin.pem 与 /etc/ssl/vidday/origin.key（chmod 600 origin.key）。
#   本脚本检测到两个文件后才 reload Nginx，避免 443 配置因缺证书而报错。
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/srv/vidday/web}"
CERT_DIR="/etc/ssl/vidday"
PM2_APP="vidday-api"
DOMAIN="${DOMAIN:-}"

log()  { printf '\033[36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[setup]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m[setup]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "请以 root 运行：sudo -E DOMAIN=www.example.com bash deploy/setup.sh"
[ -n "$DOMAIN" ]     || fail "缺少 DOMAIN，例如：DOMAIN=www.example.com bash deploy/setup.sh"

# --- 1. 系统依赖 ----------------------------------------------------
log "安装基础包（curl / git / rsync / nginx）"
apt-get update -y
apt-get install -y curl ca-certificates git rsync nginx

if ! command -v node >/dev/null 2>&1 || \
   [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 22 ]; then
  log "安装 Node.js 22（NodeSource）"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  log "已检测到 Node $(node -v)，跳过安装"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "安装 pm2"
  npm install -g pm2
fi

# --- 2. 目录与 Nginx 站点配置 ---------------------------------------
log "创建目录 $WEB_ROOT 与 $CERT_DIR"
mkdir -p "$WEB_ROOT" "$CERT_DIR"

log "渲染 Nginx 配置（server_name=$DOMAIN）"
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx/vidday.conf" > /etc/nginx/sites-available/vidday
ln -sf /etc/nginx/sites-available/vidday /etc/nginx/sites-enabled/vidday
rm -f /etc/nginx/sites-enabled/default

# --- 3. 后端 --------------------------------------------------------
[ -f "$APP_DIR/server/.env" ] || fail "缺少 $APP_DIR/server/.env，请先按 server/.env.example 配置"
log "安装后端依赖"
(cd "$APP_DIR/server" && npm ci --omit=dev)

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 reload "$PM2_APP" --update-env
else
  pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
fi
pm2 save

# --- 4. 前端 --------------------------------------------------------
[ -f "$APP_DIR/.env" ] || fail "缺少 $APP_DIR/.env，请先按 .env.example 配置（需 VITE_APP_API_KEY）"
log "安装前端依赖并构建"
(cd "$APP_DIR" && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci && npm run build)

log "发布静态产物到 $WEB_ROOT"
rsync -a --delete "$APP_DIR/dist/" "$WEB_ROOT/"

# --- 5. 让 Nginx 生效（证书到位才 reload）---------------------------
systemctl enable nginx >/dev/null 2>&1 || true
if [ -f "$CERT_DIR/origin.pem" ] && [ -f "$CERT_DIR/origin.key" ]; then
  nginx -t && systemctl reload nginx
  log "Nginx 已加载站点配置"
else
  warn "未找到 $CERT_DIR/origin.pem 与 origin.key，暂不 reload Nginx。"
  warn "放置 Cloudflare Origin Certificate 后执行：nginx -t && systemctl reload nginx"
fi

log "后端自检：curl -s http://127.0.0.1:8791/health"
warn "还差一步：执行一次 pm2 startup，并按它输出的提示保存，否则重启机器后进程不会自启"
