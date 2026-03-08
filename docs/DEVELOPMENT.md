# Development Guide

## 1. Recommended workflow

- develop on Mac
- run full stack via Docker Compose
- keep Linux server for integration and production verification

## 2. Project modules

- `frontend/`: Next.js app
- `backend/`: Spring Boot service
- `crawler/`: Python scheduled pipeline
- `knowledge_base/`: markdown rag corpus

## 3. Local setup

### 3.1 Start all services

```bash
docker compose up --build
```

### 3.2 Module-by-module development

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
./mvnw spring-boot:run
```

Crawler:

```bash
cd crawler
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py --once
```

## 4. API contract rules

- any backend response change must update `docs/API.md`
- frontend should consume response envelope consistently
- avoid silent schema drift

## 5. Branch strategy

- `main`: stable branch
- feature branch naming:
  - `feature/backend-plan-refactor`
  - `feature/crawler-source-nowcoder`
  - `fix/frontend-stream-parser`

## 6. Test strategy

- frontend unit tests (components/hooks)
- backend unit + integration tests for core endpoints
- crawler parser tests using saved html fixtures

Suggested commands:

```bash
# frontend
cd frontend && npm test

# backend
cd backend && ./mvnw test

# crawler
cd crawler && pytest
```

## 7. Definition of done

- code compiles and tests pass
- API docs updated
- migration scripts included if schema changes
- runbook impact documented in `docs/DEPLOYMENT.md`
- no hardcoded secrets in repo
