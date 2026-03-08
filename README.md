# Cyber Guide - Fullstack Resume Edition

Cyber Guide is a portfolio-grade AI companion system for academic and career planning.
This branch introduces a production-style fullstack architecture:

- `frontend/`: Next.js 15 + React + TypeScript
- `backend/`: Java 21 + Spring Boot + PostgreSQL
- `crawler/`: Python + Scrapy + APScheduler
- `knowledge_base/`: markdown knowledge cards for lightweight RAG

The project is intentionally designed to show engineering depth for resume and interview scenarios:
frontend engineering, enterprise backend, data pipeline, and deployment automation.

## Why this architecture

- **Resume value**: mainstream backend stack (Spring Boot + PostgreSQL)
- **Multi-language ability**: Java + TypeScript + Python in one coherent system
- **Real data loop**: crawler -> local DB -> backend API -> frontend insights
- **Production thinking**: Docker Compose, Nginx reverse proxy, CI workflow, runbooks

## Repository layout

```text
cyber-guide/
  frontend/                 # Next.js 15 app router frontend
  backend/                  # Spring Boot API service
  crawler/                  # Python crawler and scheduler
  knowledge_base/skills/    # RAG source markdown files
  docs/                     # PRD, architecture, API, DB, deploy, user manual
  docker-compose.yml        # local/prod service orchestration
  nginx.conf                # reverse proxy config
```

## Runtime strategy (important)

Recommended setup:

- **Develop on Mac (Apple Silicon)**:
  - code, debug, and run Docker locally
  - fastest feedback loop and best IDE experience
- **Deploy on Linux server**:
  - stable 24x7 runtime for backend/frontend/crawler
  - fixed network egress for scheduled crawling

Decision rule:

- if your goal is productivity and interview-ready architecture, use **Mac for development + Linux for production**
- avoid "server-only development" except for final integration verification

## Quick start

### 1) Prepare env file

Copy `.env.example` to `.env` and fill secrets:

```bash
cp .env.example .env
```

### 2) Start full stack with Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- PostgreSQL: `localhost:5432`

### 3) Run crawler once manually

```bash
docker compose run --rm crawler python run.py --once
```

## Main features

- AI chat and guided suggestions for study/career planning
- 7-day action plan generate/fetch/update/regenerate endpoints
- Feedback scoring and persistence in PostgreSQL
- Local RAG evidence retrieval from `knowledge_base/skills`
- Scheduled crawler pipeline for public career/education content

## Documentation index

- Product requirements: `docs/PRD.md`
- System architecture: `docs/ARCHITECTURE.md`
- API contract: `docs/API.md`
- Database design: `docs/DATABASE.md`
- Crawler design: `docs/CRAWLER.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Development guide: `docs/DEVELOPMENT.md`
- User manual: `docs/USER_MANUAL.md`

## Disclaimer

Cyber Guide is not a medical or clinical system and does not provide diagnosis or treatment advice.
In crisis scenarios, users should be directed to local emergency and professional support resources.
