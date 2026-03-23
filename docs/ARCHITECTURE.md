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
│   ├── ChatService                     # Sync + stream both reuse pipeline pre-stage
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
│   ├── ChatController                  # sync + stream chat, optional debug chat logging
│   ├── PlanController
│   ├── FeedbackController
│   ├── SessionController               # list/load chat sessions + messages (evidenceJson)
│   ├── AuthController                  # register/login, GitHub OAuth, email OTP
│   ├── CrawlerController               # @Cacheable("articles")
│   └── ApiResponse                     # Unified response envelope
│
├── model/                              # JPA entities
│   ├── User, ChatSession, ChatMessageEntity, PlanDay, Feedback
│   ├── CrawledArticle, CareerCase
│
├── repository/                         # Spring Data JPA
│   ├── UserRepository, ChatSessionRepository, ChatMessageRepository
│   ├── PlanDayRepository, FeedbackRepository, CrawledArticleRepository, CareerCaseRepository
│
├── ai/              AiClient           # @CircuitBreaker + @Retry + fallback model
├── rag/             RagService         # CacheGuard-backed retrieval
├── config/          AiProperties, WebConfig
├── security/        JwtTokenProvider, JwtAuthenticationFilter, SecurityConfig (JWT + OAuth2 login)
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

## Request flow (sync chat)

```
Browser
  → POST /api/chat (optional JWT in Authorization)
  → TraceIdFilter (MDC traceId)
  → JwtAuthenticationFilter
  → ChatController
    → RedisRateLimiter.allowChat()
    → ChatService.chat()
      → MessagePipeline.execute()  # full chain through ResponseParseHandler
      → persist + ChatCompletedEvent
  → JSON ChatResponse + X-Trace-Id
```

## Request flow (stream chat)

```
Browser
  → POST /api/chat/stream (NDJSON)
  → TraceIdFilter / JwtAuthenticationFilter
  → ChatController.chatStream()
    → RedisRateLimiter.allowChat()
    → ChatService.chatStreamWithMeta()
      → MessagePipeline.executeUpTo(order<=30)
        → RedactHandler, ModerationHandler, RagEnrichHandler (evidence + similarCases)
      → strategy prompt + aiClient.streamChat()
      → NDJSON: {"t":"delta","c":"..."}* then {"t":"meta",...,"evidence":[...],"similarCases":[...]}
      → on success: ChatPersistenceService.persistConversation(..., evidence); ChatCompletedEvent
```

## Evidence persistence

- Assistant messages can carry RAG evidence (`title` / `source` / `url` / `score` / `tier`).
- `ChatPersistenceService` stores JSON in `chat_messages.evidence_json`.
- `SessionController` returns parsed evidence for history so the UI can show verifiable links/cards.

## Frontend hooks architecture

```
HomeContent (layout + wiring only)
├── useChatFlow        # stream NDJSON, recap, feedback
├── useProfileFlow     # profile form, report, similar cases path
├── useSidebarSessions # collapsible sidebar, new chat, session load
├── useTheme           # light/dark (html.theme-dark)
├── useAuth            # JWT, login modal, GitHub redirect
└── usePlan            # 7-day plan state
```

## TraceId propagation

- Backend: `TraceIdFilter` sets MDC and echoes `X-Trace-Id` on responses.
- Frontend: `authFetch` in `src/lib/api.ts` keeps the last `X-Trace-Id` and sends it on subsequent calls for log correlation.

## Optional debug chat logging

- Config: `debug.chat-log.enabled` (and related keys in `application.yml`).
- When enabled, `ChatController` logs truncated user input and assistant output for local tuning — **disable in production** (privacy).

## Authentication

- **Email + password**: BCrypt hashes; registration may require email OTP (Redis-backed codes; mail optional — dev can log codes only).
- **GitHub OAuth**: Spring Security OAuth2 client; links or creates `users` row, issues JWT for the SPA.
- **Anonymous**: chat works without login; persistence rules differ (new anonymous session should not reuse prior server-side history — see `ChatPersistenceService`).

## Data stores

| Store | Purpose | TTL / retention |
|---|---|---|
| PostgreSQL | users, chat_sessions, chat_messages, plan_days, feedback, crawled_articles, career_cases | permanent |
| Redis `rag-evidence` | RAG retrieval results | 30 min |
| Redis `plan-session` | plan fetch results | 10 min |
| Redis `articles` | crawler article lists | 60 min |
| Redis `rate:chat:*` | distributed rate limit counters | 60 sec |
| Redis (email OTP) | registration verification codes | short TTL |

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
