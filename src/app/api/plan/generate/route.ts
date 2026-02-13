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
  const started = Date.now();

  try {
    const body = await request.json() as GeneratePlanBody;
    const sessionId = parseSessionId(body.session_id);
    if (!sessionId) {
      trackPlanEvent('plan_created', {
        day_index: 1,
        success: false,
        latency_ms: Date.now() - started,
        error_type: 'invalid_session_id',
      });
      return failure('INVALID_SESSION_ID', 'session_id 必填且长度不能超过 128', 400);
    }

    const generated = await generatePlanTasks({
      session_id: sessionId,
      context: normalizeContext(body.context),
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

    const { data, error } = await supabase
      .from('action_plans')
      .upsert(rowsToSave, { onConflict: 'session_id,day_index' })
      .select('*');

    if (error || !data) {
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

    return success({
      plans,
      used_fallback: usedFallback,
      today_index: computeTodayIndex(plans),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    trackPlanEvent('plan_created', {
      day_index: 1,
      success: false,
      latency_ms: Date.now() - started,
      error_type: 'unexpected_error',
    });
    return failure('INTERNAL_ERROR', `生成计划失败: ${message}`, 500);
  }
}

