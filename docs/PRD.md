# Cyber Guide PRD (Resume-Focused Rebuild)

## 1. Product positioning

Cyber Guide is an AI companion product for students and early-career professionals.
The product focus is study planning, career planning, and emotional support during uncertainty.

This version is rebuilt with a resume-oriented engineering target:

- mainstream fullstack architecture
- clear domain boundaries
- real data pipeline (crawler -> db -> rag -> chat)
- deployable system with runbooks

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

1. user opens chat
2. user describes confusion (study/job/skills)
3. system performs crisis check and context retrieval
4. model returns response + suggestion chips
5. user continues with follow-up questions

Success metric:

- median chat turn count >= 5
- user feedback average >= 7/10

### 4.2 Journey B: 7-day plan

1. user asks for a plan
2. system generates 7-day tasks from context
3. user marks tasks done/skipped
4. user can regenerate a specific day
5. system keeps progression state per session

Success metric:

- plan generation success rate >= 98%
- day status update success rate >= 99%

### 4.3 Journey C: crawler-informed suggestions

1. scheduled crawler fetches public articles/posts
2. data cleaner deduplicates and scores quality
3. backend exposes curated records to frontend
4. user sees "recent practical suggestions" panel
5. chat/rag can cite crawler-backed evidence

Success metric:

- daily crawl job success rate >= 95%
- duplicate ratio < 20%

## 5. Functional requirements

### 5.1 Frontend (Next.js 15)

- Chat UI with stream rendering and suggestion chips
- Profile mode and report generation
- 7-day plan card with status actions
- Feedback submission and quality display
- Crawler insights page (latest planning suggestions)

### 5.2 Backend (Spring Boot)

- `POST /api/chat` streaming and JSON fallback
- `POST /api/feedback` with pii redaction and scoring
- plan routes:
  - `POST /api/plan/generate`
  - `GET /api/plan/fetch`
  - `POST /api/plan/update`
  - `POST /api/plan/regenerate-day`
- `GET /api/crawler/articles` for frontend insights

### 5.3 Crawler (Python)

- Source config and scheduling
- Public pages fetch + parse + normalize
- Duplicate detection and persistence
- Structured output to PostgreSQL

## 6. Non-functional requirements

- Availability target: 99.5%
- p95 backend latency:
  - chat first chunk < 3s
  - non-chat apis < 600ms
- all services containerized for one-command startup
- sensitive fields never logged in plain text

## 7. Compliance and safety

- crisis keyword detection and emergency handoff response
- privacy-by-default:
  - metrics and optional logs are opt-in
  - pii redaction before persistence
- crawler only collects public pages and honors robots policies when applicable

## 8. Milestones

- Phase 0: docs and contracts
- Phase 1: backend service and db migration
- Phase 2: frontend migration to separated backend
- Phase 3: crawler module and insights integration
- Phase 4: dockerized deployment and ci hardening

## 9. Resume-facing highlights

- fullstack separation with API contract governance
- java service design: controller/service/repository layering
- python data pipeline with scheduling and cleaning
- postgres schema design + query/index optimization
- production deployment workflow with rollback strategy
