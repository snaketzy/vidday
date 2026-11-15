#!/usr/bin/env bash
#
# Vidday 更新发布：拉代码 → 装依赖 → 构建前端 → 发布静态产物 → 重启后端。
# 幂等，可反复执行。
#
#   bash deploy/deploy.sh
#   BRANCH=dev bash deploy/deploy.sh
#
# 环境变量（不填则按环境自动判定）：
#   BRANCH     要部署的分支（默认当前分支）
#   WEB_ROOT   静态产物目录（裸机默认 /srv/vidday/web；宝塔默认 /www/wwwroot/vidday-web）
#   WEB_USER   静态产物属主（宝塔默认 www；裸机默认不改属主）
#   PM2_APP    进程名（默认 vidday-api）
#
# 环境适配：
#   裸机 —— 后端由本脚本的 pm2 管理，首次执行会自动 start。
#           前置：已跑过 deploy/setup.sh（装 Nginx / pm2 / 站点配置）。
#   宝塔 —— 后端交给面板「Node项目」托管，本脚本只做构建与发布，重启在面板点。
#           切勿在此环境跑 deploy/setup.sh：它会装第二套系统 Nginx，抢 80/443。
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"
PM2_APP="${PM2_APP:-vidday-api}"

# --- 环境判定：宝塔有自己的 Nginx，目录约定与属主都不同 ---
if [ -d /www/server/panel ]; then
  IS_BAOTA=1
  WEB_ROOT="${WEB_ROOT:-/www/wwwroot/vidday-web}"
  WEB_USER="${WEB_USER:-www}"
else
  IS_BAOTA=0
  WEB_ROOT="${WEB_ROOT:-/srv/vidday/web}"
  WEB_USER="${WEB_USER:-}"
fi

log()  { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[deploy]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

if [ "$IS_BAOTA" -eq 1 ]; then
  log "环境：宝塔面板，静态根 $WEB_ROOT"
else
  log "环境：裸机 Nginx + pm2，静态根 $WEB_ROOT"
fi

# --- 前置校验：构建期与运行期的密钥必须成对且一致，否则前端全量 401 ---
[ -f "$APP_DIR/.env" ]        || fail "缺少 $APP_DIR/.env（构建期需 VITE_APP_API_KEY，参见 .env.example）"
[ -f "$APP_DIR/server/.env" ] || fail "缺少 $APP_DIR/server/.env（参见 server/.env.example）"

front_key="$(sed -n 's/^VITE_APP_API_KEY=\(.*\)$/\1/p' "$APP_DIR/.env" | head -n1)"
back_key="$(sed -n 's/^APP_API_KEY=\(.*\)$/\1/p' "$APP_DIR/server/.env" | head -n1)"
[ -n "$front_key" ] || fail ".env 中 VITE_APP_API_KEY 为空"
[ -n "$back_key" ]  || fail "server/.env 中 APP_API_KEY 为空"
[ "$front_key" = "$back_key" ] || fail "VITE_APP_API_KEY 与 APP_API_KEY 不一致，前端会全部 401"

# --- 取代码 ---
log "拉取分支 $BRANCH"
git -C "$APP_DIR" fetch --prune origin
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" pull --ff-only origin "$BRANCH"

# --- 后端依赖 ---
log "安装后端依赖"
(cd "$APP_DIR/server" && npm ci --omit=dev)

# --- 前端构建 ---
# ELECTRON_SKIP_BINARY_DOWNLOAD：Web 部署用不到 Electron，省一次 ~100MB 下载
log "安装前端依赖并构建"
(cd "$APP_DIR" && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci && npm run build)

# --- 发布静态产物 ---
log "发布到 $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rsync -a --delete "$APP_DIR/dist/" "$WEB_ROOT/"

if [ -n "$WEB_USER" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    chown -R "$WEB_USER:$WEB_USER" "$WEB_ROOT"
  else
    warn "当前非 root，跳过 chown $WEB_USER；若页面 403，执行：sudo chown -R $WEB_USER:$WEB_USER $WEB_ROOT"
  fi
fi

# --- 重启后端 ---
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  log "重载后端 $PM2_APP（pm2）"
  pm2 reload "$PM2_APP" --update-env
elif [ "$IS_BAOTA" -eq 1 ]; then
  warn "宝塔环境：后端由面板「Node项目」独立托管，请到面板重启 $PM2_APP"
  warn "（首次部署需先在「Node项目」中创建本项目；本脚本不代为操作，避免起出重复进程抢端口）"
elif ! command -v pm2 >/dev/null 2>&1; then
  warn "未检测到 pm2，跳过后端重启；裸机请先按 deploy/README.md 完成首次部署"
else
  log "后端进程不存在，首次启动 $PM2_APP"
  pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
  pm2 save
fi

log "完成。健康检查：curl -s http://127.0.0.1:8791/health"
