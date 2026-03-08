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
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';

interface UpdatePlanBody {
  session_id?: unknown;
  day_index?: unknown;
  status?: unknown;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  try {
    // 限流
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(`plan-update:${clientIP}`, RATE_LIMITS.planMutate);
    if (!rateLimit.allowed) {
      return failure('RATE_LIMITED', '操作太频繁，请稍后再试', 429);
    }

    const parseStarted = Date.now();
    const body = await request.json() as UpdatePlanBody;
    const sessionId = parseSessionId(body.session_id);
    const dayIndex = parseDayIndex(body.day_index);
    const status = parseStatus(body.status);
    console.info(`[${requestId}] plan.update parsed`, {
      ms: Date.now() - parseStarted,
      session_id: sessionId,
      day_index: dayIndex,
      status,
    });

    if (!sessionId) {
      console.warn(`[${requestId}] plan.update invalid_session_id`);
      return failure('INVALID_SESSION_ID', 'session_id 必填且长度不能超过 128', 400);
    }
    if (!dayIndex) {
      console.warn(`[${requestId}] plan.update invalid_day_index`);
      return failure('INVALID_DAY_INDEX', 'day_index 必须是 1~7 的整数', 400);
    }
    if (!status) {
      console.warn(`[${requestId}] plan.update invalid_status`);
      return failure('INVALID_STATUS', 'status 必须是 todo/done/skipped', 400);
    }
    console.info(`[${requestId}] plan.update start`, {
      session_id: sessionId,
      day_index: dayIndex,
      status,
    });

    const dbStarted = Date.now();
    const { data, error } = await supabase
      .from('action_plans')
      .update({ status })
      .eq('session_id', sessionId)
      .eq('day_index', dayIndex)
      .select('*')
      .maybeSingle();
    console.info(`[${requestId}] plan.update db_done`, {
      ms: Date.now() - dbStarted,
      has_data: Boolean(data),
      has_error: Boolean(error),
    });

    const eventName = status === 'done'
      ? 'plan_day_done'
      : status === 'skipped'
        ? 'plan_day_skipped'
        : null;

    if (error) {
      console.error(`[${requestId}] plan.update db_error`, error);
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
      console.warn(`[${requestId}] plan.update plan_not_found`, {
        session_id: sessionId,
        day_index: dayIndex,
      });
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
    console.info(`[${requestId}] plan.update done`, {
      ms: Date.now() - started,
      day_index: dayIndex,
      status,
    });

    return success({ plan: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error(`[${requestId}] plan.update unexpected_error`, {
      ms: Date.now() - started,
      message,
    });
    return failure('INTERNAL_ERROR', '更新任务失败，请稍后再试', 500);
  }
}

