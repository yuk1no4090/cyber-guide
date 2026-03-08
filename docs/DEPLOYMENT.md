# Deployment Guide

## 1. Deployment model

- development environment:
  - Mac (Apple Silicon) + Docker Compose
- production environment:
  - Linux server + Docker Compose + Nginx

This split balances local productivity and production stability.

## 2. Prerequisites

- Docker 24+
- Docker Compose v2
- domain and SSL (production)
- OpenAI-compatible API key

## 3. Environment variables

Create `.env` in project root:

```env
# backend
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OPENAI_MODEL=glm-4.6
OPENAI_FALLBACK_MODEL=gpt-4o-mini
BACKEND_PORT=8080

# database
POSTGRES_DB=cyber_guide
POSTGRES_USER=cyber_guide
POSTGRES_PASSWORD=change_me
POSTGRES_PORT=5432

# frontend
FRONTEND_PORT=3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080

# crawler
CRAWLER_ENABLED=true
CRAWLER_INTERVAL_MINUTES=360
CRAWLER_MAX_PAGES_PER_SOURCE=3
```

## 4. Local startup

```bash
docker compose up --build
```

Verify:

- frontend: `http://localhost:3000`
- backend health: `http://localhost:8080/actuator/health`

## 5. Production rollout

### 5.1 Pull and build

```bash
git pull --ff-only origin main
docker compose pull
docker compose up -d --build
```

### 5.2 Run migrations

```bash
docker compose exec backend ./migrate.sh
```

### 5.3 Smoke test

```bash
curl -f http://127.0.0.1:8080/actuator/health
curl -f http://127.0.0.1:3000
```

## 6. Nginx example

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location /api/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_buffering off;
  }

  location / {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }
}
```

## 7. Rollback

1. identify last stable image tag or git commit
2. redeploy stable version
3. run health checks and minimal chat test

Example:

```bash
git checkout <stable_commit>
docker compose up -d --build
```

## 8. Ops checklist

- backend health green
- frontend responds
- chat endpoint returns stream/json
- plan generate/fetch/update works
- crawler recent run status is successful
