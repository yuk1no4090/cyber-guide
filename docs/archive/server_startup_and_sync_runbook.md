# 服务器启动与同步 GitHub 操作手册

> 适用环境：Bohrium Linux + PM2 部署 `cyber-guide`，对外端口 `50001`。
>
> 对外访问地址：`http://tkki1425875.bohrium.tech:50001`

---

## 0. 开发工作流（Cursor SSH 直连模式）

当前采用 **Cursor SSH 直连服务器** 的开发模式：

```
开发者本机 (Cursor IDE)
    │
    │  SSH Remote
    ▼
Bohrium 服务器 (/opt/cyber-guide-repo)
    │
    │  代码直接在服务器上改动
    │  改完 build + pm2 restart 即生效
    │
    ├─ 验证通过后 → git push 到 GitHub 留存
    └─ 对外服务：http://tkki1425875.bohrium.tech:50001
```

核心要点：

- **代码的"真实源"在服务器上**，GitHub 是备份和版本留存
- Agent（Cursor 中的 AI）通过 SSH 直接操作服务器文件系统，改完即可 build 验证
- 不需要"本地改 → push → 服务器 pull"的中间环节
- 改动验证通过后，统一 `git add + commit + push` 同步到 GitHub

### 日常开发循环

```bash
# 1. Cursor SSH 连接到服务器后，agent 直接改代码
# 2. 改完后构建验证
cd /opt/cyber-guide-repo
npm run build

# 3. 重启服务使改动生效
pm2 restart cyber-guide
sleep 3
curl -I --max-time 5 http://127.0.0.1:50001

# 4. 验证通过后同步到 GitHub
git add .
git commit -m "描述改了什么"
git push
```

### 给 Agent 的注意事项

- 你的工作目录是 `/opt/cyber-guide-repo`
- 改完代码后必须 `npm run build` 验证，不要跳过
- `.env.production` 和 `.env.local` 是服务器专属配置，不要 commit
- 如果 `git push` 失败（HTTP2 问题），执行 `git config --global http.version HTTP/1.1` 后重试

---

## 1. 首次启动（或进程不存在时）

```bash
cd /opt/cyber-guide-repo

# 确保 .env.local 存在（Next.js 构建时优先读取此文件）
# 如果只有 .env.production，先复制一份
cp -n .env.production .env.local 2>/dev/null || true

npm ci || npm install
npm run build
pm2 start "npm run start -- -H 0.0.0.0 -p 50001" --name cyber-guide --cwd /opt/cyber-guide-repo
pm2 save
sleep 3
curl -I --max-time 5 http://127.0.0.1:50001
```

## 2. 日常同步 GitHub 并重启（推荐固定流程）

```bash
cd /opt/cyber-guide-repo

# 注意：不要加 -u，否则会把 .env.production 也 stash 掉导致构建失败
git stash push -m "server"
git pull --rebase

# 确保 .env.local 存在
cp -n .env.production .env.local 2>/dev/null || true

npm ci || npm install
npm run build

pm2 restart cyber-guide 2>/dev/null || pm2 start "npm run start -- -H 0.0.0.0 -p 50001" --name cyber-guide --cwd /opt/cyber-guide-repo
pm2 save

sleep 3
curl -I --max-time 5 http://127.0.0.1:50001
```

## 3. 若 `pm2 restart cyber-guide` 报找不到进程

```bash
cd /opt/cyber-guide-repo
pm2 resurrect
pm2 ls
pm2 restart cyber-guide 2>/dev/null || pm2 start "npm run start -- -H 0.0.0.0 -p 50001" --name cyber-guide --cwd /opt/cyber-guide-repo
pm2 save
sleep 3
curl -I --max-time 5 http://127.0.0.1:50001
```

## 4. 关键自检命令

```bash
pm2 show cyber-guide
ss -lntp | grep -E ':50001|:3000|:13000' || true
pm2 logs cyber-guide --lines 120
```

判定标准：

- `pm2 show cyber-guide` 中 `script args` 应包含 `-p 50001`
- `ss` 应看到 `0.0.0.0:50001` 在监听
- `curl -I http://127.0.0.1:50001` 应返回 `HTTP/1.1 200 OK`（或 307/308 跳转）

## 5. 常见问题与处理

### 5.1 网页打不开，`curl 50001` 失败

先等 3 秒再测一次；若仍失败，按第 4 节排查：

- 进程未监听 50001（启动参数错误）
- 启动后秒退（查看 `pm2 logs`）

### 5.2 `git pull --rebase` 失败：`You have unstaged changes`

说明有本地改动未处理，先 stash 再 pull：

```bash
git stash push -m "server"
git pull --rebase
```

### 5.3 `Build error: supabaseUrl is required`

说明构建时缺少 Supabase 环境变量。Next.js 构建时优先读取 `.env.local`，不一定会读 `.env.production`。

确认两个文件都存在：

```bash
ls -la /opt/cyber-guide-repo/.env.production /opt/cyber-guide-repo/.env.local
```

如果只有 `.env.production` 没有 `.env.local`：

```bash
cp .env.production .env.local
```

需要的关键变量至少包括：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

### 5.4 聊天偶发“抱歉，小舟现在遇到了一些问题”

日志出现 `Request was aborted` 多为上游请求中断或超时。优先检查：

- `/api/chat` 请求是否偶发超时
- 模型服务是否抖动
- 当前超时参数是否过小

## 6. 注意事项（务必遵守）

1. 不要使用 `git stash -u` 作为日常流程，会把 `.env.production` / `.env.local` 一并 stash 掉，导致构建失败。
2. 服务器上需要同时保留 `.env.production` 和 `.env.local`（内容一致即可），因为 Next.js 构建时优先读 `.env.local`。
3. 每次 `pm2` 进程变更后执行 `pm2 save`，保证重启后可恢复。
4. `pm2 ls` 显示 online 不能完全代表可访问，始终以 `curl 127.0.0.1:50001` 为准。
5. 看到历史端口（3000/13000）日志不代表当前在使用该端口，需用 `ss -lntp` 判断实时监听。
6. 若需要给其他 Agent 做连通测试，统一提供公网地址：`http://tkki1425875.bohrium.tech:50001`。

## 7. 文档索引

- 本手册（启动/同步/日常操作）：`docs/server_startup_and_sync_runbook.md`
- 运维部署手册（回滚/排障/值班）：`docs/ops_deploy_runbook.md`
- 阶段工作留存：`docs/ops_stability_worklog.md`
- Agent 交接文档（项目全貌）：`docs/AGENT_HANDOFF.md`

