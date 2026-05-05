# 开发指南

## 环境要求

- Java 21（OpenJDK 或 GraalVM）
- Node.js 20+ 及 npm（与前端 `@types/node` 一致）
- Docker（用于 PostgreSQL 和 Redis）
- Python 3.10+（爬虫可选；本地可用 3.13）

## 快速开始

```bash
# 1. 启动基础设施
docker compose up -d postgres redis

# 2. 启动后端
cd backend
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://open.bigmodel.cn/api/paas/v4"   # 默认智谱兼容端点
export OPENAI_MODEL="glm-4-flash"
./mvnw spring-boot:run

# 3. 启动前端（新终端窗口）
cd frontend
npm install
npm run dev
```

打开 http://localhost:3000。前端会将 `/api/*` 请求代理到 `localhost:8080`。

## 环境变量

将 `.env.example` 复制为 `.env` 并填写：

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `OPENAI_API_KEY` | 是 | — | AI 服务商 API 密钥 |
| `OPENAI_BASE_URL` | 否 | `https://open.bigmodel.cn/api/paas/v4` | OpenAI 兼容接口地址（默认指向智谱兼容服务） |
| `OPENAI_MODEL` | 否 | `glm-4-flash` | 主模型 |
| `OPENAI_FALLBACK_MODEL` | 否 | — | 备用模型（熔断降级） |
| `POSTGRES_HOST` | 否 | `localhost` | PostgreSQL 主机地址 |
| `POSTGRES_DB` | 否 | `cyber_guide` | 数据库名称 |
| `POSTGRES_USER` | 否 | `cyber_guide` | 数据库用户名 |
| `POSTGRES_PASSWORD` | 否 | `changeme` | 数据库密码 |
| `REDIS_HOST` | 否 | `localhost` | Redis 主机地址 |
| `REDIS_PORT` | 否 | `6379` | Redis 端口 |
| `JWT_SECRET` | 否 | 内置默认值 | JWT 签名密钥（生产环境请务必修改） |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 否 | — | GitHub OAuth（见 `.env.example`） |
| `EMAIL_CODE_*` | 否 | 开发可仅打日志 | 注册邮箱验证码（Redis + 可选邮件） |
| `ZHIHU_COOKIE` / `XHS_COOKIE` 等 | 否 | — | 爬虫可选配置（见 [CRAWLER.md](CRAWLER.md)） |
| `DEBUG_CHAT_LOG_ENABLED` | 否 | `false` | 后端对话调试日志（**勿在生产开启**） |

## 后端开发

```bash
cd backend

# 编译
./mvnw compile

# 运行
./mvnw spring-boot:run

# 打包
./mvnw package -DskipTests
```

运行时关键地址：
- API：http://localhost:8080/api/
- Swagger UI：http://localhost:8080/swagger-ui.html
- 健康检查：http://localhost:8080/actuator/health

## 前端开发

```bash
cd frontend
npm install
npm run dev        # 开发服务器，端口 3000
npm run build      # 生产构建
npm run lint       # ESLint 检查
npx tsc --noEmit   # 类型检查
```

## 项目结构

```
cyber-guide/
├── backend/          Java 21 + Spring Boot 3.3
├── frontend/         Next.js 15 + React 19 + TypeScript
├── crawler/          Python 定时爬虫
├── knowledge_base/   RAG 知识库 Markdown 文件
├── docs/             项目文档
├── docker-compose.yml
└── .env
```

详细后端包结构请参阅 [ARCHITECTURE.md](ARCHITECTURE.md)。
