import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ActionPlanRow } from '@/lib/supabase';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';
import { computeTodayIndex, failure, parseSessionId, sortPlansByDay, success } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  try {
    // 限流
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(`plan-fetch:${clientIP}`, RATE_LIMITS.planMutate);
    if (!rateLimit.allowed) {
      return failure('RATE_LIMITED', '请求太频繁，请稍后再试', 429);
    }

    const sessionId = parseSessionId(request.nextUrl.searchParams.get('session_id'));
    if (!sessionId) {
      console.warn(`[${requestId}] plan.fetch invalid_session_id`);
      return failure('INVALID_SESSION_ID', 'session_id 必填且长度不能超过 128', 400);
    }
    console.info(`[${requestId}] plan.fetch start`, { session_id: sessionId });

    const dbStartedAt = Date.now();
    const { data, error } = await supabase
      .from('action_plans')
      .select('id,session_id,day_index,task_text,status,created_at,updated_at')
      .eq('session_id', sessionId)
      .order('day_index', { ascending: true })
      .limit(7);
    console.info(`[${requestId}] plan.fetch db_done`, {
      ms: Date.now() - dbStartedAt,
      rows: Array.isArray(data) ? data.length : 0,
    });

    if (error) {
      console.error(`[${requestId}] plan.fetch db_error`, error);
      return failure('DB_ERROR', '读取计划失败，请稍后再试', 500);
    }

    const plans = sortPlansByDay((data ?? []) as ActionPlanRow[]);
    const todayIndex = computeTodayIndex(plans);
    const todayPlan = plans.find((plan) => plan.day_index === todayIndex) ?? null;

    console.info(`[${requestId}] plan.fetch done`, {
      ms: Date.now() - startedAt,
      today_index: todayIndex,
      has_today_plan: Boolean(todayPlan),
    });
    return success({
      plans,
      today_index: todayIndex,
      today_plan: todayPlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error(`[${requestId}] plan.fetch unexpected_error`, {
      ms: Date.now() - startedAt,
      message,
    });
    return failure('INTERNAL_ERROR', '读取计划失败，请稍后再试', 500);
  }
}

