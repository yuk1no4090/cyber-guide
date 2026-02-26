# 🛶 Cyber Guide — 小舟

> A small boat that's sailed through every depth — ready to ferry you across.

[中文](#中文说明) | English

Cyber Guide (nicknamed "小舟" / Xiaozhou, meaning "small boat") is an AI-powered companion built with Next.js and OpenAI-compatible APIs (currently GLM-4.6), designed for CS students and professionals navigating life's uncertainties — career choices, procrastination, anxiety, workplace dynamics, and everything in between.

This isn't a therapist. It's someone who's been through the same waters and is willing to share the journey honestly.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)

## ✨ Features

- 🛶 **Authentic AI Persona** — "Xiaozhou" (小舟, small boat) has real stories: 700+ days of daily vocab memorization, failed grad school entrance exams, and ongoing battles with procrastination
- 💬 **Guided Conversation** — Smart suggestion chips that feel like your own thoughts
- 📋 **Dual Profile Analysis** — Understand yourself OR decode people around you (roommates, bosses, colleagues)
- 📊 **Feedback & Rating System** — Users rate conversations 1-10, algorithmic quality classification (gold/silver/bronze/needs_fix), stored in Supabase
- 🛡️ **Crisis Detection** — Keyword-based safety mechanism with false-positive filtering
- 📚 **RAG Knowledge Base** — 10 skill cards including original content
- 🔒 **Privacy First** — Data logging off by default, automatic PII redaction
- 📱 **Mobile-First Design** — Dark theme, responsive, safe-area support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- A Zhipu GLM API key (or any OpenAI-compatible API)
- A Supabase account (free tier, for feedback storage)

### Setup

```bash
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OPENAI_MODEL=glm-4.6
OPENAI_FALLBACK_MODEL=gpt-4o-mini
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
# Optional: API latency/timeout tuning (recommended for self-hosted deployments)
OPENAI_TIMEOUT_MS=25000
OPENAI_MAX_RETRIES=0
CHAT_CONTEXT_MAX_CHARS=2800
REPORT_CONTEXT_MAX_CHARS=4000
CONTEXT_MAX_SINGLE_MESSAGE_CHARS=900
RAG_REDUCE_CONTEXT_THRESHOLD_CHARS=2400
```

Run:

```bash
npm run dev
```

Visit http://localhost:3000

## Self-hosted Tuning

For self-hosted deployments behind reverse proxies, set longer upstream timeouts and disable proxy buffering for streaming:

```nginx
location /api/chat {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_buffering off;
}
```

Recommended runtime settings:

- `OPENAI_TIMEOUT_MS=25000` (or `25000~30000` based on your gateway timeout)
- `OPENAI_MAX_RETRIES=0` or `1`
- `OPENAI_FALLBACK_MODEL=<a cheaper/faster model>`
- `CHAT_CONTEXT_MAX_CHARS=2800`
- `REPORT_CONTEXT_MAX_CHARS=4000`
- `CONTEXT_MAX_SINGLE_MESSAGE_CHARS=900`
- `RAG_REDUCE_CONTEXT_THRESHOLD_CHARS=2400`
- PM2: set `--max-memory-restart` (example: `600M`) to avoid long-term memory drift

### PM2 Deployment (One-command)

This repo now includes:

- `ecosystem.config.js` (PM2 process config)
- `scripts/deploy.sh` (pull/install/build/reload/smoke pipeline)
- `scripts/smoke-test.sh` (supports both NDJSON streaming and JSON chat responses)

Usage:

```bash
# in project root
npm run deploy

# optional:
# DEPLOY_BRANCH=main HEALTH_URL=http://127.0.0.1:3000 npm run deploy
# SKIP_GIT_PULL=1 npm run deploy
```

Ops worklog: `docs/ops_stability_worklog.md`

## 📁 Architecture

```
POST /api/chat
    ├─ 1. Crisis Detection (local keywords, zero cost)
    ├─ 2. RAG Retrieval (keyword + bigram matching)
    ├─ 3. Smart History Truncation (keep identity + recent)
    ├─ 4. OpenAI-compatible Chat Completion (GLM-4.6 by default)
    ├─ 5. Parse Suggestions (fallback if missing)
    └─ 6. Optional Logging

POST /api/feedback
    ├─ Redact PII from messages
    ├─ Calculate quality score & tier
    └─ Store in Supabase PostgreSQL
```

## ⚠️ Disclaimer

**This application does not provide medical diagnosis, psychological diagnosis, or treatment advice.**

If you or someone you know is in crisis:
- 🇨🇳 China: 400-161-9995 / 400-821-1215
- 🇺🇸 US: 988 Suicide & Crisis Lifeline
- 🌍 International: [findahelpline.com](https://findahelpline.com)

## 🔒 Privacy Policy

- Data collection is **off by default**
- All stored conversations are automatically **redacted**
- Feedback is stored in Supabase with quality classification
- You can toggle data collection on/off at any time

## 📝 License

MIT

---

# 中文说明

## 🛶 小舟 · Cyber Guide

> 一叶小船，水深水浅都趟过，带你渡河。

小舟是一个基于 Next.js 和 OpenAI 兼容接口（当前为 GLM-4.6）构建的 AI 陪伴工具，面向 CS 学生和职场人——聊迷茫、聊方向、聊拖延、聊人际关系，或者单纯找人说说话。

这不是心理咨询师，是一个水深水浅都趟过的同路人，愿意把真实经历分享出来。

### 核心功能

- 🛶 **真实人格** — 基于真实经历：700 天背单词、考研失败、INFP 的拖延症
- 💬 **引导式对话** — 建议标签像你心里想说但没说出口的话
- 📋 **双模式画像** — 了解自己 / 看懂身边的人
- 📊 **评价反馈系统** — 1-10 打分 + 质量分级算法 + Supabase 数据库
- 🛡️ **安全机制** — 危机检测 + 误触发过滤
- 📚 **原创知识库** — 轨道与旷野、坚持方法论、大学迷茫指南
- 🔒 **隐私保护** — 默认关闭记录，自动脱敏

### 快速开始

```bash
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
npm install
# 创建 .env 文件，填入 GLM API Key 和 Supabase 配置
# 可选性能参数（自建服务器建议配置）
# OPENAI_TIMEOUT_MS=25000
# OPENAI_MAX_RETRIES=0
# OPENAI_FALLBACK_MODEL=gpt-4o-mini
npm run dev
```

### 自建部署建议（反向代理）

如果你是 Nginx/宝塔/容器网关这类前置代理，务必：

- `proxy_read_timeout 120s`
- `proxy_send_timeout 120s`
- `proxy_buffering off`（让流式响应及时透传）

同时建议环境变量：

- `OPENAI_TIMEOUT_MS=25000`（或按网关上限设置在 `25000~30000`）
- `OPENAI_MAX_RETRIES=0` 或 `1`
- `OPENAI_FALLBACK_MODEL=...`（配置一个更快更便宜的降级模型）
- `CHAT_CONTEXT_MAX_CHARS=2800`
- `REPORT_CONTEXT_MAX_CHARS=4000`
- `CONTEXT_MAX_SINGLE_MESSAGE_CHARS=900`
- `RAG_REDUCE_CONTEXT_THRESHOLD_CHARS=2400`

PM2 建议设置 `--max-memory-restart`（例如 `600M`）减少长期运行后的内存漂移风险。

### PM2 一键发布（已内置）

仓库已内置：

- `ecosystem.config.js`：PM2 进程配置
- `scripts/deploy.sh`：拉取代码/安装依赖/构建/重载/冒烟检查
- `scripts/smoke-test.sh`：兼容 NDJSON 流式与 JSON 两种 chat 返回

使用方式：

```bash
# 在项目根目录
npm run deploy

# 可选参数示例：
# DEPLOY_BRANCH=main HEALTH_URL=http://127.0.0.1:3000 npm run deploy
# SKIP_GIT_PULL=1 npm run deploy
```

稳定性留存文档：`docs/ops_stability_worklog.md`

### 添加知识库内容

在 `knowledge_base/skills/` 下创建 `.md` 文件，末尾加上关键词行：

```markdown
**关键词**: 迷茫, 方向, 大学, 规划
```

重启服务即可生效。

---

**水再深，小舟也能飘过去 🛶**
