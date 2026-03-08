# API Contract

Base URL: `http://localhost:8080` (dev) / behind Next.js rewrite in production.

All endpoints under `/api/**` (except `/api/auth/**`) require JWT authentication.

## 0. Authentication

### POST `/api/auth/anonymous`

Public endpoint — issue an anonymous session token.

Request:

```json
{
  "session_id": "optional-uuid-v4"
}
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzM4NCJ9...",
  "session_id": "uuid-v4",
  "type": "anonymous"
}
```

All subsequent requests must include:

```
Authorization: Bearer <token>
```

## 1. Common response envelope

Success:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Failure:

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

All error responses include `X-Trace-Id` header for log correlation.

## 2. Chat APIs

### 2.1 POST `/api/chat`

Main chat endpoint. Rate limited: 15 req/min per session (Redis distributed).

Request:

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

Fields:

- `mode`: `chat | profile | profile_other | generate_report | generate_report_other | generate_recap`
- `scenario`: optional, used in `profile_other` mode
- `session_id`: required

JSON response:

```json
{
  "message": "先别急，我们一起拆开看。",
  "suggestions": ["我最焦虑的是找工作", "我总是拖延"],
  "isCrisis": false
}
```

### 2.2 POST `/api/chat/stream`

Streaming endpoint. Same request body as `/api/chat`. Returns NDJSON (`application/x-ndjson`).

Each line:

```json
{"token": "文本分片"}
```

Error line:

```json
{"error": true, "message": "AI 服务异常: ..."}
```

### 2.3 POST `/api/feedback`

Request:

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

Fields:

- `rating`: 1-5 (required)
- `mode`: `chat | profile | profile_other`

Response:

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

## 3. Plan APIs

All plan endpoints use Redis Cache-Aside pattern. Reads are cached (TTL 10min), writes evict cache.

### 3.1 GET `/api/plan/fetch?session_id=...`

Response:

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

Request:

```json
{
  "session_id": "uuid-v4",
  "context": "最近在找实习，算法刷题总是中断"
}
```

Response: same structure as fetch, with 7 plan items.

### 3.3 PUT `/api/plan/status`

Request:

```json
{
  "session_id": "uuid-v4",
  "day_index": 1,
  "status": "done"
}
```

Fields:

- `status`: `todo | done | skipped`

Response:

```json
{
  "success": true,
  "data": {
    "plan": { "dayIndex": 1, "taskText": "...", "status": "done" }
  }
}
```

### 3.4 POST `/api/plan/regenerate`

Request:

```json
{
  "session_id": "uuid-v4",
  "day_index": 2,
  "context": "最近项目任务很多，时间很碎"
}
```

Fields:

- `day_index`: 1-7

Response: same as status update, returns the regenerated plan item.

## 4. Crawler APIs

### GET `/api/crawler/articles`

Query params:

- `source` — optional, filter by source name
- `limit` — default 20, max 100

Cached in Redis (TTL 1h).

Response:

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

## 5. Health check

### GET `/actuator/health`

Public endpoint (no JWT required).

```json
{
  "status": "UP"
}
```

Includes Redis and database health indicators.

## 6. Error codes

| Code | HTTP Status | Description |
|---|---|---|
| `INVALID_REQUEST` | 400 | Missing or malformed request body |
| `INVALID_SESSION_ID` | 400 | session_id is blank or missing |
| `INVALID_DAY_INDEX` | 400 | day_index not in 1-7 |
| `INVALID_STATUS` | 400 | status not in todo/done/skipped |
| `INVALID_RATING` | 400 | rating not in 1-5 |
| `INVALID_MODE` | 400 | mode not recognized |
| `RESOURCE_NOT_FOUND` | 404 | Plan or entity not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `AI_SERVICE_ERROR` | 503 | AI service unavailable (circuit open) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## 7. Rate limits

| Endpoint | Limit | Window | Scope |
|---|---|---|---|
| `/api/chat` | 15 | 60s | per session_id |
| `/api/chat/stream` | 15 | 60s | per session_id |

Rate limiting is distributed via Redis (shared across backend instances).
