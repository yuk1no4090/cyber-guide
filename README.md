# Cyber Guide

> AI-powered academic & career planning companion.
> AI 驱动的学业与职业规划助手。

## Architecture（架构）

```
┌───────────┐    ┌──────────────┐    ┌────────────┐
│  Frontend  │───▶│   Backend    │◀───│  Crawler    │
│ Next.js 15 │    │ Spring Boot  │    │  Python     │
└───────────┘    └──────┬───────┘    └─────┬──────┘
                        │                  │
                 ┌──────┴───────┐          │
                 │  PostgreSQL  │◀─────────┘
                 │    + Redis   │
                 └──────────────┘
```

## Tech Stack（技术栈）

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Java 21, Spring Boot 3.3, Spring Security, JPA, Resilience4j |
| Database | PostgreSQL 16, Redis 7 |
| Crawler | Python 3.10, Scrapy, APScheduler |
| Infra | Docker Compose, Nginx, JWT Auth |

## Quick Start（快速启动）

```bash
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
cp .env.example .env   # edit .env, set OPENAI_API_KEY at minimum
docker compose up -d
```

Verify（验证）:

```bash
curl http://localhost:8080/actuator/health   # backend health
curl -o /dev/null -w "%{http_code}" http://localhost:3000  # frontend → 200
docker exec cyber-guide-redis redis-cli ping               # → PONG
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080

## Project Structure（项目结构）

```
cyber-guide/
├── frontend/           # Next.js app router frontend
├── backend/            # Spring Boot API service
├── crawler/            # Python crawler & scheduler
├── knowledge_base/     # RAG source markdown files
├── docs/               # Documentation (EN + CN)
├── scripts/            # Utility scripts
├── docker-compose.yml  # Service orchestration
└── nginx.conf          # Reverse proxy config
```

## Documentation（文档）

| Document | EN | CN |
|----------|----|----|
| Product Requirements | [PRD.md](docs/PRD.md) | — |
| Architecture | [ARCHITECTURE.md](docs/ARCHITECTURE.md) | — |
| API Contract | [API.md](docs/API.md) | — |
| Database Design | [DATABASE.md](docs/DATABASE.md) | — |
| Crawler Design | [CRAWLER.md](docs/CRAWLER.md) | — |
| Deployment Guide | [DEPLOYMENT.md](docs/DEPLOYMENT.md) | [DEPLOYMENT_CN.md](docs/DEPLOYMENT_CN.md) |
| Development Guide | [DEVELOPMENT.md](docs/DEVELOPMENT.md) | — |
| User Manual | [USER_MANUAL.md](docs/USER_MANUAL.md) | — |

## License（许可证）

[MIT](LICENSE)

---

## 中文说明

Cyber Guide 是一个面向学生和职场新人的 AI 规划助手，提供学业规划、职业指导和情绪支持。

项目采用主流全栈架构：Java 后端 + React 前端 + Python 爬虫 + PostgreSQL + Redis，支持 Docker Compose 一键部署。

主要功能：
- 多轮 AI 对话与建议引导
- 7 天行动计划生成与追踪
- 爬虫数据管道与 RAG 检索增强
- JWT 无状态认证、Redis 分布式限流、熔断降级

详细文档见 `docs/` 目录，部署指南提供中文版本（`docs/DEPLOYMENT_CN.md`）。
