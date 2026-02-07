# 🌿 Cyber Guide

> 温暖、专业的 AI 心理支持伙伴

Cyber Guide 是一个基于 Next.js 和 OpenAI 构建的心理支持聊天 Web 应用，为用户提供情感支持、倾听和心理疏导。

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)

## ⚠️ 重要声明

### 免责声明

**本应用不提供医学诊断、心理诊断或治疗建议。**

Cyber Guide 是一个 AI 辅助的情感支持工具，旨在：
- 提供倾听和情感支持
- 分享压力管理和情绪调节技巧
- 在危机时刻提供专业资源链接

**本应用不能替代：**
- 专业心理咨询师或治疗师
- 医生或精神科医生的诊断
- 紧急医疗服务

如果您正在经历严重的心理困扰或有自我伤害的想法，请立即联系专业帮助：

| 热线名称 | 电话 |
|---------|------|
| 全国心理援助热线 | 400-161-9995 |
| 北京心理危机研究与干预中心 | 010-82951332 |
| 生命热线 | 400-821-1215 |
| 急救电话 | 120 |

### 隐私政策

我们尊重您的隐私：

1. **数据收集默认关闭**：只有当您主动开启"允许匿名记录用于改进"选项时，我们才会保存对话数据。

2. **数据脱敏处理**：所有保存的对话都会自动脱敏，移除手机号、邮箱、姓名等个人身份信息。

3. **本地存储**：在当前 MVP 版本中，所有数据存储在本地服务器，不会上传到云端。

4. **数据用途**：收集的匿名数据仅用于改进 AI 回应质量，不会用于商业目的或与第三方共享。

5. **您的权利**：您可以随时关闭数据收集选项。

## ✨ 功能特点

- 🎨 **美观的聊天界面** - 深色主题，舒适的视觉体验
- 🛡️ **安全机制** - 内容审核 + 危机检测，保护用户安全
- 📚 **RAG 知识库** - 基于专业心理技能卡的智能检索
- 🔒 **隐私保护** - 数据记录默认关闭，严格脱敏处理
- 📱 **响应式设计** - 完美适配桌面和移动设备

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 或 yarn
- OpenAI API Key

### 安装

```bash
# 克隆项目
cd cyber-guide

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 OPENAI_API_KEY

# 导入知识库（生成向量索引）
npm run ingest

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 开始使用。

### 环境变量

| 变量 | 必需 | 描述 |
|-----|-----|------|
| `OPENAI_API_KEY` | ✅ | OpenAI API 密钥 |
| `OPENAI_MODEL` | ❌ | 使用的模型，默认 `gpt-4o` |

## 📁 项目结构

```
cyber-guide/
├── docs/                      # 项目文档
│   ├── PRD.md                # 产品需求文档
│   ├── PRODUCT_PRINCIPLES.md # 产品原则
│   ├── SYSTEM_PROMPT.md      # 系统提示词
│   ├── DATA.md               # 数据策略
│   └── EVAL.md               # 评估策略
├── knowledge_base/
│   └── skills/               # 技能卡知识库
│       ├── breathing.md      # 呼吸练习
│       ├── progressive_relaxation.md
│       ├── cognitive_reframing.md
│       ├── mindfulness.md
│       ├── emotion_regulation.md
│       ├── sleep_hygiene.md
│       └── communication.md
├── scripts/
│   └── ingest.ts             # 知识库导入脚本
├── src/
│   ├── app/
│   │   ├── api/chat/
│   │   │   └── route.ts      # 聊天 API
│   │   ├── components/
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   └── PrivacyToggle.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx          # 主页面
│   └── lib/
│       ├── openai.ts         # OpenAI 客户端
│       ├── moderation.ts     # 内容审核
│       ├── rag.ts            # RAG 检索
│       ├── redact.ts         # 数据脱敏
│       ├── logger.ts         # 日志记录
│       └── prompt.ts         # 提示词管理
├── data/                     # 数据存储（自动创建）
├── vector_store/             # 向量索引（自动创建）
└── package.json
```

## 🔧 开发

### 常用命令

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start

# 代码检查
npm run lint

# 重新导入知识库
npm run ingest
```

### 添加新的技能卡

1. 在 `knowledge_base/skills/` 目录下创建新的 `.md` 文件
2. 运行 `npm run ingest` 重新生成向量索引
3. 新的知识将自动被 RAG 系统检索使用

## 🛡️ 安全机制

### 内容审核流程

```
用户消息 → OpenAI Moderation API → 中文关键词检测 → 危机判定
                                                      ↓
                                            是 → 返回危机响应模板
                                            否 → RAG 检索 → AI 生成回复
```

### 危机检测

系统会检测以下内容并触发危机响应：
- 自杀/自伤相关表达
- 伤害他人的意图
- OpenAI Moderation API 标记的 self-harm 和 violence 类别

## 📊 数据处理

### 脱敏规则

| 类型 | 示例 | 替换为 |
|-----|------|-------|
| 手机号 | 13812345678 | [PHONE] |
| 邮箱 | test@example.com | [EMAIL] |
| 身份证 | 110101199001011234 | [ID_CARD] |
| 中文姓名 | 张小明 | [NAME] |

### 案例卡片格式

```json
{
  "id": "uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "sessionHash": "hash",
  "summary": {
    "conversationTurns": 5,
    "userMessageCount": 5,
    "assistantMessageCount": 5
  },
  "redactedSnippets": [...]
}
```

## 📝 许可证

本项目采用 MIT 许可证。

## 🙏 致谢

- [OpenAI](https://openai.com) - GPT 模型和 Embeddings API
- [Vectra](https://github.com/Stevenic/vectra) - 本地向量数据库
- [Next.js](https://nextjs.org) - React 框架
- [Tailwind CSS](https://tailwindcss.com) - CSS 框架

---

**如果你或你认识的人正在经历心理困扰，请记住：寻求帮助是勇敢的表现。专业的支持可以让事情变得不一样。** ❤️

