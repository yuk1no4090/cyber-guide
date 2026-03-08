# Agent-B Integration Notes（7天微行动计划 MVP）

本分支按约束只交付 API / SQL / 测试，不修改 `src/app/page.tsx` 与 `src/app/api/chat/route.ts`。  
页面接入请由 Integrator 按本文说明完成。

## 1) 建议前端状态字段

```ts
type PlanStatus = 'todo' | 'done' | 'skipped';

interface PlanItem {
  id?: string;
  session_id: string;
  day_index: number; // 1~7
  task_text: string; // 8~40（服务端保证）
  status: PlanStatus;
  created_at?: string;
  updated_at?: string;
}

interface PlanViewState {
  sessionId: string;
  plans: PlanItem[];
  todayIndex: number;
  todayPlan: PlanItem | null;
  loadingFetch: boolean;
  loadingGenerate: boolean;
  loadingUpdate: boolean;
  loadingRegenerate: boolean;
  errorMessage: string | null;
}
```

## 2) 建议 `TodayTaskCard` Props

```ts
interface TodayTaskCardProps {
  sessionId: string;
  todayIndex: number;
  todayPlan: PlanItem | null;
  loadingFetch?: boolean;
  loadingAction?: boolean;
  errorMessage?: string | null;
  onGeneratePlan: () => Promise<void>;
  onMarkDone: () => Promise<void>;
  onMarkSkipped: () => Promise<void>;
  onRegenerateToday: () => Promise<void>;
}
```

## 3) 页面调用时机（不改 page.tsx 的情况下供后续接入）

1. **首次进入页面（`useEffect`）**
   - 生成/恢复 `session_id`（建议 localStorage：`cyber-guide-session-id`）。
   - 调用 `GET /api/plan/fetch?session_id=...`。
   - 如果 `plans.length === 0`，展示“生成7天计划”引导按钮。

2. **点击“生成7天计划”**
   - 调 `POST /api/plan/generate`，body: `{ session_id, context? }`。
   - 成功后更新 `plans/todayIndex/todayPlan`。
   - 失败时展示统一 `error.message`。

3. **点击“完成(done)”或“跳过(skipped)”**
   - 调 `POST /api/plan/update`，body: `{ session_id, day_index, status }`。
   - 成功后就地更新 `todayPlan.status`（或重新 fetch 一次）。

4. **点击“重生成今天”**
   - 调 `POST /api/plan/regenerate-day`，body: `{ session_id, day_index, context? }`。
   - 成功后替换当天 `task_text`，并将 `status` 视作 `todo`。

## 4) API 契约（统一响应壳）

- 成功：`{ success: true, data: ..., error: null }`
- 失败：`{ success: false, data: null, error: { code, message } }`

### 4.1 POST `/api/plan/generate`
- 入参：`{ session_id: string, context?: string }`
- 出参 data：
  - `plans: PlanItem[]`（7条，按 day_index 排序）
  - `today_index: number`
  - `used_fallback: boolean`

### 4.2 GET `/api/plan/fetch?session_id=...`
- 出参 data：
  - `plans: PlanItem[]`
  - `today_index: number`
  - `today_plan: PlanItem | null`

### 4.3 POST `/api/plan/update`
- 入参：`{ session_id: string, day_index: number, status: 'todo'|'done'|'skipped' }`
- 出参 data：`{ plan: PlanItem }`

### 4.4 POST `/api/plan/regenerate-day`
- 入参：`{ session_id: string, day_index: number, context?: string }`
- 出参 data：
  - `plan: PlanItem`
  - `used_fallback: boolean`

## 5) 埋点事件（前端补充接入）

服务端已记录同名事件日志；前端接入时建议也发送同名埋点：

- `plan_created`
- `plan_day_done`
- `plan_day_skipped`
- `plan_regenerated`

统一字段：

```ts
{
  day_index: number;
  success: boolean;
  latency_ms: number;
  error_type: string; // none / invalid_* / db_error / ai_error / ...
}
```

## 6) 失败处理建议

- `INVALID_SESSION_ID`：提示用户刷新页面重试。
- `INVALID_DAY_INDEX` / `INVALID_STATUS`：前端参数 bug，直接告警并拦截 UI。
- `PLAN_NOT_FOUND`：先引导用户生成 7 天计划。
- `DB_ERROR` / `INTERNAL_ERROR`：toast + 可重试按钮。

## 7) 兼容性说明

- 所有落库 `task_text` 已在服务端 `redact()` 后写入。
- `task_text` 强约束 8~40 字；超界自动回退模板任务。
- AI 异常时接口仍成功返回，并标记 `used_fallback=true`。

