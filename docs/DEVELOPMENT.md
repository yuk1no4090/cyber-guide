# Development Guide

## Prerequisites

- Java 21 (OpenJDK or GraalVM)
- Node.js 18+ and npm
- Docker (for PostgreSQL and Redis)
- Python 3.10+ (for crawler, optional)

## Quick start

```bash
# 1. Start infrastructure
docker compose up -d postgres redis

# 2. Start backend
cd backend
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
export OPENAI_MODEL="glm-4-flash"
./mvnw spring-boot:run

# 3. Start frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The frontend rewrites `/api/*` to `localhost:8080`.

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | — | AI provider API key |
| `OPENAI_BASE_URL` | no | `https://open.bigmodel.cn/api/paas/v4` | OpenAI-compatible endpoint |
| `OPENAI_MODEL` | no | `glm-4-flash` | Primary model |
| `OPENAI_FALLBACK_MODEL` | no | — | Fallback model (circuit breaker) |
| `POSTGRES_HOST` | no | `localhost` | PostgreSQL host |
| `POSTGRES_DB` | no | `cyber_guide` | Database name |
| `POSTGRES_USER` | no | `cyber_guide` | Database user |
| `POSTGRES_PASSWORD` | no | `changeme` | Database password |
| `REDIS_HOST` | no | `localhost` | Redis host |
| `REDIS_PORT` | no | `6379` | Redis port |
| `JWT_SECRET` | no | built-in default | JWT signing secret (change in production) |

## Backend development

```bash
cd backend

# Compile
./mvnw compile

# Run
./mvnw spring-boot:run

# Package
./mvnw package -DskipTests
```

Key URLs when running:
- API: http://localhost:8080/api/
- Swagger UI: http://localhost:8080/swagger-ui.html
- Health check: http://localhost:8080/actuator/health

## Frontend development

```bash
cd frontend
npm install
npm run dev        # dev server on port 3000
npm run build      # production build
npm run lint       # ESLint
npx tsc --noEmit   # type check
```

## Project structure

```
cyber-guide/
├── backend/          Java 21 + Spring Boot 3.3
├── frontend/         Next.js 15 + React 19 + TypeScript
├── crawler/          Python scheduled crawler
├── knowledge_base/   RAG source markdown files
├── docs/             Project documentation
├── docker-compose.yml
└── .env
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed backend package structure.
