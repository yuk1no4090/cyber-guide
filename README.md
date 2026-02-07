# 🐭 Cyber Guide — 耗子

> A CS student's AI companion that's been through the maze and lived to tell the tale.

[中文](#中文说明) | English

Cyber Guide (nicknamed "耗子" / Mouse) is an AI-powered companion built with Next.js and DeepSeek, designed for CS students navigating the chaos of university life — career choices, procrastination, anxiety, and everything in between.

This isn't a therapist. It's a senior student who's walked the same path, made the same mistakes, and is willing to share the scars honestly.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)

## ✨ Features

- 🐭 **Authentic AI Persona** — Not a generic chatbot. "Mouse" has real stories: 700+ days of daily vocab memorization, failed grad school entrance exams, and ongoing battles with procrastination
- 💬 **Guided Conversation** — Smart suggestion chips that feel like your own thoughts, not cold button labels
- 📋 **Profile Analysis** — Two modes: understand yourself, or decode people around you (roommates, bosses, colleagues)
- 🛡️ **Crisis Detection** — Keyword-based safety mechanism with false-positive filtering (distinguishes "I'm dying of heat" from real distress)
- 📚 **RAG Knowledge Base** — 10 skill cards including original content: the "good student trap", persistence methodology, university survival guide
- 🔒 **Privacy First** — Data logging off by default, automatic PII redaction (phone, email, ID, names)
- 📱 **Mobile-First Design** — Dark theme, `100dvh` viewport, safe-area support, responsive everything

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- A DeepSeek API key (or any OpenAI-compatible API)

### Setup

```bash
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

Run:

```bash
npm run dev
```

Visit http://localhost:3000

### Deploy to Vercel

Push to GitHub, connect to [Vercel](https://vercel.com), add the environment variables, done. Auto-deploys on every push.

## 📁 Architecture

```
POST /api/chat
    │
    ├─ 1. Crisis Detection (local keywords, zero cost)
    │     └─ Hit? → Return crisis template + hotlines (skip AI)
    │
    ├─ 2. RAG Retrieval (keyword + bigram matching)
    │     └─ Top 3 relevant knowledge chunks as evidence
    │
    ├─ 3. Smart History Truncation
    │     └─ Keep first 2 messages (identity) + last 10
    │
    ├─ 4. DeepSeek Chat Completion
    │     └─ System prompt + evidence + conversation
    │
    ├─ 5. Parse Suggestions
    │     └─ Extract 【建议】tags, fallback if missing
    │
    └─ 6. Optional Logging
          └─ Only if user opts in → redact PII → JSONL
```

## 🧠 What Makes This Different

This isn't another ChatGPT wrapper. The soul of this project is in the **knowledge base** — real stories, real failures, real advice from someone who's still figuring it out:

| File | Content |
|------|---------|
| `persistence_system.md` | How 700 days of daily vocab memorization actually works — the system, not willpower |
| `university_confusion.md` | A "good student" who couldn't function without rails — and how they woke up |
| `good_student_trap.md` | The essay: "You're not lost because you're weak. You're lost because the tracks disappeared." |
| + 7 skill cards | Breathing, relaxation, cognitive reframing, mindfulness, emotion regulation, sleep, communication |

## ⚠️ Disclaimer

**This application does not provide medical diagnosis, psychological diagnosis, or treatment advice.**

Cyber Guide is an AI companion tool designed to:
- Provide a listening ear and emotional support
- Share stress management and study planning tips
- Provide professional resource links in crisis moments

**It cannot replace:** professional counselors, doctors, or emergency services.

If you or someone you know is in crisis:
- 🇨🇳 China: 400-161-9995 / 400-821-1215
- 🇺🇸 US: 988 Suicide & Crisis Lifeline
- 🌍 International: [findahelpline.com](https://findahelpline.com)

## 🔒 Privacy Policy

- Data collection is **off by default**
- All stored conversations are automatically **redacted** (phone numbers, emails, names, IDs → replaced with tokens)
- Local JSONL storage only — no cloud uploads in MVP
- You can toggle data collection on/off at any time

## 📝 License

MIT

## 🙏 Acknowledgments

- [DeepSeek](https://deepseek.com) — LLM API
- [Next.js](https://nextjs.org) — React framework
- [Tailwind CSS](https://tailwindcss.com) — Styling
- The friend who gave me this idea and the nickname "Mouse" 🐭

---

# 中文说明

## 🐭 耗子 · Cyber Guide

> 一只在 CS 领域到处钻的小老鼠，个头不大但什么角落都待过。

耗子是一个基于 Next.js 和 DeepSeek 构建的 AI 陪伴工具，面向计算机相关专业的大学生——聊迷茫、聊方向、聊拖延、聊焦虑，或者单纯找人说说话。

这不是心理咨询师，是一个比你早走了一两步的学长，也会拖延、也会焦虑、也走过弯路，但愿意把踩过的坑分享出来。

### 核心功能

- 🐭 **真实人格** — 基于真实经历的 AI 角色：700 天背单词、考研失败、INFP 的拖延症
- 💬 **引导式对话** — 建议标签像你心里正在想的话，不像冰冷的按钮
- 📋 **双模式画像** — 了解自己 / 看懂身边的人（社交顾问）
- 🛡️ **安全机制** — 危机关键词检测 + 误触发过滤（"热死了"不会触发危机模板）
- 📚 **原创知识库** — 轨道与旷野、坚持方法论、大学迷茫指南
- 🔒 **隐私保护** — 默认关闭记录，自动脱敏
- 📱 **移动端适配** — 深色主题，完美竖屏体验

### 快速开始

```bash
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
npm install
# 创建 .env 文件，填入 DeepSeek API Key
npm run dev
```

### 添加知识库内容

在 `knowledge_base/skills/` 下创建 `.md` 文件，末尾加上关键词行：

```markdown
**关键词**: 迷茫, 方向, 大学, 规划
```

重启服务即可生效，无需额外操作。

---

**反正老鼠不怕摔，大不了再爬起来 🐭**
