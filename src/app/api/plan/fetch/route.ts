import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ActionPlanRow } from '@/lib/supabase';
import { computeTodayIndex, failure, parseSessionId, sortPlansByDay, success } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const sessionId = parseSessionId(request.nextUrl.searchParams.get('session_id'));
    if (!sessionId) {
      return failure('INVALID_SESSION_ID', 'session_id 必填且长度不能超过 128', 400);
    }

    const { data, error } = await supabase
      .from('action_plans')
      .select('*')
      .eq('session_id', sessionId);

    if (error) {
      return failure('DB_ERROR', '读取计划失败，请稍后再试', 500);
    }

    const plans = sortPlansByDay((data ?? []) as ActionPlanRow[]);
    const todayIndex = computeTodayIndex(plans);
    const todayPlan = plans.find((plan) => plan.day_index === todayIndex) ?? null;

    return success({
      plans,
      today_index: todayIndex,
      today_plan: todayPlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return failure('INTERNAL_ERROR', `读取计划失败: ${message}`, 500);
  }
}

