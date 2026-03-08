'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithTimeout, unwrapEnvelope, isAbortError, apiUrl } from '@/lib/api';

export type PlanStatus = 'todo' | 'done' | 'skipped';

export interface PlanItem {
  id?: string;
  session_id?: string;
  sessionId?: string;
  day_index?: number;
  dayIndex?: number;
  task_text?: string;
  taskText?: string;
  status: PlanStatus;
  created_at?: string;
  createdAt?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
}

const PLAN_CACHE_KEY_PREFIX = 'cyber-guide-plan-cache:';
const PLAN_FETCH_TIMEOUT_MS = 6_000;
const PLAN_GENERATE_TIMEOUT_MS = 12_000;
const PLAN_CONTEXT_MAX_CHARS = 500;

function normalizePlan(raw: Record<string, unknown>): PlanItem {
  return {
    id: (raw.id as string) ?? undefined,
    session_id: (raw.session_id ?? raw.sessionId) as string,
    day_index: (raw.day_index ?? raw.dayIndex) as number,
    task_text: (raw.task_text ?? raw.taskText) as string,
    status: (raw.status as PlanStatus) ?? 'todo',
    created_at: (raw.created_at ?? raw.createdAt) as string,
  };
}

function normalizePlans(arr: unknown[]): PlanItem[] {
  return arr.map(item => normalizePlan(item as Record<string, unknown>));
}

function loadPlanCache(sessionId: string) {
  try {
    const raw = localStorage.getItem(`${PLAN_CACHE_KEY_PREFIX}${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.plans || !Array.isArray(parsed.plans)) return null;
    return {
      plans: normalizePlans(parsed.plans),
      today_index: parsed.today_index as number,
      today_plan: parsed.today_plan ? normalizePlan(parsed.today_plan) : null,
    };
  } catch { return null; }
}

function savePlanCache(sessionId: string, payload: { plans: PlanItem[]; today_index: number; today_plan: PlanItem | null }) {
  try {
    localStorage.setItem(`${PLAN_CACHE_KEY_PREFIX}${sessionId}`, JSON.stringify({ ...payload, cached_at: Date.now() }));
  } catch {}
}

export function buildPlanContextFromChat(messages: Message[]): string {
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.trim()).filter(Boolean);
  const joined = userMessages.slice(-4).join('\n');
  if (!joined) return '';
  return joined.length > PLAN_CONTEXT_MAX_CHARS ? joined.slice(-PLAN_CONTEXT_MAX_CHARS) : joined;
}

export function usePlan(sessionId: string, messages: Message[]) {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [todayPlan, setTodayPlan] = useState<PlanItem | null>(null);
  const [todayIndex, setTodayIndex] = useState(1);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [isPlanActing, setIsPlanActing] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const applyPlanData = useCallback((payload: { plans?: PlanItem[] | unknown[]; today_index?: number; today_plan?: PlanItem | null }) => {
    const nextPlans = payload.plans ? normalizePlans(payload.plans as unknown[]) : [];
    const nextTodayIndex = payload.today_index || 1;
    const nextTodayPlan = payload.today_plan
      ? normalizePlan(payload.today_plan as unknown as Record<string, unknown>)
      : nextPlans.find(p => (p.day_index ?? p.dayIndex) === nextTodayIndex) ?? null;
    setPlans(nextPlans);
    setTodayIndex(nextTodayIndex);
    setTodayPlan(nextTodayPlan);
  }, []);

  const fetchPlanData = useCallback(async (options?: { silent?: boolean }) => {
    if (!sessionId) return;
    const silent = options?.silent === true;
    if (!silent) { setIsPlanLoading(true); setPlanError(null); }
    try {
      const response = await fetchWithTimeout(
        apiUrl(`/api/plan/fetch?session_id=${encodeURIComponent(sessionId)}`),
        { method: 'GET' },
        PLAN_FETCH_TIMEOUT_MS
      );
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plans: PlanItem[]; today_index: number; today_plan: PlanItem | null }>(raw);
      if (!response.ok || !payload) throw new Error('读取计划失败');
      applyPlanData(payload);
      savePlanCache(sessionId, payload);
    } catch (error) {
      if (!silent) setPlanError(isAbortError(error) ? '读取计划有点慢' : '读取计划失败');
    } finally {
      if (!silent) setIsPlanLoading(false);
    }
  }, [sessionId, applyPlanData]);

  const generatePlan = useCallback(async () => {
    if (!sessionId) return;
    setIsPlanActing(true); setPlanError(null);
    try {
      const context = buildPlanContextFromChat(messages);
      const response = await fetchWithTimeout(apiUrl('/api/plan/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, context }),
      }, PLAN_GENERATE_TIMEOUT_MS);
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plans: PlanItem[]; today_index: number }>(raw);
      if (!response.ok || !payload) throw new Error('生成计划失败');
      applyPlanData(payload);
    } catch (error) {
      setPlanError(isAbortError(error) ? '生成有点慢' : '生成计划失败');
    } finally { setIsPlanActing(false); }
  }, [sessionId, messages, applyPlanData]);

  const updateTodayPlanStatus = useCallback(async (status: 'done' | 'skipped') => {
    if (!sessionId || !todayPlan) return;
    setIsPlanActing(true); setPlanError(null);
    try {
      const dayIdx = todayPlan.day_index ?? todayPlan.dayIndex;
      const response = await fetch(apiUrl('/api/plan/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, day_index: dayIdx, status }),
      });
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plan: PlanItem }>(raw);
      if (!response.ok || !payload?.plan) throw new Error('更新失败');
      const nextPlan = normalizePlan(payload.plan as unknown as Record<string, unknown>);
      setPlans(prev => prev.map(p => ((p.day_index ?? p.dayIndex) === (nextPlan.day_index ?? nextPlan.dayIndex) ? nextPlan : p)));
      setTodayPlan(nextPlan);
    } catch (error) {
      setPlanError('更新任务状态失败');
    } finally { setIsPlanActing(false); }
  }, [sessionId, todayPlan]);

  const regenerateTodayPlan = useCallback(async () => {
    if (!sessionId || !todayPlan) return;
    setIsPlanActing(true); setPlanError(null);
    try {
      const context = buildPlanContextFromChat(messages);
      const dayIdx = todayPlan.day_index ?? todayPlan.dayIndex;
      const response = await fetch(apiUrl('/api/plan/regenerate-day'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, day_index: dayIdx, context }),
      });
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plan: PlanItem }>(raw);
      if (!response.ok || !payload?.plan) throw new Error('重生成失败');
      const nextPlan = normalizePlan(payload.plan as unknown as Record<string, unknown>);
      setPlans(prev => prev.map(p => ((p.day_index ?? p.dayIndex) === (nextPlan.day_index ?? nextPlan.dayIndex) ? nextPlan : p)));
      setTodayPlan(nextPlan);
    } catch (error) {
      setPlanError('重生成任务失败');
    } finally { setIsPlanActing(false); }
  }, [sessionId, todayPlan, messages]);

  useEffect(() => {
    if (!sessionId) return;
    const cached = loadPlanCache(sessionId);
    if (cached?.plans?.length) {
      applyPlanData(cached);
      fetchPlanData({ silent: true });
      return;
    }
    fetchPlanData();
  }, [sessionId, applyPlanData, fetchPlanData]);

  return {
    plans, todayPlan, todayIndex,
    isPlanLoading, isPlanActing, planError,
    generatePlan, updateTodayPlanStatus, regenerateTodayPlan, fetchPlanData,
  };
}
