# 🛶 小舟 · Cyber Guide — Agent 交接文档

> 本文档用于将项目完整交接给其他 AI Agent 或开发者。包含：项目全貌、设计理念、架构细节、代码地图、已知问题和后续方向。

---

## 一、项目是什么

**小舟 (Cyber Guide)** 是一个面向 CS 学生和职场青年的 AI 陪伴工具。

它不是心理咨询师，而是一个**有真实经历的同路人**——会共情、会给建议、必要时会犀利地戳你一下。

**核心价值**: 把创建者的真实经历（700 天背单词、考研失败、INFP 的拖延症）注入 AI，让对话不是鸡汤，而是有血肉的交流。

## 二、创建者背景

- 本科：西北工业大学，软件工程
- 硕士：香港中文大学（深圳），计算机与信息工程
- 性格：INFP，善于共情但容易拖延
- 目标：转型 AI 产品经理
- 外号灵感：姓周 → 小舟（谐音），寓意"一叶小船，渡你过河"

## 三、技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| AI | 智谱 GLM-4-Flash（OpenAI 兼容接口），可切换 DeepSeek/OpenAI |
| 数据库 | Supabase PostgreSQL（评价反馈 + 质量分级） |
| 部署 | Vercel（海外）+ 待迁国内平台 |
| RAG | 本地关键词 + bigram 匹配（无 Embedding 依赖） |

## 四、文件结构与代码地图

```
cyber-guide/
├── docs/                           # 产品文档
│   ├── PRD.md                      # 产品需求文档
│   ├── PRODUCT_PRINCIPLES.md       # 产品原则
│   ├── SYSTEM_PROMPT.md            # ⭐ AI 人格定义（最核心的文件）
│   ├── DATA.md                     # 数据策略
│   ├── EVAL.md                     # 评估策略
│   └── AGENT_HANDOFF.md            # 本文档
│
├── knowledge_base/skills/          # ⭐ RAG 知识库（10 篇）
│   ├── persistence_system.md       # 🌟 原创：700天背单词方法论
│   ├── university_confusion.md     # 🌟 原创：大学迷茫觉醒之路
│   ├── good_student_trap.md        # 🌟 原创：轨道与旷野（好学生困境）
│   ├── breathing.md                # 呼吸练习
│   ├── progressive_relaxation.md   # 渐进式肌肉放松
│   ├── cognitive_reframing.md      # 认知重构
│   ├── mindfulness.md              # 正念练习
│   ├── emotion_regulation.md       # 情绪调节
│   ├── sleep_hygiene.md            # 睡眠卫生
│   └── communication.md            # 沟通技巧
│
├── src/
│   ├── app/
│   │   ├── page.tsx                # ⭐ 主页面（聊天 + 画像 + 反馈，约 460 行）
│   │   ├── layout.tsx              # 根布局
│   │   ├── globals.css             # 全局样式（天蓝阳光主题）
│   │   ├── api/
│   │   │   ├── chat/route.ts       # ⭐ 核心 API（聊天 + 画像 + 报告生成）
│   │   │   └── feedback/route.ts   # 评价反馈 API（写入 Supabase）
│   │   └── components/
│   │       ├── ChatMessage.tsx      # 消息气泡（Markdown 渲染 + 复制按钮）
│   │       ├── ChatInput.tsx        # 输入框
│   │       ├── SuggestionChips.tsx  # 建议标签
│   │       ├── FeedbackCard.tsx     # 评价卡片（1-10 打分）
│   │       ├── ProfileReport.tsx    # 画像报告卡片
│   │       └── TypingIndicator.tsx  # 打字动画
│   └── lib/
│       ├── openai.ts               # AI 客户端（支持 baseURL 切换）
│       ├── moderation.ts           # 危机检测（纯关键词 + 误触发过滤）
│       ├── rag.ts                  # RAG 检索（关键词 + bigram）
│       ├── prompt.ts               # System Prompt 读取（开发模式 30s 热更新）
│       ├── redact.ts               # PII 脱敏（手机/邮箱/身份证/姓名）
│       └── supabase.ts             # Supabase 客户端 + 质量分级算法
│
├── scripts/
│   └── ingest.ts                   # 向量导入脚本（当前未使用，保留备用）
│
├── README.md                       # 双语 README
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 五、核心流程

### 5.1 聊天 API 流程

```
POST /api/chat { messages, mode }
│
├─ 1. 危机检测（本地关键词，零成本）
│     ├─ 命中 → 返回危机模板 + 热线号码（不调 AI）
│     └─ 误触发过滤："热死了""累死了" 不触发
│
├─ 2. 模式分发
│     ├─ mode=chat → 普通聊天
│     ├─ mode=profile → 自我画像问答
│     ├─ mode=profile_other → 读人模式问答
│     ├─ mode=generate_report → 生成自我画像报告
│     └─ mode=generate_report_other → 生成读人报告
│
├─ 3. （仅 chat 模式）RAG 检索知识库 → top3 chunks 作为 evidence
│
├─ 4. 智能历史截断：保留前2条（身份信息）+ 最近10条
│
├─ 5. 调用 GLM/DeepSeek Chat Completions API
│
├─ 6. 后处理
│     ├─ cleanAIResponse()：剥离【共情】【理解】等 GLM 结构标记
│     ├─ parseSuggestions()：解析【建议】标签
│     └─ fallbackSuggestions()：AI 没给建议时，基于 AI 回复内容生成
│
└─ 返回 { message, suggestions, isCrisis }
```

### 5.2 评价反馈流程

```
用户聊了 3+ 轮 → 出现"给小舟打个分"按钮
                → 或点"新对话"/"返回聊天"时自动弹出
                → 1-10 打分 + 可选文字反馈 + 可选匿名保存
                → POST /api/feedback
                → 脱敏 → 计算质量分级 → 写入 Supabase

质量分级算法：
  score = 用户评分(50%) + 对话深度(30%) + 参与度(20%)
  gold ≥ 75 | silver ≥ 55 | bronze ≥ 35 | needs_fix < 35
```

### 5.3 画像功能流程

```
点击「📋 画像」→ 选择「了解自己」or「看懂身边的人」
│
├─ 了解自己 → AI 逐个问 7 个维度 → 生成自我画像
└─ 看懂别人 → AI 引导描述 ta → 生成读人报告

报告生成前检查：
- 用户至少发了 2 条 > 5 字的实质消息
- AI 判断信息是否充足，不够就拒绝生成（不硬编）
```

## 六、AI 人格设计（SYSTEM_PROMPT.md 的核心逻辑）

### 6.1 身份

- 昵称"小舟"，自称"小舟"或"我"，不说"作为 AI"
- 不自称"学长"，先了解对方再调整关系
- 两面性格：**温暖面**（默认共情）+ **犀利面**（对方逃避时戳一下）

### 6.2 建议标签铁律

每条建议必须是**用户的真实回答**（有信息量），不是给 AI 的指令：
```
❌ 先描述一个具体场景     → 指令，没信息
✅ ta 总是不打招呼就用我的东西  → 真实回答，有信息
```

### 6.3 观点立场

小舟对 CS 方向、考研、英语、拖延等话题有**明确观点**（写在 prompt 里），不会说"看你兴趣"这种废话。

## 七、数据库结构

### Supabase: case_cards 表

```sql
id              UUID        -- 主键
created_at      TIMESTAMPTZ -- 创建时间
redacted_messages JSONB     -- 脱敏后的消息数组
conversation_turns INT      -- 对话轮次
had_crisis      BOOLEAN     -- 是否触发危机
rating          INT (1-10)  -- 用户评分
feedback        TEXT        -- 用户文字反馈
quality_tier    TEXT        -- gold/silver/bronze/needs_fix
quality_score   FLOAT       -- 综合得分
mode            TEXT        -- chat/profile/profile_other
```

## 八、环境变量

```env
# AI API（当前用智谱 GLM）
OPENAI_API_KEY=xxx
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OPENAI_MODEL=glm-4-flash

# Supabase
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

切换模型只需改这 3 个变量：

| 平台 | OPENAI_BASE_URL | OPENAI_MODEL |
|---|---|---|
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |

## 九、已知问题 & 待优化

### 已知问题

| 问题 | 原因 | 优先级 |
|---|---|---|
| git push 偶尔失败 | GitHub HTTP2 连接不稳定，需 `http.version HTTP/1.1` | 低 |
| Vercel 国内无法访问 | 需要绑自定义域名 + Cloudflare | 中 |
| GLM 偶尔漏掉【建议】格式 | 模型遵循指令能力有限，已有兜底机制 | 低 |
| 关闭页面提醒依赖 beforeunload | 移动端 Safari 不一定触发 | 低 |

### 待做功能

| 功能 | 描述 | 难度 |
|---|---|---|
| QQ 机器人 | NapCat + OneBot 协议，复用 /api/chat | ⭐⭐ |
| 国内部署 | 绑域名 + Cloudflare 或迁 Zeabur | ⭐ |
| 更多知识库 | 创建者写自己的 CS 方向观点、拖延经历 | ⭐ |
| 数据分析面板 | 从 Supabase 读取案例做可视化 | ⭐⭐ |
| 向量 RAG 升级 | 接入有 Embedding API 的服务，替代关键词匹配 | ⭐⭐ |

## 十、关键设计决策记录

| 决策 | 原因 |
|---|---|
| 用关键词匹配而非向量 RAG | DeepSeek/GLM 没有免费的 Embedding API |
| 危机检测纯本地关键词 | 不依赖外部 API，零延迟零成本 |
| 建议标签由 AI 生成而非前端硬编 | 每轮对话内容不同，建议要紧扣上下文 |
| 评价反馈存 Supabase 而非本地 | Vercel serverless 无持久化文件系统 |
| System Prompt 放在 .md 文件 | 方便非程序员编辑，开发模式 30s 热更新 |
| 天蓝阳光主题而非暗黑 | 产品定位是正能量陪伴，不是深夜树洞 |
| AI 自称"小舟"不自称"学长" | 用户可能比创建者年长，先了解关系再定称呼 |

## 十一、如何继续开发

### 添加知识库内容

在 `knowledge_base/skills/` 下创建 `.md` 文件，末尾加：
```markdown
**关键词**: 关键词1, 关键词2, 关键词3
```
重启服务即可生效。

### 修改 AI 人格

编辑 `docs/SYSTEM_PROMPT.md`，开发模式下 30 秒自动热更新。

### 修改界面

所有组件在 `src/app/components/`，主页面逻辑在 `src/app/page.tsx`。

### 部署更新

```bash
git add .
git commit -m "描述改了什么"
git push  # Vercel 自动部署
```

---

**水再深，小舟也能飘过去 🛶**

