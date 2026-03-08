'use client';

import { useState, useEffect, useCallback } from 'react';

export type PlanStatus = 'todo' | 'done' | 'skipped';

export interface PlanItem {
  id?: string;
  session_id: string;
  day_index: number;
  task_text: string;
  status: PlanStatus;
  created_at?: string;
  updated_at?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error?: { code?: string; message?: string } | null;
}

const PLAN_CACHE_KEY_PREFIX = 'cyber-guide-plan-cache:';
const PLAN_FETCH_TIMEOUT_MS = 6_000;
const PLAN_GENERATE_TIMEOUT_MS = 12_000;
const PLAN_CONTEXT_MAX_CHARS = 500;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function unwrapEnvelope<T extends Record<string, unknown>>(raw: unknown): T {
  if (raw && typeof raw === 'object' && (raw as ApiEnvelope<T>).success === true && (raw as ApiEnvelope<T>).data) {
    return (raw as ApiEnvelope<T>).data as T;
  }
  return raw as T;
}

function loadPlanCache(sessionId: string): { plans: PlanItem[]; today_index: number; today_plan: PlanItem | null } | null {
  try {
    const raw = localStorage.getItem(`${PLAN_CACHE_KEY_PREFIX}${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const plans = (parsed as { plans?: unknown }).plans;
    const todayIndex = (parsed as { today_index?: unknown }).today_index;
    const todayPlan = (parsed as { today_plan?: unknown }).today_plan;
    if (!Array.isArray(plans) || typeof todayIndex !== 'number') return null;
    return { plans: plans as PlanItem[], today_index: todayIndex, today_plan: (todayPlan as PlanItem | null) ?? null };
  } catch {
    return null;
  }
}

function savePlanCache(
  sessionId: string,
  payload: { plans: PlanItem[]; today_index: number; today_plan: PlanItem | null }
) {
  try {
    localStorage.setItem(`${PLAN_CACHE_KEY_PREFIX}${sessionId}`, JSON.stringify({ ...payload, cached_at: Date.now() }));
  } catch {}
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
}

export function buildPlanContextFromChat(messages: Message[]): string {
  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content.trim()).filter(Boolean);
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

  const applyPlanData = useCallback((payload: { plans?: PlanItem[]; today_index?: number; today_plan?: PlanItem | null }) => {
    const nextPlans = payload.plans || [];
    const nextTodayIndex = payload.today_index || 1;
    const nextTodayPlan = payload.today_plan ?? nextPlans.find(plan => plan.day_index === nextTodayIndex) ?? null;
    setPlans(nextPlans);
    setTodayIndex(nextTodayIndex);
    setTodayPlan(nextTodayPlan);
  }, []);

  const fetchPlanData = useCallback(async (options?: { silent?: boolean; retryOnTimeout?: boolean }) => {
    if (!sessionId) return;
    const silent = options?.silent === true;
    const retryOnTimeout = options?.retryOnTimeout !== false;
    if (!silent) { setIsPlanLoading(true); setPlanError(null); }
    try {
      const response = await fetchWithTimeout(
        `/api/plan/fetch?session_id=${encodeURIComponent(sessionId)}`,
        { method: 'GET' },
        PLAN_FETCH_TIMEOUT_MS
      );
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plans: PlanItem[]; today_index: number; today_plan: PlanItem | null }>(raw);
      if (!response.ok || !payload) throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '读取计划失败');
      applyPlanData(payload);
      savePlanCache(sessionId, payload);
      setPlanError(null);
    } catch (error) {
      const aborted = isAbortError(error);
      const message = aborted ? '读取计划有点慢，先用当前数据，稍后会自动刷新。' : (error instanceof Error ? error.message : '读取计划失败');
      if (!silent) setPlanError(message);
      if (aborted && retryOnTimeout) {
        setTimeout(() => { fetchPlanData({ silent: true, retryOnTimeout: false }); }, 1200);
      }
    } finally {
      if (!silent) setIsPlanLoading(false);
    }
  }, [sessionId, applyPlanData]);

  const generatePlan = useCallback(async () => {
    if (!sessionId) return;
    setIsPlanActing(true);
    setPlanError(null);
    try {
      const context = buildPlanContextFromChat(messages);
      const response = await fetchWithTimeout('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, context }),
      }, PLAN_GENERATE_TIMEOUT_MS);
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plans: PlanItem[]; today_index: number }>(raw);
      if (!response.ok || !payload) throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '生成计划失败');
      applyPlanData(payload);
      savePlanCache(sessionId, {
        plans: payload.plans,
        today_index: payload.today_index,
        today_plan: payload.plans.find((p) => p.day_index === payload.today_index) ?? null,
      });
    } catch (error) {
      const message = isAbortError(error) ? '生成有点慢，已自动走快速策略。你可以稍后再点一次确认。' : (error instanceof Error ? error.message : '生成计划失败');
      setPlanError(message);
    } finally {
      setIsPlanActing(false);
    }
  }, [sessionId, messages, applyPlanData]);

  const updateTodayPlanStatus = useCallback(async (status: Extract<PlanStatus, 'done' | 'skipped'>) => {
    if (!sessionId || !todayPlan) return;
    setIsPlanActing(true);
    setPlanError(null);
    try {
      const response = await fetch('/api/plan/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, day_index: todayPlan.day_index, status }),
      });
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plan: PlanItem }>(raw);
      if (!response.ok || !payload?.plan) throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '更新任务状态失败');
      const nextPlan = payload.plan;
      setPlans((prev) => {
        const nextPlans = prev.map((p) => (p.day_index === nextPlan.day_index ? nextPlan : p));
        savePlanCache(sessionId, { plans: nextPlans, today_index: todayIndex, today_plan: nextPlan });
        return nextPlans;
      });
      setTodayPlan(nextPlan);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '更新任务状态失败');
    } finally {
      setIsPlanActing(false);
    }
  }, [sessionId, todayPlan, todayIndex]);

  const regenerateTodayPlan = useCallback(async () => {
    if (!sessionId || !todayPlan) return;
    setIsPlanActing(true);
    setPlanError(null);
    try {
      const context = buildPlanContextFromChat(messages);
      const response = await fetch('/api/plan/regenerate-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, day_index: todayPlan.day_index, context }),
      });
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plan: PlanItem }>(raw);
      if (!response.ok || !payload?.plan) throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '重生成任务失败');
      const nextPlan = payload.plan;
      setPlans((prev) => {
        const nextPlans = prev.map((p) => (p.day_index === nextPlan.day_index ? nextPlan : p));
        savePlanCache(sessionId, { plans: nextPlans, today_index: todayIndex, today_plan: nextPlan });
        return nextPlans;
      });
      setTodayPlan(nextPlan);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '重生成任务失败');
    } finally {
      setIsPlanActing(false);
    }
  }, [sessionId, todayPlan, todayIndex, messages]);

  // 初始化加载
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
