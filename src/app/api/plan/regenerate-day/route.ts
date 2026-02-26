import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ActionPlanRow } from '@/lib/supabase';
import {
  failure,
  parseDayIndex,
  parseSessionId,
  regenerateSingleDayTask,
  sanitizeTaskText,
  success,
  trackPlanEvent,
} from '../_shared';

export const runtime = 'nodejs';

interface RegenerateDayBody {
  session_id?: unknown;
  day_index?: unknown;
  context?: unknown;
}

function normalizeContext(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, 500) : undefined;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  try {
    const parseStarted = Date.now();
    const body = await request.json() as RegenerateDayBody;
    const sessionId = parseSessionId(body.session_id);
    const dayIndex = parseDayIndex(body.day_index);
    console.info(`[${requestId}] plan.regenerate parsed`, {
      ms: Date.now() - parseStarted,
      session_id: sessionId,
      day_index: dayIndex,
      has_context: Boolean(normalizeContext(body.context)),
    });

    if (!sessionId) {
      console.warn(`[${requestId}] plan.regenerate invalid_session_id`);
      trackPlanEvent('plan_regenerated', {
        day_index: 1,
        success: false,
        latency_ms: Date.now() - started,
        error_type: 'invalid_session_id',
      });
      return failure('INVALID_SESSION_ID', 'session_id 必填且长度不能超过 128', 400);
    }
    if (!dayIndex) {
      console.warn(`[${requestId}] plan.regenerate invalid_day_index`);
      trackPlanEvent('plan_regenerated', {
        day_index: 1,
        success: false,
        latency_ms: Date.now() - started,
        error_type: 'invalid_day_index',
      });
      return failure('INVALID_DAY_INDEX', 'day_index 必须是 1~7 的整数', 400);
    }
    console.info(`[${requestId}] plan.regenerate start`, {
      session_id: sessionId,
      day_index: dayIndex,
    });

    const aiStarted = Date.now();
    const regenerated = await regenerateSingleDayTask({
      session_id: sessionId,
      day_index: dayIndex,
      context: normalizeContext(body.context),
    });
    console.info(`[${requestId}] plan.regenerate ai_done`, {
      ms: Date.now() - aiStarted,
      used_fallback: regenerated.used_fallback,
      error_type: regenerated.error_type,
    });

    const sanitized = sanitizeTaskText(regenerated.task, dayIndex);
    const usedFallback = regenerated.used_fallback || sanitized.used_fallback;
    const errorType = regenerated.error_type !== 'none'
      ? regenerated.error_type
      : (usedFallback ? 'invalid_task_length' : 'none');

    const dbStarted = Date.now();
    const { data, error } = await supabase
      .from('action_plans')
      .upsert(
        {
          session_id: sessionId,
          day_index: dayIndex,
          task_text: sanitized.task_text,
          status: 'todo',
        },
        { onConflict: 'session_id,day_index' }
      )
      .select('*');
    console.info(`[${requestId}] plan.regenerate db_done`, {
      ms: Date.now() - dbStarted,
      rows: Array.isArray(data) ? data.length : 0,
    });

    if (error || !data || data.length === 0) {
      console.error(`[${requestId}] plan.regenerate db_error`, error);
      trackPlanEvent('plan_regenerated', {
        day_index: dayIndex,
        success: false,
        latency_ms: Date.now() - started,
        error_type: 'db_error',
      });
      return failure('DB_ERROR', '重生成当天任务失败，请稍后再试', 500);
    }

    const plan = (data as ActionPlanRow[]).find((item) => item.day_index === dayIndex) ?? (data[0] as ActionPlanRow);

    trackPlanEvent('plan_regenerated', {
      day_index: dayIndex,
      success: true,
      latency_ms: Date.now() - started,
      error_type: errorType,
    });
    console.info(`[${requestId}] plan.regenerate done`, {
      ms: Date.now() - started,
      day_index: dayIndex,
      used_fallback: usedFallback,
      error_type: errorType,
    });

    return success({
      plan,
      used_fallback: usedFallback,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error(`[${requestId}] plan.regenerate unexpected_error`, {
      ms: Date.now() - started,
      message,
    });
    trackPlanEvent('plan_regenerated', {
      day_index: 1,
      success: false,
      latency_ms: Date.now() - started,
      error_type: 'unexpected_error',
    });
    return failure('INTERNAL_ERROR', `重生成任务失败: ${message}`, 500);
  }
}

