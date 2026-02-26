import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PlanRow {
  session_id: string;
  day_index: number;
  task_text: string;
  status: 'todo' | 'done' | 'skipped';
  created_at: string;
}

const createCompletionMock = vi.hoisted(() => vi.fn());

const mockPlanState = vi.hoisted(() => ({
  rows: [] as PlanRow[],
  error: null as { message: string } | null,
}));

vi.mock('@/lib/openai', () => ({
  CHAT_MODEL: 'test-model',
  FALLBACK_MODEL: null,
  openai: {
    chat: {
      completions: {
        create: createCompletionMock,
      },
    },
  },
}));

vi.mock('@/lib/moderation', () => ({
  checkModeration: () => ({ isCrisis: false, crisisKeywordsFound: [] }),
  CRISIS_RESPONSE: 'crisis',
}));

vi.mock('@/lib/rag', () => ({
  retrieve: () => [],
  formatEvidence: () => '',
}));

vi.mock('@/lib/prompt', () => ({
  getSystemPrompt: () => 'system',
  getPromptVersion: () => 'test',
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
  getClientIP: () => 'test-ip',
}));

vi.mock('@/lib/recap', () => ({
  buildRecapFailureResponse: vi.fn(),
  buildRecapSuccessResponse: vi.fn(),
  generateRecapFromMessages: vi.fn(),
}));

vi.mock('@/lib/scenario', () => ({
  buildScenarioSystemPrompt: () => '',
  formatScenarioScript: () => '',
  normalizeScenario: (value: unknown) => (typeof value === 'string' ? value : null),
  parseScenarioModelOutput: () => ({ script: null, usedFallback: true }),
  trackScenarioResponseGenerated: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      if (table !== 'action_plans') {
        throw new Error(`Unexpected table: ${table}`);
      }

      const filters: { session_id?: string } = {};
      const query = {
        select() {
          return query;
        },
        eq(field: string, value: unknown) {
          if (field === 'session_id') filters.session_id = String(value);
          return query;
        },
        order() {
          return query;
        },
        limit(count: number) {
          if (mockPlanState.error) {
            return Promise.resolve({ data: null, error: mockPlanState.error });
          }

          const rows = mockPlanState.rows
            .filter((row) => !filters.session_id || row.session_id === filters.session_id)
            .sort((a, b) => a.day_index - b.day_index)
            .slice(0, count);

          return Promise.resolve({ data: rows, error: null });
        },
      };

      return query;
    },
  },
}));

import { POST as chatPost } from '@/app/api/chat/route';

interface ChatPayload {
  message: string;
  suggestions: string[];
}

function buildSevenDayPlans(sessionId: string): PlanRow[] {
  const createdAt = new Date().toISOString();
  return Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    return {
      session_id: sessionId,
      day_index: day,
      task_text: `任务 ${day}`,
      status: 'todo',
      created_at: createdAt,
    };
  });
}

async function postChat(body: unknown): Promise<{ status: number; payload: ChatPayload }> {
  const request = new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const response = await chatPost(request as never);
  const payload = await response.json() as ChatPayload;
  return { status: response.status, payload };
}

async function parseNDJSONMetaPayload(response: Response): Promise<ChatPayload> {
  const raw = await response.text();
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
  let payload: ChatPayload | null = null;
  for (const line of lines) {
    const parsed = JSON.parse(line) as { t?: string; message?: string; suggestions?: string[] };
    if (parsed.t === 'meta') {
      payload = {
        message: parsed.message ?? '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    }
  }
  if (!payload) {
    throw new Error('missing NDJSON meta payload');
  }
  return payload;
}

describe('chat route plan linkage', () => {
  beforeEach(() => {
    mockPlanState.rows = [];
    mockPlanState.error = null;
    createCompletionMock.mockReset();
  });

  it('chat 模式可直接回答指定天计划（第2天）', async () => {
    mockPlanState.rows = buildSevenDayPlans('sess-day-2');

    const { status, payload } = await postChat({
      mode: 'chat',
      session_id: 'sess-day-2',
      messages: [{ role: 'user', content: '第二天的计划呢？' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toContain('任务 2');
    expect(payload.suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('chat 模式可返回全部7天计划', async () => {
    mockPlanState.rows = buildSevenDayPlans('sess-all');

    const { status, payload } = await postChat({
      mode: 'chat',
      session_id: 'sess-all',
      messages: [{ role: 'user', content: '把7天计划全部发我' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toContain('任务 1');
    expect(payload.message).toContain('任务 7');
  });

  it('profile_other 模式也能联动回答计划问题', async () => {
    mockPlanState.rows = buildSevenDayPlans('sess-profile-mode');

    const { status, payload } = await postChat({
      mode: 'profile_other',
      session_id: 'sess-profile-mode',
      messages: [{ role: 'user', content: '明天任务是什么？' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toContain('任务 2');
  });

  it('无计划时不再返回伪动作按钮建议', async () => {
    const { status, payload } = await postChat({
      mode: 'chat',
      session_id: 'sess-empty',
      messages: [{ role: 'user', content: '第二天计划是什么？' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toMatch(/计划|生成/);
    expect(payload.suggestions).not.toContain('✨ 生成7天计划');
    expect(payload.suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('普通 chat 路径返回 NDJSON 流式响应', async () => {
    createCompletionMock.mockResolvedValue({
      controller: new AbortController(),
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: '我懂你现在有点乱。' } }] };
        yield { choices: [{ delta: { content: '\n【建议】先说最卡哪一步 | 我需要一个最小行动' } }] };
      },
    });

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'chat',
        session_id: 'sess-stream',
        messages: [{ role: 'user', content: '我最近有点迷茫，想找个方向' }],
      }),
    });
    const response = await chatPost(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const payload = await parseNDJSONMetaPayload(response);
    expect(payload.message.length).toBeGreaterThan(0);
    expect(payload.suggestions.length).toBeGreaterThanOrEqual(1);
  });
});

