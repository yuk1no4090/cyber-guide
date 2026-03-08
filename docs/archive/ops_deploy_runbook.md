# Cyber Guide 运维部署手册（Runbook）

> 适用对象：自建服务器部署（Bohrium Linux + PM2 + Node.js）
> 当前工作流：Cursor SSH 直连服务器开发，改完即生效，push 到 GitHub 留存
> 目标：让部署、回滚、排障都可重复执行，减少"卡住/超时/不确定是否生效"。

---

## 0. 当前开发部署模式

```
Cursor IDE (本机) ──SSH──> Bohrium 服务器 (/opt/cyber-guide-repo)
                              │
                              ├─ 代码直接改动
                              ├─ npm run build
                              ├─ pm2 restart cyber-guide
                              ├─ curl 验证
                              │
                              └─ git push -> GitHub（留存）
```

- Agent 通过 Cursor SSH 直接操作服务器文件
- 不需要"本地改 -> push -> 服务器 pull"的中间环节
- 详细日常操作见 `docs/server_startup_and_sync_runbook.md`

---

## 1. 运行环境基线

建议最低配置：

- Node.js 18+
- npm 9+
- PM2 最新稳定版
- Linux 服务器具备 `git`、`bash`、`curl`

推荐安装验证：

```bash
node -v
npm -v
pm2 -v
```

---

## 2. 环境变量建议

在项目根目录创建/维护 `.env.production` 和 `.env.local`（内容一致）：

```env
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OPENAI_MODEL=glm-4.6
OPENAI_FALLBACK_MODEL=gpt-4o-mini

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 稳定性建议
OPENAI_TIMEOUT_MS=25000
OPENAI_MAX_RETRIES=0

# 上下文瘦身参数
CHAT_CONTEXT_MAX_CHARS=2800
REPORT_CONTEXT_MAX_CHARS=4000
CONTEXT_MAX_SINGLE_MESSAGE_CHARS=900
RAG_REDUCE_CONTEXT_THRESHOLD_CHARS=2400
```

说明：

- 如果你的网关超时更严格，先把 `OPENAI_TIMEOUT_MS` 设到 `20000~25000`，优先保证失败快速返回。
- 若出现偶发上游抖动，可将 `OPENAI_MAX_RETRIES` 调到 `1`，不要直接拉高到更大。
- `.env.production` 和 `.env.local` 不要 commit 到 git。

---

## 3. Nginx 关键配置（流式必须项）

示例（按你的域名与端口替换）：

```nginx
server {
    listen 80;
    server_name your.domain.com;

    location / {
        proxy_pass http://127.0.0.1:50001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # 流式响应关键配置
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_buffering off;
    }
}
```

修改后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. PM2 配置与进程管理

当前服务器使用的启动命令：

```bash
pm2 start "npm run start -- -H 0.0.0.0 -p 50001" --name cyber-guide --cwd /opt/cyber-guide-repo
pm2 save
```

日常重启：

```bash
pm2 restart cyber-guide
```

常用排查命令：

```bash
pm2 status
pm2 logs cyber-guide --lines 200
pm2 describe cyber-guide
```

---

## 5. 标准发布流程

### 方式 A：Cursor SSH 直改（推荐日常使用）

```bash
# Agent 在 Cursor SSH 中直接改代码，然后：
cd /opt/cyber-guide-repo
npm run build
pm2 restart cyber-guide
sleep 3
curl -I --max-time 5 http://127.0.0.1:50001

# 验证通过后同步到 GitHub
git add .
git commit -m "描述改了什么"
git push
```

### 方式 B：一键脚本（适合从 GitHub 拉取更新）

```bash
npm run deploy
# 或带参数：
DEPLOY_BRANCH=main HEALTH_URL=http://127.0.0.1:50001 npm run deploy
SKIP_GIT_PULL=1 npm run deploy
```

---

## 6. 冒烟检查说明

脚本：`scripts/smoke-test.sh`

覆盖点：

- 首页可访问
- `/api/chat`（兼容 NDJSON/JSON）
- 危机检测/误触发过滤
- `profile` / `profile_other` / `generate_report`
- `/api/feedback`
- 参数校验
- `/api/plan/fetch`

本地例子：

```bash
bash scripts/smoke-test.sh http://127.0.0.1:50001
```

---

## 7. 回滚流程（最小可用）

### 方案 A：按 commit 回滚（推荐）

```bash
git log --oneline -n 20
git checkout <stable_commit_sha>
npm ci
npm run build
pm2 restart cyber-guide
sleep 3
curl -I --max-time 5 http://127.0.0.1:50001
```

确认稳定后，再决定是否切回分支。

### 方案 B：临时降级模型兜底

当主模型异常率高时，可先调整 `.env.local`：

- `OPENAI_FALLBACK_MODEL` 指向更稳更快模型
- `OPENAI_MAX_RETRIES=0`（快速失败+降级，避免长等待）

然后重启：

```bash
npm run build
pm2 restart cyber-guide
```

---

## 8. 故障排查手册（按症状）

### 症状 1：前端报 "Request was aborted"

优先检查：

1. Nginx 是否开启 `proxy_buffering off`
2. `proxy_read_timeout` 是否足够（建议 120s）
3. 服务端日志是否存在对应 `request_id`

### 症状 2：响应慢但不报错

看日志中的阶段耗时：

- `RAG done` 慢：检查知识库规模与检索参数
- `LLM stream start/connected/done` 慢：上游模型或网络问题
- `plan.* db_done` 慢：数据库压力或网络抖动

### 症状 3：5xx 突增

优先动作：

1. 查看最近发布变更（是否刚发布）
2. 从日志提取失败的 `request_id`
3. 对比同时间段上游 API 状态与服务器资源
4. 必要时执行回滚流程

---

## 9. 值班检查清单（建议每日）

上线后 5 分钟检查：

1. `pm2 status` 正常
2. `pm2 logs` 无连续异常
3. 冒烟脚本通过
4. 前端手动发 1 条消息验证首包延迟

日常巡检：

1. 错误率趋势（4xx/5xx）
2. 模型降级命中率
3. 平均响应时间和 p95
4. 服务器内存与 CPU 占用

---

## 10. 文档索引

- 本手册（部署/回滚/排障）：`docs/ops_deploy_runbook.md`
- 服务器启动与同步：`docs/server_startup_and_sync_runbook.md`
- 阶段工作留存：`docs/ops_stability_worklog.md`
- Agent 交接文档（项目全貌）：`docs/AGENT_HANDOFF.md`
