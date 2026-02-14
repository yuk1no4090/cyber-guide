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
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Run:

```bash
npm run dev
```

Visit http://localhost:3000

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
npm run dev
```

### 添加知识库内容

在 `knowledge_base/skills/` 下创建 `.md` 文件，末尾加上关键词行：

```markdown
**关键词**: 迷茫, 方向, 大学, 规划
```

重启服务即可生效。

---

**水再深，小舟也能飘过去 🛶**
