# Cyber Guide PRD (Resume-Focused Rebuild)

## 1. Product positioning

Cyber Guide is an AI companion product for students and early-career professionals.
The product focus is study planning, career planning, and emotional support during uncertainty.

This version is rebuilt with a resume-oriented engineering target:

- mainstream fullstack architecture (Java + React + Python)
- clear domain boundaries (DDD four-layer architecture)
- real data pipeline (crawler -> db -> rag -> chat)
- production-grade infrastructure (JWT auth, Redis cache, circuit breaker, distributed rate limiting)
- deployable system with Docker Compose one-command startup

## 2. Goals and non-goals

### 2.1 Goals

- Provide useful planning support through multi-turn chat
- Generate and track 7-day action plans
- Continuously ingest public planning-related content via crawler
- Ground model output with local RAG evidence
- Deliver a production-style architecture for interview discussion

### 2.2 Non-goals

- Medical diagnosis or clinical treatment guidance
- Unbounded social-media crawling of private data
- Fully autonomous recommendations without human-readable evidence

## 3. Target users

- CS students (undergrad/master) with direction anxiety
- New graduates preparing for internship/job search
- Early-career professionals considering next-step transitions

## 4. Core user journeys

### 4.1 Journey A: chat guidance

1. user opens chat, frontend obtains anonymous JWT via `/api/auth/anonymous`
2. user describes confusion (study/job/skills)
3. message pipeline: PII redaction -> crisis check -> RAG retrieval -> AI completion -> response parsing
4. model returns response + suggestion chips
5. user continues with follow-up questions

Success metric:

- median chat turn count >= 5
- user feedback average >= 7/10

### 4.2 Journey B: 7-day plan

1. user asks for a plan
2. system generates 7-day tasks from context (AI + fallback pool)
3. user marks tasks done/skipped
4. user can regenerate a specific day
5. system keeps progression state per session (cached in Redis, persisted in PostgreSQL)

Success metric:

- plan generation success rate >= 98%
- day status update success rate >= 99%

### 4.3 Journey C: crawler-informed suggestions

1. scheduled crawler fetches public articles/posts
2. data cleaner deduplicates and scores quality
3. backend exposes curated records to frontend (cached in Redis, TTL 1h)
4. user sees "recent practical suggestions" panel
5. chat/rag can cite crawler-backed evidence

Success metric:

- daily crawl job success rate >= 95%
- duplicate ratio < 20%

## 5. Functional requirements

### 5.1 Frontend (Next.js 15 + React 19 + TypeScript + Tailwind CSS)

- Chat UI with NDJSON stream rendering and suggestion chips
- Profile mode (self / other) and report generation
- Scenario picker for role-play practice
- 7-day plan card with status actions (done/skipped/regenerate)
- Feedback submission with quality scoring display
- Recap card for conversation summary
- JWT token lifecycle (auto-obtain, cache in localStorage, auto-refresh on 401)

### 5.2 Backend (Java 21 + Spring Boot 3.3 + JPA + PostgreSQL + Redis)

Authentication:
- `POST /api/auth/anonymous` — issue anonymous JWT token

Chat:
- `POST /api/chat` — streaming (NDJSON) and JSON response
- `POST /api/chat/stream` — dedicated streaming endpoint

Feedback:
- `POST /api/feedback` — with PII redaction and quality scoring

Plan:
- `GET /api/plan/fetch?session_id=` — fetch plans (Redis cached)
- `POST /api/plan/generate` — generate 7-day plan
- `PUT /api/plan/status` — update day status
- `POST /api/plan/regenerate` — regenerate single day

Crawler data:
- `GET /api/crawler/articles` — list articles (Redis cached, TTL 1h)

Infrastructure:
- Global exception handler with unified error codes
- TraceId filter (MDC + X-Trace-Id header)
- Resilience4j circuit breaker + retry on AI calls
- Redis distributed rate limiting (Lua atomic script)
- Redis multi-TTL caching with penetration/avalanche/breakdown protection

### 5.3 Crawler (Python)

- Source config and scheduling (configurable interval, default 6h)
- Public pages fetch + parse + normalize
- Duplicate detection (dedupe hash) and persistence
- Structured output to PostgreSQL

## 6. Non-functional requirements

- Availability target: 99.5%
- p95 backend latency:
  - chat first chunk < 3s
  - non-chat APIs < 600ms
- All services containerized for one-command startup (`docker compose up`)
- Sensitive fields never logged in plain text (PII redaction in pipeline)
- Redis graceful degradation: cache failure falls through to DB, does not block requests
- Circuit breaker: AI service failure >50% triggers open state, auto-recovers after 30s

## 7. Compliance and safety

- Crisis keyword detection and emergency handoff response (hotline: 400-161-9995)
- Privacy-by-default:
  - metrics and optional logs are opt-in
  - PII redaction before persistence (phone, email, ID card patterns)
- Crawler only collects public pages and honors robots policies when applicable
- JWT stateless authentication — no server-side session storage

## 8. Milestones

- Phase 0: docs and contracts — DONE
- Phase 1: backend service (Spring Boot + JPA + PostgreSQL) — DONE
- Phase 2: frontend migration to separated backend (JWT auth) — DONE
- Phase 3: crawler module and insights integration — DONE
- Phase 4: dockerized deployment (Docker Compose) and CI — DONE
- Phase 5: engineering hardening — DONE
  - Global exception handling + error codes
  - Spring Security + JWT authentication
  - Resilience4j circuit breaker + retry
  - Strategy pattern (ChatStrategy) + chain of responsibility (MessagePipeline)
  - Spring Events (async analytics)
  - DDD four-layer package structure
- Phase 6: Redis caching layer — DONE
  - RedisTemplate + Jackson serialization
  - Multi-TTL CacheManager (rag 30min, plan 10min, articles 1h)
  - CacheGuard: penetration/avalanche/breakdown protection
  - Distributed rate limiter (Redis INCR + Lua script)

## 9. Resume-facing highlights

Architecture & design patterns:
- Fullstack separation: Java backend + React frontend + Python crawler
- DDD four-layer architecture (domain / application / infrastructure / interfaces)
- Strategy pattern for multi-mode chat (default, crisis, scenario)
- Chain of responsibility for message processing pipeline (redact -> moderate -> RAG -> AI -> parse)
- Event-driven architecture with Spring ApplicationEvent (async analytics)
- Cache-Aside pattern for data consistency

Backend engineering:
- Java 21 + Spring Boot 3.3 + Spring Security + JPA
- Stateless JWT authentication (anonymous session tokens)
- Resilience4j circuit breaker + retry with fallback model
- Redis multi-layer caching with TTL jitter (avalanche protection)
- Cache penetration guard (null sentinel) + breakdown guard (local lock + double-check)
- Distributed rate limiting via Redis Lua atomic script
- Global exception handling with unified error codes + trace ID propagation
- NDJSON streaming response for real-time AI output

Data pipeline:
- Python crawler with scheduling, deduplication, and quality scoring
- PostgreSQL schema design with indexes and unique constraints
- Local RAG retrieval (keyword + bigram scoring) with Redis-cached results

Infrastructure:
- Docker Compose one-command deployment (backend + frontend + PostgreSQL + Redis + crawler)
- Logback MDC trace ID for request-level log correlation
- Actuator health checks (DB + Redis + circuit breaker status)
- Graceful degradation: Redis failure does not block core functionality
