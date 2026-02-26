#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT:-3000}}"
SKIP_PULL="${SKIP_GIT_PULL:-0}"

echo "[deploy] root=$ROOT_DIR"
echo "[deploy] branch=$BRANCH"
echo "[deploy] health_url=$HEALTH_URL"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] error: pm2 未安装，请先执行 npm i -g pm2"
  exit 1
fi

if [ "$SKIP_PULL" != "1" ]; then
  echo "[deploy] 拉取最新代码..."
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  echo "[deploy] 跳过 git 拉取（SKIP_GIT_PULL=1）"
fi

echo "[deploy] 安装依赖..."
npm ci

echo "[deploy] 构建应用..."
npm run build

echo "[deploy] 通过 PM2 启动/重载..."
pm2 startOrReload ecosystem.config.js --env production
pm2 save

echo "[deploy] 运行冒烟检查..."
bash scripts/smoke-test.sh "$HEALTH_URL"

echo "[deploy] 完成"
