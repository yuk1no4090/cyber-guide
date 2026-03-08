# Cyber Guide — Architecture

## System overview

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

## Backend package structure (DDD four-layer)

```
com.cyberguide/
├── CyberGuideApplication.java          # @SpringBootApplication + @EnableAsync
│
├── domain/                             # Domain layer — entities, value objects, domain services
│   ├── chat/        ChatSession, ChatResult
│   ├── plan/        PlanDomainService
│   ├── feedback/    QualityScore
│   └── shared/      ErrorCode, BizException
│
├── service/                            # Application layer — orchestration
│   ├── ChatService                     # Uses MessagePipeline for sync, direct AI for stream
│   ├── PlanService                     # Cache-Aside with CacheGuard
│   ├── FeedbackService                 # Publishes FeedbackReceivedEvent
│   ├── ModerationService               # Crisis keyword detection
│   ├── RedactService                   # PII redaction (phone, email, ID card)
│   ├── strategy/                       # Strategy pattern
│   │   ├── ChatStrategy (interface)
│   │   ├── DefaultChatStrategy
│   │   ├── CrisisChatStrategy
│   │   ├── ScenarioChatStrategy
│   │   └── ChatStrategyFactory
│   └── pipeline/                       # Chain of responsibility
│       ├── MessageHandler (interface)
│       ├── MessageContext
│       ├── MessagePipeline             # Orchestrator
│       ├── RedactHandler        (order 10)
│       ├── ModerationHandler    (order 20)
│       ├── RagEnrichHandler     (order 30)
│       ├── AiCompletionHandler  (order 40)
│       └── ResponseParseHandler (order 50)
│
├── controller/                         # Interface layer — REST controllers
│   ├── ChatController                  # @RateLimiter via RedisRateLimiter
│   ├── PlanController
│   ├── FeedbackController
│   ├── CrawlerController               # @Cacheable("articles")
│   └── ApiResponse                     # Unified response envelope
│
├── model/                              # JPA entities
│   ├── PlanDay, Feedback, CrawledArticle
│
├── repository/                         # Spring Data JPA
│   ├── PlanDayRepository, FeedbackRepository, CrawledArticleRepository
│
├── ai/              AiClient           # @CircuitBreaker + @Retry + fallback model
├── rag/             RagService         # CacheGuard-backed retrieval
├── config/          AiProperties, WebConfig
├── security/        JwtTokenProvider, JwtAuthenticationFilter, SecurityConfig, AuthController
├── filter/          TraceIdFilter      # MDC traceId + X-Trace-Id header
├── exception/       ErrorCode, BizException, AiServiceException, RateLimitException, GlobalExceptionHandler
├── event/           ChatCompletedEvent, FeedbackReceivedEvent, CrisisDetectedEvent, EventListeners
└── infrastructure/
    └── cache/       RedisConfig, CacheGuard, RedisRateLimiter
```

## Design patterns

### Strategy pattern — ChatStrategy

Different chat modes (default, crisis, scenario) each have their own strategy for building system prompts and parsing AI responses. `ChatStrategyFactory` resolves the correct strategy by mode name at runtime.

### Chain of responsibility — MessagePipeline

Sync chat requests pass through a pipeline of 5 handlers in order. Each handler can read/write the shared `MessageContext` or abort the chain (e.g. crisis detection stops further processing).

### Event-driven — Spring ApplicationEvent

After chat completion, feedback submission, or crisis detection, events are published and consumed asynchronously by `EventListeners`. This decouples analytics from the request path.

### Cache-Aside — Redis caching

Read path: check Redis -> miss -> load from DB/compute -> write Redis with jittered TTL.
Write path: update DB -> evict Redis cache.
Implemented via `CacheGuard` with three protections: penetration (null sentinel), avalanche (TTL jitter ±20%), breakdown (local lock + double-check).

## Request flow (chat)

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

## Data stores

| Store | Purpose | TTL / retention |
|---|---|---|
| PostgreSQL | plan_days, feedback, crawled_articles | permanent |
| Redis `rag-evidence` | RAG retrieval results | 30 min |
| Redis `plan-session` | plan fetch results | 10 min |
| Redis `articles` | crawler article lists | 60 min |
| Redis `rate:chat:*` | distributed rate limit counters | 60 sec |

## Resilience

| Mechanism | Scope | Config |
|---|---|---|
| Circuit breaker | AI calls | window=10, threshold=50%, open=30s |
| Retry | AI calls | max 2 attempts, 1s delay |
| Fallback model | AI calls | configurable via `OPENAI_FALLBACK_MODEL` |
| Rate limiter | chat endpoint | 15 req/min per session (Redis) |
| Cache degradation | all Redis usage | Redis failure → fall through to DB |
| Null sentinel | CacheGuard | prevents cache penetration, TTL 2min |
| TTL jitter | CacheGuard | ±20% prevents cache avalanche |
