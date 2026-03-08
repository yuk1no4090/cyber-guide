# API 接口文档

基础 URL：`http://localhost:8080`（开发环境）/ 生产环境通过 Next.js 反向代理。

除 `/api/auth/**` 外，所有 `/api/**` 下的接口均需 JWT 认证。

## 0. 认证

### POST `/api/auth/anonymous`

公开接口 — 签发匿名会话令牌。

请求：

```json
{
  "session_id": "optional-uuid-v4"
}
```

响应：

```json
{
  "token": "eyJhbGciOiJIUzM4NCJ9...",
  "session_id": "uuid-v4",
  "type": "anonymous"
}
```

后续所有请求必须携带：

```
Authorization: Bearer <token>
```

## 1. 通用响应结构

成功：

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

失败：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "human readable message"
  }
}
```

所有错误响应均包含 `X-Trace-Id` 响应头，用于日志关联追踪。

## 2. 聊天接口

### 2.1 POST `/api/chat`

主聊天接口。限流：每个 session 每分钟 15 次请求（基于 Redis 分布式限流）。

请求：

```json
{
  "messages": [
    { "role": "user", "content": "最近很迷茫" }
  ],
  "mode": "chat",
  "scenario": null,
  "session_id": "uuid-v4"
}
```

字段说明：

- `mode`：`chat | profile | profile_other | generate_report | generate_report_other | generate_recap`
- `scenario`：可选，用于 `profile_other` 模式
- `session_id`：必填

JSON 响应：

```json
{
  "message": "先别急，我们一起拆开看。",
  "suggestions": ["我最焦虑的是找工作", "我总是拖延"],
  "isCrisis": false
}
```

### 2.2 POST `/api/chat/stream`

流式接口。请求体与 `/api/chat` 相同。返回 NDJSON（`application/x-ndjson`）。

每行格式：

```json
{"token": "文本分片"}
```

错误行：

```json
{"error": true, "message": "AI 服务异常: ..."}
```

### 2.3 POST `/api/feedback`

请求：

```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "rating": 4,
  "feedback": "很有帮助",
  "hadCrisis": false,
  "mode": "chat"
}
```

字段说明：

- `rating`：1-5（必填）
- `mode`：`chat | profile | profile_other`

响应：

```json
{
  "success": true,
  "data": {
    "quality": {
      "score": 78.5,
      "tier": "gold"
    }
  }
}
```

## 3. 计划接口

所有计划接口使用 Redis Cache-Aside 模式。读取操作带缓存（TTL 10 分钟），写入操作清除缓存。

### 3.1 GET `/api/plan/fetch?session_id=...`

响应：

```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "uuid",
        "sessionId": "uuid-v4",
        "dayIndex": 1,
        "taskText": "先完成 1 道简单题并复盘",
        "status": "todo",
        "createdAt": "2025-03-08T12:00:00Z"
      }
    ],
    "today_index": 1
  }
}
```

### 3.2 POST `/api/plan/generate`

请求：

```json
{
  "session_id": "uuid-v4",
  "context": "最近在找实习，算法刷题总是中断"
}
```

响应：结构与 fetch 接口相同，包含 7 条计划项。

### 3.3 PUT `/api/plan/status`

请求：

```json
{
  "session_id": "uuid-v4",
  "day_index": 1,
  "status": "done"
}
```

字段说明：

- `status`：`todo | done | skipped`

响应：

```json
{
  "success": true,
  "data": {
    "plan": { "dayIndex": 1, "taskText": "...", "status": "done" }
  }
}
```

### 3.4 POST `/api/plan/regenerate`

请求：

```json
{
  "session_id": "uuid-v4",
  "day_index": 2,
  "context": "最近项目任务很多，时间很碎"
}
```

字段说明：

- `day_index`：1-7

响应：结构与状态更新接口相同，返回重新生成的计划项。

## 4. 爬虫接口

### GET `/api/crawler/articles`

查询参数：

- `source` — 可选，按来源名称过滤
- `limit` — 默认 20，最大 100

缓存于 Redis（TTL 1 小时）。

响应：

```json
{
  "success": true,
  "data": {
    "articles": [
      {
        "id": "uuid",
        "sourceName": "zhihu",
        "title": "...",
        "summary": "...",
        "url": "https://...",
        "crawlTime": "2025-03-08T06:00:00Z"
      }
    ]
  }
}
```

## 5. 健康检查

### GET `/actuator/health`

公开接口（无需 JWT 认证）。

```json
{
  "status": "UP"
}
```

包含 Redis 和数据库健康指标。

## 6. 错误码

| 错误码 | HTTP 状态码 | 说明 |
|---|---|---|
| `INVALID_REQUEST` | 400 | 请求体缺失或格式错误 |
| `INVALID_SESSION_ID` | 400 | session_id 为空或缺失 |
| `INVALID_DAY_INDEX` | 400 | day_index 不在 1-7 范围内 |
| `INVALID_STATUS` | 400 | status 不在 todo/done/skipped 范围内 |
| `INVALID_RATING` | 400 | rating 不在 1-5 范围内 |
| `INVALID_MODE` | 400 | mode 无法识别 |
| `RESOURCE_NOT_FOUND` | 404 | 计划或实体未找到 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |
| `AI_SERVICE_ERROR` | 503 | AI 服务不可用（熔断器已打开） |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

## 7. 限流规则

| 接口 | 限制 | 时间窗口 | 作用域 |
|---|---|---|---|
| `/api/chat` | 15 | 60s | 每个 session_id |
| `/api/chat/stream` | 15 | 60s | 每个 session_id |

限流基于 Redis 实现分布式控制（多后端实例共享）。
