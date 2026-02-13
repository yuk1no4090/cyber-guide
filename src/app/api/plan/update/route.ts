import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  failure,
  parseDayIndex,
  parseSessionId,
  parseStatus,
  success,
  trackPlanEvent,
} from '../_shared';

export const runtime = 'nodejs';

interface UpdatePlanBody {
  session_id?: unknown;
  day_index?: unknown;
  status?: unknown;
}

export async function POST(request: NextRequest) {
  const started = Date.now();

  try {
    const body = await request.json() as UpdatePlanBody;
    const sessionId = parseSessionId(body.session_id);
    const dayIndex = parseDayIndex(body.day_index);
    const status = parseStatus(body.status);

    if (!sessionId) {
      return failure('INVALID_SESSION_ID', 'session_id 必填且长度不能超过 128', 400);
    }
    if (!dayIndex) {
      return failure('INVALID_DAY_INDEX', 'day_index 必须是 1~7 的整数', 400);
    }
    if (!status) {
      return failure('INVALID_STATUS', 'status 必须是 todo/done/skipped', 400);
    }

    const { data, error } = await supabase
      .from('action_plans')
      .update({ status })
      .eq('session_id', sessionId)
      .eq('day_index', dayIndex)
      .select('*')
      .maybeSingle();

    const eventName = status === 'done'
      ? 'plan_day_done'
      : status === 'skipped'
        ? 'plan_day_skipped'
        : null;

    if (error) {
      if (eventName) {
        trackPlanEvent(eventName, {
          day_index: dayIndex,
          success: false,
          latency_ms: Date.now() - started,
          error_type: 'db_error',
        });
      }
      return failure('DB_ERROR', '更新任务状态失败，请稍后再试', 500);
    }

    if (!data) {
      if (eventName) {
        trackPlanEvent(eventName, {
          day_index: dayIndex,
          success: false,
          latency_ms: Date.now() - started,
          error_type: 'plan_not_found',
        });
      }
      return failure('PLAN_NOT_FOUND', '未找到对应日期任务，请先生成 7 天计划', 404);
    }

    if (eventName) {
      trackPlanEvent(eventName, {
        day_index: dayIndex,
        success: true,
        latency_ms: Date.now() - started,
        error_type: 'none',
      });
    }

    return success({ plan: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return failure('INTERNAL_ERROR', `更新任务失败: ${message}`, 500);
  }
}

