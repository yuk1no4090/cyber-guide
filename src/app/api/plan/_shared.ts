import { NextResponse } from 'next/server';
import { redact } from '@/lib/redact';
import { pickOne } from '@/lib/random';
import type { ActionPlanRow, ActionPlanStatus } from '@/lib/supabase';

export const PLAN_DAYS = 7;
export const TASK_MIN_LENGTH = 8;
export const TASK_MAX_LENGTH = 40;
export const PLAN_STATUSES: ActionPlanStatus[] = ['todo', 'done', 'skipped'];

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiFailureResponse {
  success: false;
  data: null;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse;

type PlanEventName =
  | 'plan_created'
  | 'plan_day_done'
  | 'plan_day_skipped'
  | 'plan_regenerated';

interface PlanEventPayload {
  day_index: number;
  success: boolean;
  latency_ms: number;
  error_type: string;
}

const FALLBACK_TASK_POOLS: Record<number, string[]> = {
  1: [
    '写下今天最重要的一件事并先做10分钟',
    '列出3件今天能做的小事并完成1件',
    '打开你一直拖着没做的那个任务看5分钟',
    '花10分钟把脑子里的事全写到纸上',
    '找出一件你今天能搞定的最小任务去做',
  ],
  2: [
    '整理一个最小任务清单并完成第一项',
    '把昨天没做完的事拆成3个更小的步骤',
    '删掉待办清单里3件不重要的事',
    '选一件拖了最久的事先做15分钟',
    '把明天要做的事提前列出来',
  ],
  3: [
    '给关键同学发一条确认信息推进事项',
    '找一个人聊聊你最近在做的事',
    '给你在意的那个项目/任务推进一步',
    '回复你一直没回的那条消息',
    '约一个你信任的人聊15分钟',
  ],
  4: [
    '复盘昨天卡点并写出一个改进动作',
    '写下这周最大的收获和最大的坑',
    '想想哪件事做了之后会让你轻松很多',
    '把让你焦虑的事写出来然后标出能控制的',
    '回顾前3天完成的任务给自己打个分',
  ],
  5: [
    '安排30分钟无打扰时段专注完成任务',
    '关掉手机通知做30分钟深度工作',
    '找一个安静的地方把手头的事做完',
    '给自己设个25分钟倒计时只做一件事',
    '选一件重要但不紧急的事投入半小时',
  ],
  6: [
    '检查进度并删掉一项不必要的任务',
    '看看这周的计划完成了多少做个标记',
    '砍掉一件其实不重要但一直占着位置的事',
    '给没完成的任务排个新的截止时间',
    '把做到一半的事情收个尾',
  ],
  7: [
    '总结本周收获并规划下周第一步',
    '写3句话总结这一周然后定下周第一件事',
    '回顾7天计划给自己一个真实评价',
    '把这周学到的一件事讲给自己听',
    '想好下周一早上要做的第一件事',
  ],
};

function clampDayIndex(dayIndex: number): number {
  return Math.max(1, Math.min(PLAN_DAYS, dayIndex));
}

function normalizeTaskText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function extractTaskCandidates(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const raw = fenced || normalized;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    if (parsed && typeof parsed === 'object') {
      const tasks = (parsed as { tasks?: unknown }).tasks;
      if (Array.isArray(tasks)) {
        return tasks.filter((item): item is string => typeof item === 'string');
      }
    }
  } catch {
    // 忽略 JSON 解析错误，降级到行解析
  }

  return normalized
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.、)\s]+/, '').trim())
    .filter(Boolean);
}

function buildSystemPrompt(expectedCount: number): string {
  return [
    '你是行动教练，请生成简洁、可执行、当天可完成的任务。',
    `请输出 ${expectedCount} 条任务，中文，每条 8-40 字。`,
    '禁止输出解释，只输出 JSON：{"tasks":["任务1","任务2"]}',
  ].join('\n');
}

function buildUserPrompt(sessionId: string, dayIndex?: number, context?: string): string {
  if (typeof dayIndex === 'number') {
    return [
      `session_id=${sessionId}`,
      `目标天数=第${dayIndex}天`,
      `用户上下文=${context?.trim() || '无'}`,
      '请只生成当天 1 条任务。',
    ].join('\n');
  }

  return [
    `session_id=${sessionId}`,
    `用户上下文=${context?.trim() || '无'}`,
    '请生成连续 7 天的微行动任务，逐天递进，难度适中。',
  ].join('\n');
}

function classifyAIError(error: unknown): string {
  const e = error as { code?: string; name?: string; status?: number; message?: string };
  if (e?.code === 'NO_API_KEY') return 'no_api_key';
  if (e?.code === 'DIRTY_FORMAT') return 'dirty_format';
  if (e?.name === 'AbortError') return 'ai_timeout';
  if (typeof e?.status === 'number' && e.status === 429) return 'rate_limited';
  if (typeof e?.message === 'string' && /timeout|timed out|超时/i.test(e.message)) return 'ai_timeout';
  return 'ai_error';
}

async function requestTasksFromAI(
  expectedCount: number,
  sessionId: string,
  context?: string,
  dayIndex?: number
): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) {
    const noKeyError = new Error('OPENAI_API_KEY is missing') as Error & { code?: string };
    noKeyError.code = 'NO_API_KEY';
    throw noKeyError;
  }

  const timeoutFromEnv = Number(process.env.PLAN_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
    ? Math.round(timeoutFromEnv)
    : (expectedCount === 1 ? 5_000 : 7_000);

  const { openai, CHAT_MODEL } = await import('@/lib/openai');
  const model = process.env.OPENAI_PLAN_MODEL || CHAT_MODEL;
  const completion = await openai.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(expectedCount) },
        { role: 'user', content: buildUserPrompt(sessionId, dayIndex, context) },
      ],
      temperature: 0.6,
      max_tokens: expectedCount === 1 ? 100 : 360,
    },
    {
      timeout: timeoutMs,
      // Plan routes are UX-sensitive; fail fast and fallback instead of retrying.
      maxRetries: 0,
    }
  );

  const content = completion.choices[0]?.message?.content?.trim() || '';
  const candidates = extractTaskCandidates(content);
  if (candidates.length < expectedCount) {
    const dirtyError = new Error('AI output format is invalid') as Error & { code?: string };
    dirtyError.code = 'DIRTY_FORMAT';
    throw dirtyError;
  }
  return candidates.slice(0, expectedCount);
}

export function isValidStatus(value: string): value is ActionPlanStatus {
  return PLAN_STATUSES.includes(value as ActionPlanStatus);
}

export function getFallbackTask(dayIndex: number): string {
  const safeDayIndex = clampDayIndex(dayIndex);
  return pickOne(FALLBACK_TASK_POOLS[safeDayIndex]);
}

export function getFallbackTasks(): string[] {
  return Array.from({ length: PLAN_DAYS }, (_, index) => getFallbackTask(index + 1));
}

export function sanitizeTaskText(raw: unknown, dayIndex: number): { task_text: string; used_fallback: boolean } {
  const fallback = redact(getFallbackTask(dayIndex));
  if (typeof raw !== 'string') {
    return { task_text: fallback, used_fallback: true };
  }

  const redacted = normalizeTaskText(redact(raw));
  if (redacted.length < TASK_MIN_LENGTH || redacted.length > TASK_MAX_LENGTH) {
    return { task_text: fallback, used_fallback: true };
  }

  return { task_text: redacted, used_fallback: false };
}

export async function generatePlanTasks(input: {
  session_id: string;
  context?: string;
}): Promise<{ tasks: string[]; used_fallback: boolean; error_type: string }> {
  try {
    const tasks = await requestTasksFromAI(PLAN_DAYS, input.session_id, input.context);
    return { tasks, used_fallback: false, error_type: 'none' };
  } catch (error) {
    return {
      tasks: getFallbackTasks(),
      used_fallback: true,
      error_type: classifyAIError(error),
    };
  }
}

export async function regenerateSingleDayTask(input: {
  session_id: string;
  day_index: number;
  context?: string;
}): Promise<{ task: string; used_fallback: boolean; error_type: string }> {
  try {
    const tasks = await requestTasksFromAI(1, input.session_id, input.context, input.day_index);
    return {
      task: tasks[0],
      used_fallback: false,
      error_type: 'none',
    };
  } catch (error) {
    return {
      task: getFallbackTask(input.day_index),
      used_fallback: true,
      error_type: classifyAIError(error),
    };
  }
}

export function parseSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const sessionId = value.trim();
  if (!sessionId || sessionId.length > 128) return null;
  return sessionId;
}

export function parseDayIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > PLAN_DAYS) return null;
  return value;
}

export function parseStatus(value: unknown): ActionPlanStatus | null {
  if (typeof value !== 'string') return null;
  return isValidStatus(value) ? value : null;
}

export function sortPlansByDay<T extends Pick<ActionPlanRow, 'day_index'>>(plans: T[]): T[] {
  return [...plans].sort((a, b) => a.day_index - b.day_index);
}

export function computeTodayIndex(plans: Array<Pick<ActionPlanRow, 'created_at' | 'day_index'>>): number {
  if (plans.length === 0) return 1;
  const sorted = sortPlansByDay(plans);
  const dayOne = sorted.find((item) => item.day_index === 1) || sorted[0];
  if (!dayOne.created_at) return 1;

  const startAt = Date.parse(dayOne.created_at);
  if (Number.isNaN(startAt)) return 1;

  const elapsedDays = Math.floor((Date.now() - startAt) / 86_400_000);
  return clampDayIndex(elapsedDays + 1);
}

export function success<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccessResponse<T>>(
    { success: true, data, error: null },
    { status }
  );
}

export function failure(code: string, message: string, status: number) {
  return NextResponse.json<ApiFailureResponse>(
    { success: false, data: null, error: { code, message } },
    { status }
  );
}

export function trackPlanEvent(event: PlanEventName, payload: PlanEventPayload): void {
  const latencyMs = Number.isFinite(payload.latency_ms) ? Math.max(0, Math.round(payload.latency_ms)) : 0;
  console.info('[analytics]', {
    event,
    payload: {
      day_index: payload.day_index,
      success: payload.success,
      latency_ms: latencyMs,
      error_type: payload.error_type || 'none',
    },
    timestamp: new Date().toISOString(),
  });
}

