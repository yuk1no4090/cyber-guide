import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PlanRow {
  session_id: string;
  day_index: number;
  task_text: string;
  status: 'todo' | 'done' | 'skipped';
  created_at: string;
}

const mockPlanState = vi.hoisted(() => ({
  rows: [] as PlanRow[],
  error: null as { message: string } | null,
}));

vi.mock('@/lib/openai', () => ({
  CHAT_MODEL: 'test-model',
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
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

describe('chat route plan linkage', () => {
  beforeEach(() => {
    mockPlanState.rows = [];
    mockPlanState.error = null;
  });

  it('chat 模式可直接回答指定天计划（第2天）', async () => {
    mockPlanState.rows = buildSevenDayPlans('sess-day-2');

    const { status, payload } = await postChat({
      mode: 'chat',
      session_id: 'sess-day-2',
      messages: [{ role: 'user', content: '第二天的计划呢？' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toContain('Day 2/7：任务 2');
    expect(payload.suggestions).toContain('明天任务是什么？');
  });

  it('chat 模式可返回全部7天计划', async () => {
    mockPlanState.rows = buildSevenDayPlans('sess-all');

    const { status, payload } = await postChat({
      mode: 'chat',
      session_id: 'sess-all',
      messages: [{ role: 'user', content: '把7天计划全部发我' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toContain('这是你当前的 7 天微行动计划');
    expect(payload.message).toContain('Day 1/7：任务 1');
    expect(payload.message).toContain('Day 7/7：任务 7');
  });

  it('profile_other 模式也能联动回答计划问题', async () => {
    mockPlanState.rows = buildSevenDayPlans('sess-profile-mode');

    const { status, payload } = await postChat({
      mode: 'profile_other',
      session_id: 'sess-profile-mode',
      messages: [{ role: 'user', content: '明天任务是什么？' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toContain('Day 2/7：任务 2');
  });

  it('无计划时不再返回伪动作按钮建议', async () => {
    const { status, payload } = await postChat({
      mode: 'chat',
      session_id: 'sess-empty',
      messages: [{ role: 'user', content: '第二天计划是什么？' }],
    });

    expect(status).toBe(200);
    expect(payload.message).toContain('你还没有生成 7 天计划');
    expect(payload.suggestions).not.toContain('✨ 生成7天计划');
    expect(payload.suggestions).toEqual(['我先说下最近卡点', '给我一个3步小行动']);
  });
});

