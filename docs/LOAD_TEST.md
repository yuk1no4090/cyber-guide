# Load Test Guide

> 用 k6 对 `chat` / `chat/stream` 做并发压测，评估当前后端吞吐和延迟上限。

## 1) 安装 k6

macOS:

```bash
brew install k6
```

## 2) 压测前准备

- 确保后端可访问：`http://localhost:8080/actuator/health`
- 建议压测时单独跑后端，避免前端 dev server 干扰
- `.env` 中 AI key、DB、Redis 均可用

## 3) 脚本位置

`scripts/loadtest-chat.js`

支持参数：

- `BASE_URL`（默认 `http://localhost:8080`）
- `MODE`：`chat` 或 `stream`
- `PROFILE`：`quick` / `standard` / `stress`
- `THINK_TIME`：每轮间隔秒数（默认 `0.2`）
- `REQUEST_TIMEOUT`：单请求超时，默认 `chat=35s`，`stream=45s`

## 4) 运行示例

### Quick（先看通路）

```bash
BASE_URL=http://localhost:8080 MODE=chat PROFILE=quick k6 run scripts/loadtest-chat.js
```

### Standard（推荐日常评估）

```bash
BASE_URL=http://localhost:8080 MODE=chat PROFILE=standard k6 run scripts/loadtest-chat.js
```

### Stream（流式链路）

```bash
BASE_URL=http://localhost:8080 MODE=stream PROFILE=standard k6 run scripts/loadtest-chat.js
```

### Stress（逼近极限）

```bash
BASE_URL=http://localhost:8080 MODE=chat PROFILE=stress k6 run scripts/loadtest-chat.js
```

## 5) 关注指标

- `http_req_failed`：整体失败率
- `http_req_duration p(95)/p(99)`：总体延迟尾部
- `chat_latency` / `stream_latency`：业务路径延迟
- `auth_fail_count` / `chat_fail_count`：鉴权与对话失败计数
- `status_2xx_count` / `status_429_count` / `status_5xx_count` / `network_error_count`：失败构成拆解

> 说明：脚本会按 `MODE` 自动切换阈值（`chat` 与 `stream` 的阈值不同），避免混跑时误判。

## 6) 结果解读建议

- **可上线基础线**：`http_req_failed < 5%`，`p95 < 8s`，`p99 < 15s`
- **可扩容线**：`http_req_failed` 开始快速上升或 `p99` > 20s 时，说明已逼近瓶颈
- 先跑 `quick`，再 `standard`，最后 `stress`

## 7) 常见瓶颈定位

- `auth_fail_count` 升高：先看 `/api/auth/anonymous`、JWT、Redis
- `chat_fail_count` 升高：先看 AI 外部服务限额/超时
- 延迟高但失败率低：通常是 AI 端慢或后端线程被长连接占满
- DB 连接池饱和：观察 Hikari 活跃连接和等待时间

## 8) 下一步优化（按优先级）

1. 增加后端实例并挂负载均衡
2. 调整 DB 连接池/Redis 连接池
3. 把流式链路进一步非阻塞化并降低单请求持有资源
4. 对热点问答做缓存与降级策略

## 9) 建议的本地压测参数（当前项目）

基于当前实测（stream 大量 EOF、chat 高延迟排队），建议先用下面这组后端参数跑：

```bash
export CHAT_MAX_INFLIGHT=90
export STREAM_MAX_INFLIGHT=20
export OPENAI_TIMEOUT_MS=18000
export DB_POOL_MAX=30
export DB_POOL_MIN_IDLE=6
export REDIS_POOL_MAX_ACTIVE=48
export REDIS_POOL_MAX_IDLE=16
export REDIS_POOL_MIN_IDLE=6
```

然后启动后端：

```bash
cd backend
./mvnw spring-boot:run
```

再跑压测（分开跑）：

```bash
BASE_URL=http://localhost:8080 MODE=stream PROFILE=standard REQUEST_TIMEOUT=45s \
k6 run scripts/loadtest-chat.js > /tmp/k6-stream.txt 2>&1

BASE_URL=http://localhost:8080 MODE=chat PROFILE=standard REQUEST_TIMEOUT=35s \
k6 run scripts/loadtest-chat.js > /tmp/k6-chat.txt 2>&1
```
