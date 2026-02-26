import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ActionPlanRow } from '@/lib/supabase';
import {
  computeTodayIndex,
  failure,
  generatePlanTasks,
  parseSessionId,
  sanitizeTaskText,
  sortPlansByDay,
  success,
  trackPlanEvent,
} from '../_shared';

export const runtime = 'nodejs';

interface GeneratePlanBody {
  session_id?: unknown;
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
    const body = await request.json() as GeneratePlanBody;
    const sessionId = parseSessionId(body.session_id);
    console.info(`[${requestId}] plan.generate parsed`, {
      ms: Date.now() - parseStarted,
      has_context: Boolean(normalizeContext(body.context)),
    });
    if (!sessionId) {
      console.warn(`[${requestId}] plan.generate invalid_session_id`);
      trackPlanEvent('plan_created', {
        day_index: 1,
        success: false,
        latency_ms: Date.now() - started,
        error_type: 'invalid_session_id',
      });
      return failure('INVALID_SESSION_ID', 'session_id 必填且长度不能超过 128', 400);
    }
    console.info(`[${requestId}] plan.generate start`, { session_id: sessionId });

    const aiStarted = Date.now();
    const generated = await generatePlanTasks({
      session_id: sessionId,
      context: normalizeContext(body.context),
    });
    console.info(`[${requestId}] plan.generate ai_done`, {
      ms: Date.now() - aiStarted,
      used_fallback: generated.used_fallback,
      error_type: generated.error_type,
    });

    let usedFallback = generated.used_fallback;
    const rowsToSave = generated.tasks.map((task, index) => {
      const dayIndex = index + 1;
      const sanitized = sanitizeTaskText(task, dayIndex);
      if (sanitized.used_fallback) usedFallback = true;
      return {
        session_id: sessionId,
        day_index: dayIndex,
        task_text: sanitized.task_text,
        status: 'todo' as const,
      };
    });

    const dbStarted = Date.now();
    const { data, error } = await supabase
      .from('action_plans')
      .upsert(rowsToSave, { onConflict: 'session_id,day_index' })
      .select('*');
    console.info(`[${requestId}] plan.generate db_done`, {
      ms: Date.now() - dbStarted,
      rows: Array.isArray(data) ? data.length : 0,
    });

    if (error || !data) {
      console.error(`[${requestId}] plan.generate db_error`, error);
      trackPlanEvent('plan_created', {
        day_index: 1,
        success: false,
        latency_ms: Date.now() - started,
        error_type: 'db_error',
      });
      return failure('DB_ERROR', '计划保存失败，请稍后再试', 500);
    }

    const plans = sortPlansByDay(data as ActionPlanRow[]);
    const errorType = generated.error_type !== 'none'
      ? generated.error_type
      : (usedFallback ? 'invalid_task_length' : 'none');

    trackPlanEvent('plan_created', {
      day_index: 1,
      success: true,
      latency_ms: Date.now() - started,
      error_type: errorType,
    });
    console.info(`[${requestId}] plan.generate done`, {
      ms: Date.now() - started,
      used_fallback: usedFallback,
      error_type: errorType,
    });

    return success({
      plans,
      used_fallback: usedFallback,
      today_index: computeTodayIndex(plans),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error(`[${requestId}] plan.generate unexpected_error`, {
      ms: Date.now() - started,
      message,
    });
    trackPlanEvent('plan_created', {
      day_index: 1,
      success: false,
      latency_ms: Date.now() - started,
      error_type: 'unexpected_error',
    });
    return failure('INTERNAL_ERROR', `生成计划失败: ${message}`, 500);
  }
}

