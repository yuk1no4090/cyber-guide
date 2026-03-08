# Cyber Guide — 架构文档 (Architecture)

## 系统概览

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│   Browser    │────>│  Frontend (Next.js 15 / React 19 / TS)      │
│              │<────│  Port 3000, rewrites /api/* to backend       │
└─────────────┘     └──────────────┬───────────────────────────────┘
                                   │ HTTP (JWT Bearer)
                    ┌──────────────▼───────────────────────────────┐
                    │  Backend (Java 21 / Spring Boot 3.3)         │
                    │  Port 8080                                   │
                    │                                              │
                    │  ┌─ interfaces/rest ── Controllers ──────┐   │
                    │  │  TraceIdFilter → JwtFilter → Security │   │
                    │  └───────────────┬───────────────────────┘   │
                    │                  │                            │
                    │  ┌─ application ─▼───────────────────────┐   │
                    │  │  MessagePipeline (chain of resp.)     │   │
                    │  │  ChatStrategyFactory (strategy)       │   │
                    │  │  Spring Events (async analytics)      │   │
                    │  └───────────────┬───────────────────────┘   │
                    │                  │                            │
                    │  ┌─ domain ──────▼───────────────────────┐   │
                    │  │  ChatSession, ChatResult, QualityScore│   │
                    │  │  PlanDomainService, ErrorCode          │   │
                    │  └───────────────┬───────────────────────┘   │
                    │                  │                            │
                    │  ┌─ infrastructure ▼─────────────────────┐   │
                    │  │  AiClient (OpenAI-compatible)         │   │
                    │  │  RagService (keyword + bigram)         │   │
                    │  │  Redis (cache + rate limit)            │   │
                    │  │  JPA Repositories (PostgreSQL)         │   │
                    │  │  Resilience4j (circuit breaker)        │   │
                    │  └───────────────────────────────────────┘   │
                    └──────────┬──────────────┬────────────────────┘
                               │              │
                    ┌──────────▼──┐  ┌────────▼────────┐
                    │ PostgreSQL  │  │  Redis 7         │
                    │ (JPA/DDL)   │  │  (cache + rate)  │
                    └─────────────┘  └─────────────────┘

                    ┌──────────────────────────────────┐
                    │  Crawler (Python)                 │
                    │  Scheduled, writes to PostgreSQL  │
                    └──────────────────────────────────┘
```

## 后端包结构（DDD 四层）

```
com.cyberguide/
├── CyberGuideApplication.java          # @SpringBootApplication + @EnableAsync
│
├── domain/                             # 领域层 — 实体、值对象、领域服务
│   ├── chat/        ChatSession, ChatResult
│   ├── plan/        PlanDomainService
│   ├── feedback/    QualityScore
│   └── shared/      ErrorCode, BizException
│
├── service/                            # 应用层 — 编排
│   ├── ChatService                     # 同步使用 MessagePipeline，流式直接调用 AI
│   ├── PlanService                     # Cache-Aside + CacheGuard
│   ├── FeedbackService                 # 发布 FeedbackReceivedEvent
│   ├── ModerationService               # 危机关键词检测
│   ├── RedactService                   # PII 脱敏（手机号、邮箱、身份证号）
│   ├── strategy/                       # 策略模式
│   │   ├── ChatStrategy (interface)
│   │   ├── DefaultChatStrategy
│   │   ├── CrisisChatStrategy
│   │   ├── ScenarioChatStrategy
│   │   └── ChatStrategyFactory
│   └── pipeline/                       # 责任链模式
│       ├── MessageHandler (interface)
│       ├── MessageContext
│       ├── MessagePipeline             # 编排器
│       ├── RedactHandler        (order 10)
│       ├── ModerationHandler    (order 20)
│       ├── RagEnrichHandler     (order 30)
│       ├── AiCompletionHandler  (order 40)
│       └── ResponseParseHandler (order 50)
│
├── controller/                         # 接口层 — REST 控制器
│   ├── ChatController                  # @RateLimiter via RedisRateLimiter
│   ├── PlanController
│   ├── FeedbackController
│   ├── CrawlerController               # @Cacheable("articles")
│   └── ApiResponse                     # 统一响应封装
│
├── model/                              # JPA 实体
│   ├── PlanDay, Feedback, CrawledArticle
│
├── repository/                         # Spring Data JPA
│   ├── PlanDayRepository, FeedbackRepository, CrawledArticleRepository
│
├── ai/              AiClient           # @CircuitBreaker + @Retry + 备用模型
├── rag/             RagService         # CacheGuard 支撑的检索
├── config/          AiProperties, WebConfig
├── security/        JwtTokenProvider, JwtAuthenticationFilter, SecurityConfig, AuthController
├── filter/          TraceIdFilter      # MDC traceId + X-Trace-Id 响应头
├── exception/       ErrorCode, BizException, AiServiceException, RateLimitException, GlobalExceptionHandler
├── event/           ChatCompletedEvent, FeedbackReceivedEvent, CrisisDetectedEvent, EventListeners
└── infrastructure/
    └── cache/       RedisConfig, CacheGuard, RedisRateLimiter
```

## 设计模式

### 策略模式 — ChatStrategy

不同的对话模式（default、crisis、scenario）各自拥有独立的策略，用于构建系统提示词和解析 AI 响应。`ChatStrategyFactory` 在运行时根据模式名称解析出正确的策略。

### 责任链模式 — MessagePipeline

同步对话请求依次通过 5 个处理器组成的管线。每个处理器可以读写共享的 `MessageContext`，也可以中止链路（例如危机检测会终止后续处理）。

### 事件驱动 — Spring ApplicationEvent

对话完成、反馈提交或危机检测后，事件被发布并由 `EventListeners` 异步消费。这将分析逻辑与请求路径解耦。

### Cache-Aside — Redis 缓存

读路径：检查 Redis -> 未命中 -> 从 DB/计算加载 -> 写入 Redis（带抖动 TTL）。
写路径：更新 DB -> 驱逐 Redis 缓存。
通过 `CacheGuard` 实现三重防护：穿透（null 哨兵）、雪崩（TTL 抖动 ±20%）、击穿（本地锁 + 双重检查）。

## 请求流程（对话）

```
Browser
  → POST /api/chat (JWT in Authorization header)
  → TraceIdFilter (assigns traceId to MDC)
  → JwtAuthenticationFilter (validates token, sets SecurityContext)
  → ChatController
    → RedisRateLimiter.allowChat() — distributed rate check
    → ChatService.chat()
      → MessagePipeline.execute()
        → RedactHandler: PII redaction
        → ModerationHandler: crisis keyword check (may abort)
        → RagEnrichHandler: Redis-cached knowledge retrieval
        → AiCompletionHandler: strategy.buildSystemPrompt() + aiClient.chat()
          → @CircuitBreaker + @Retry (fallback to backup model)
        → ResponseParseHandler: strategy.process()
      → publish ChatCompletedEvent (async)
    → return ChatResponse
  → GlobalExceptionHandler (catches any BizException/unexpected error)
  → JSON response with X-Trace-Id header
```

## 数据存储

| 存储 | 用途 | TTL / 保留策略 |
|---|---|---|
| PostgreSQL | plan_days, feedback, crawled_articles | 永久 |
| Redis `rag-evidence` | RAG 检索结果 | 30 min |
| Redis `plan-session` | 计划查询结果 | 10 min |
| Redis `articles` | 爬虫文章列表 | 60 min |
| Redis `rate:chat:*` | 分布式限流计数器 | 60 sec |

## 弹性机制

| 机制 | 作用范围 | 配置 |
|---|---|---|
| 熔断器 | AI 调用 | window=10, threshold=50%, open=30s |
| 重试 | AI 调用 | 最多 2 次，间隔 1s |
| 备用模型 | AI 调用 | 通过 `OPENAI_FALLBACK_MODEL` 配置 |
| 限流器 | 对话端点 | 每会话 15 req/min（Redis） |
| 缓存降级 | 所有 Redis 使用 | Redis 故障 → 回退至 DB |
| Null 哨兵 | CacheGuard | 防止缓存穿透，TTL 2min |
| TTL 抖动 | CacheGuard | ±20% 防止缓存雪崩 |
