# API Contract

Base URL examples:

- local backend: `http://localhost:8080`
- production backend: `https://your-domain.com/api`

All responses use JSON unless explicitly marked as NDJSON stream.

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

## 2. Chat APIs

### 2.1 POST `/api/chat`

Description:

- main chat endpoint
- supports normal chat, profile modes, report modes
- can return NDJSON stream for incremental rendering

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
- `scenario`: optional relationship scenario

JSON response example:

```json
{
  "message": "先别急，我们一起拆开看。",
  "suggestions": ["我最焦虑的是找工作", "我总是拖延"],
  "isCrisis": false
}
```

NDJSON response line types:

- `{"t":"delta","c":"文本分片"}`
- `{"t":"meta","message":"完整文本","suggestions":[]}`
- `{"t":"error","message":"错误信息"}`

### 2.2 POST `/api/feedback`

Request:

```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "rating": 8,
  "feedback": "很有帮助",
  "hadCrisis": false,
  "mode": "chat"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "quality": {
      "score": 78.5,
      "tier": "gold"
    }
  },
  "error": null
}
```

## 3. Plan APIs

### 3.1 POST `/api/plan/generate`

Request:

```json
{
  "session_id": "uuid-v4",
  "context": "最近在找实习，算法刷题总是中断"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "plans": [
      { "day_index": 1, "task_text": "先完成 1 道简单题并复盘", "status": "todo" }
    ],
    "today_index": 1,
    "used_fallback": false
  },
  "error": null
}
```

### 3.2 GET `/api/plan/fetch?session_id=...`

Response:

```json
{
  "success": true,
  "data": {
    "plans": [],
    "today_index": 1,
    "today_plan": null
  },
  "error": null
}
```

### 3.3 POST `/api/plan/update`

Request:

```json
{
  "session_id": "uuid-v4",
  "day_index": 1,
  "status": "done"
}
```

### 3.4 POST `/api/plan/regenerate-day`

Request:

```json
{
  "session_id": "uuid-v4",
  "day_index": 2,
  "context": "最近项目任务很多，时间很碎"
}
```

## 4. Metrics API

### POST `/api/metrics`

Collect optional session metrics for product iteration.

## 5. Crawler read APIs

### 5.1 GET `/api/crawler/articles`

Query:

- `source` optional
- `limit` default `20`, max `100`
- `q` optional keyword

Response data:

- article id, source, title, summary, url, tags, published_at, score

### 5.2 GET `/api/crawler/sources`

Returns enabled source list and recent crawl status.

## 6. Error codes

- `INVALID_SESSION_ID`
- `INVALID_DAY_INDEX`
- `INVALID_STATUS`
- `RATE_LIMITED`
- `DB_ERROR`
- `INTERNAL_ERROR`
- `PLAN_NOT_FOUND`
- `AI_TIMEOUT`
