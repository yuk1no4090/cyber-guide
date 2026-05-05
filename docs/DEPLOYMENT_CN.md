# 部署指南

## Docker Compose（推荐方式）

一条命令启动所有服务：

```bash
# 克隆并配置
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
cp .env.example .env
# 编辑 .env — 至少设置 OPENAI_API_KEY

# 启动全部服务
docker compose up -d

# 检查状态
docker compose ps
docker compose logs -f backend
```

启动的服务：

| 服务 | 端口 | 镜像 |
|---|---|---|
| PostgreSQL | 5432 | postgres:16-alpine |
| Redis | 6379 | redis:7-alpine（128MB，LRU 淘汰策略） |
| Backend | 8080 | Java 21 + Spring Boot 3.3 |
| Frontend | 3000 | Next.js 15（standalone 模式） |
| Crawler | — | Python 3.10（定时任务，不暴露端口） |

## 健康检查

```bash
# 后端健康检查（包含 DB + Redis 状态）
curl http://localhost:8080/actuator/health

# 前端
curl -o /dev/null -w "%{http_code}" http://localhost:3000

# Redis
docker exec cyber-guide-redis redis-cli ping

# JWT 流程验证
curl -s -X POST http://localhost:8080/api/auth/anonymous \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test"}' | python3 -m json.tool
```

## 环境变量

完整变量表请参阅 `DEVELOPMENT.md`。生产环境关键变量：

```env
OPENAI_API_KEY=your-key          # 必填；变量名沿用 OpenAI 兼容格式
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4   # 默认智谱兼容端点
OPENAI_MODEL=glm-4-flash
JWT_SECRET=your-32-char-secret   # 请修改默认值
POSTGRES_PASSWORD=strong-pw      # 请修改默认值
```

## 更新部署

```bash
cd cyber-guide
git pull
docker compose build
docker compose up -d
```

## 扩展说明

- Backend 是无状态的（JWT + Redis）— 可在负载均衡器后运行多个实例
- Redis 限流器是分布式的 — 所有 Backend 实例共享
- PostgreSQL 连接池：最大 10 个连接（可调整 `spring.datasource.hikari.maximum-pool-size`）
- Redis 连接池：最大活跃连接 16 个，空闲连接 8 个

## 故障排查

| 症状 | 排查方法 |
|---|---|
| 所有 API 调用返回 403 | 前端未发送 JWT — 检查浏览器控制台，清除 localStorage |
| AI 响应缓慢或失败 | 检查 `docker compose logs backend` 查看熔断器状态 |
| Redis 连接被拒绝 | `docker compose ps redis` — 确认 Redis 正在运行 |
| Plan 数据过期 | Redis 缓存 TTL 为 10 分钟 — 等待或调用写入接口触发缓存清除 |
| 被限流（429） | 每个 session 限制 15 次/分钟 — 等待 60 秒或使用新的 session_id |
