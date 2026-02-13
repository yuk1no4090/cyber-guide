import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PlanRow {
  id: string;
  session_id: string;
  day_index: number;
  task_text: string;
  status: 'todo' | 'done' | 'skipped';
  created_at: string;
  updated_at: string;
}

const createCompletionMock = vi.hoisted(() => vi.fn());
const mockPlanState = vi.hoisted(() => ({
  rows: new Map<string, PlanRow>(),
  failUpsert: false,
  failUpdate: false,
  idSeq: 1,
}));

vi.mock('@/lib/openai', () => ({
  CHAT_MODEL: 'test-model',
  openai: {
    chat: {
      completions: {
        create: createCompletionMock,
      },
    },
  },
}));

vi.mock('@/lib/supabase', () => {
  const keyOf = (sessionId: string, dayIndex: number) => `${sessionId}:${dayIndex}`;
  const nowIso = () => new Date().toISOString();
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

  const filterRows = (filters: Record<string, unknown>): PlanRow[] => {
    let rows = Array.from(mockPlanState.rows.values());
    if (typeof filters.session_id === 'string') {
      rows = rows.filter((row) => row.session_id === filters.session_id);
    }
    if (typeof filters.day_index === 'number') {
      rows = rows.filter((row) => row.day_index === filters.day_index);
    }
    return rows.map((row) => clone(row));
  };

  return {
    supabase: {
      from(table: string) {
        if (table !== 'action_plans') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          upsert(payload: unknown) {
            const rowsInput = Array.isArray(payload) ? payload : [payload];
            const upsertedRows: PlanRow[] = [];

            for (const rawRow of rowsInput) {
              const row = rawRow as Partial<PlanRow>;
              const sessionId = String(row.session_id ?? '');
              const dayIndex = Number(row.day_index ?? 0);
              const mapKey = keyOf(sessionId, dayIndex);
              const existing = mockPlanState.rows.get(mapKey);

              const next: PlanRow = {
                id: existing?.id ?? `plan-${mockPlanState.idSeq++}`,
                session_id: sessionId,
                day_index: dayIndex,
                task_text: String(row.task_text ?? existing?.task_text ?? ''),
                status: (row.status as PlanRow['status']) ?? existing?.status ?? 'todo',
                created_at: existing?.created_at ?? nowIso(),
                updated_at: nowIso(),
              };

              mockPlanState.rows.set(mapKey, next);
              upsertedRows.push(clone(next));
            }

            return {
              async select() {
                if (mockPlanState.failUpsert) {
                  return { data: null, error: { message: 'upsert_failed' } };
                }
                return { data: upsertedRows, error: null };
              },
            };
          },

          select() {
            const filters: Record<string, unknown> = {};
            const selectBuilder: {
              eq: (field: string, value: unknown) => typeof selectBuilder;
              maybeSingle: () => Promise<{ data: PlanRow | null; error: { message: string } | null }>;
              then: (onFulfilled: (value: { data: PlanRow[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
            } = {
              eq(field: string, value: unknown) {
                filters[field] = value;
                return selectBuilder;
              },
              async maybeSingle() {
                const rows = filterRows(filters);
                return { data: rows[0] ?? null, error: null };
              },
              then(onFulfilled, onRejected) {
                return Promise.resolve({ data: filterRows(filters), error: null }).then(onFulfilled, onRejected);
              },
            };
            return selectBuilder;
          },

          update(values: Partial<PlanRow>) {
            const filters: Record<string, unknown> = {};
            const updateBuilder = {
              eq(field: string, value: unknown) {
                filters[field] = value;
                return updateBuilder;
              },
              select() {
                return {
                  async maybeSingle() {
                    if (mockPlanState.failUpdate) {
                      return { data: null, error: { message: 'update_failed' } };
                    }
                    const rows = filterRows(filters);
                    if (rows.length === 0) {
                      return { data: null, error: null };
                    }
                    const target = rows[0];
                    const next: PlanRow = {
                      ...target,
                      ...values,
                      updated_at: nowIso(),
                    };
                    mockPlanState.rows.set(keyOf(next.session_id, next.day_index), clone(next));
                    return { data: clone(next), error: null };
                  },
                };
              },
            };
            return updateBuilder;
          },
        };
      },
    },
  };
});

import { POST as generatePlan } from '@/app/api/plan/generate/route';
import { POST as updatePlan } from '@/app/api/plan/update/route';
import { POST as regenerateDay } from '@/app/api/plan/regenerate-day/route';

function jsonPost(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const AI_TASKS = [
  '写下今日目标并推进核心任务',
  '整理关键资料并完成首个里程碑',
  '给队友发送同步消息确认分工',
  '复盘昨天卡点并产出修正步骤',
  '安排半小时专注时段完成难点',
  '检查进度并删除一项低优先任务',
  '总结本周收获并规划下周第一步',
];

describe('plan routes', () => {
  beforeEach(() => {
    mockPlanState.rows.clear();
    mockPlanState.failUpsert = false;
    mockPlanState.failUpdate = false;
    mockPlanState.idSeq = 1;
    createCompletionMock.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('生成成功：POST /api/plan/generate', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ tasks: AI_TASKS }) } }],
    });

    const response = await generatePlan(jsonPost('/api/plan/generate', { session_id: 'sess-a' }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.error).toBeNull();
    expect(payload.data.used_fallback).toBe(false);
    expect(payload.data.plans).toHaveLength(7);
    expect(payload.data.plans[0].status).toBe('todo');
    expect(mockPlanState.rows.size).toBe(7);
  });

  it('参数错误：缺 session_id / day_index 越界 / status 非法', async () => {
    const missingSession = await generatePlan(jsonPost('/api/plan/generate', {}) as never);
    const missingSessionPayload = await missingSession.json();
    expect(missingSession.status).toBe(400);
    expect(missingSessionPayload.success).toBe(false);
    expect(missingSessionPayload.error.code).toBe('INVALID_SESSION_ID');

    const outOfRangeDay = await regenerateDay(
      jsonPost('/api/plan/regenerate-day', { session_id: 'sess-a', day_index: 9 }) as never
    );
    const outOfRangePayload = await outOfRangeDay.json();
    expect(outOfRangeDay.status).toBe(400);
    expect(outOfRangePayload.success).toBe(false);
    expect(outOfRangePayload.error.code).toBe('INVALID_DAY_INDEX');

    const invalidStatus = await updatePlan(
      jsonPost('/api/plan/update', { session_id: 'sess-a', day_index: 1, status: 'blocked' }) as never
    );
    const invalidStatusPayload = await invalidStatus.json();
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatusPayload.success).toBe(false);
    expect(invalidStatusPayload.error.code).toBe('INVALID_STATUS');
  });

  it('状态流转：todo -> done / todo -> skipped', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ tasks: AI_TASKS }) } }],
    });
    await generatePlan(jsonPost('/api/plan/generate', { session_id: 'sess-flow' }) as never);

    const doneResponse = await updatePlan(
      jsonPost('/api/plan/update', { session_id: 'sess-flow', day_index: 1, status: 'done' }) as never
    );
    const donePayload = await doneResponse.json();
    expect(doneResponse.status).toBe(200);
    expect(donePayload.success).toBe(true);
    expect(donePayload.data.plan.status).toBe('done');

    const skippedResponse = await updatePlan(
      jsonPost('/api/plan/update', { session_id: 'sess-flow', day_index: 2, status: 'skipped' }) as never
    );
    const skippedPayload = await skippedResponse.json();
    expect(skippedResponse.status).toBe(200);
    expect(skippedPayload.success).toBe(true);
    expect(skippedPayload.data.plan.status).toBe('skipped');
  });

  it('AI 失败时 fallback 成功返回 used_fallback=true', async () => {
    createCompletionMock.mockRejectedValue(new Error('ai_failed'));

    const response = await generatePlan(
      jsonPost('/api/plan/generate', { session_id: 'sess-fallback', context: '我最近很拖延' }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.used_fallback).toBe(true);
    expect(payload.data.plans).toHaveLength(7);
    expect(payload.data.plans[0].task_text.length).toBeGreaterThanOrEqual(8);
    expect(payload.data.plans[0].task_text.length).toBeLessThanOrEqual(40);
  });
});

