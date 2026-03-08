# Deployment Guide

## Docker Compose (recommended)

One-command startup for all services:

```bash
# Clone and configure
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
cp .env.example .env
# Edit .env — at minimum set OPENAI_API_KEY

# Start everything
docker compose up -d

# Check status
docker compose ps
docker compose logs -f backend
```

Services started:

| Service | Port | Image |
|---|---|---|
| PostgreSQL | 5432 | postgres:16-alpine |
| Redis | 6379 | redis:7-alpine (128MB, LRU eviction) |
| Backend | 8080 | Java 21 + Spring Boot 3.3 |
| Frontend | 3000 | Next.js 15 (standalone) |
| Crawler | — | Python 3.10 (scheduled, no exposed port) |

## Health verification

```bash
# Backend health (includes DB + Redis status)
curl http://localhost:8080/actuator/health

# Frontend
curl -o /dev/null -w "%{http_code}" http://localhost:3000

# Redis
docker exec cyber-guide-redis redis-cli ping

# JWT flow
curl -s -X POST http://localhost:8080/api/auth/anonymous \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test"}' | python3 -m json.tool
```

## Environment variables

See `DEVELOPMENT.md` for the full variable table. Production-critical ones:

```env
OPENAI_API_KEY=your-key          # required
JWT_SECRET=your-32-char-secret   # change from default
POSTGRES_PASSWORD=strong-pw      # change from default
```

## Updating

```bash
cd cyber-guide
git pull
docker compose build
docker compose up -d
```

## Scaling notes

- Backend is stateless (JWT + Redis) — can run multiple instances behind a load balancer
- Redis rate limiter is distributed — shared across all backend instances
- PostgreSQL connection pool: 10 max (adjust `spring.datasource.hikari.maximum-pool-size`)
- Redis connection pool: 16 max active, 8 idle

## Troubleshooting

| Symptom | Check |
|---|---|
| 403 on all API calls | Frontend not sending JWT — check browser console, clear localStorage |
| AI responses slow / failing | Check `docker compose logs backend` for circuit breaker state |
| Redis connection refused | `docker compose ps redis` — ensure it's running |
| Plan data stale | Redis cache TTL is 10min — wait or call a write endpoint to evict |
| Rate limited (429) | 15 req/min per session — wait 60s or use a different session_id |
