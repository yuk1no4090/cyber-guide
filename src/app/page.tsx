'use client';

import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import TypingIndicator from './components/TypingIndicator';
import SuggestionChips from './components/SuggestionChips';
import ProfileReport from './components/ProfileReport';
import FeedbackCard from './components/FeedbackCard';
import RecapCard from './components/RecapCard';
import ScenarioPicker from './components/ScenarioPicker';
import { analytics } from '@/lib/analytics';
import { pickGroup, pickOne, pickN } from '@/lib/random';
import type { Recap } from '@/lib/recap';
import {
  type RelationshipScenario,
  trackScenarioResponseGenerated,
  trackScenarioScriptCopied,
} from '@/lib/scenario';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
}

type PlanStatus = 'todo' | 'done' | 'skipped';

interface PlanItem {
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
  error?: {
    code?: string;
    message?: string;
  } | null;
}

type AppMode = 'chat' | 'profile' | 'profile_other';

interface NDJSONDeltaLine {
  t: 'delta';
  c: string;
}

interface NDJSONMetaLine {
  t: 'meta';
  message?: string;
  suggestions?: string[];
  isCrisis?: boolean;
  isReport?: boolean;
  scenario?: string | null;
  promptVersion?: string;
  [key: string]: unknown;
}

interface NDJSONErrorLine {
  t: 'error';
  message: string;
}

type NDJSONLine = NDJSONDeltaLine | NDJSONMetaLine | NDJSONErrorLine;

const STORAGE_KEY = 'cyber-guide-chat';
const SESSION_KEY = 'cyber-guide-session-id';
const DATA_OPT_IN_KEY = 'cyber-guide-data-opt-in';
const PLAN_CACHE_KEY_PREFIX = 'cyber-guide-plan-cache:';
const PLAN_CONTEXT_MAX_CHARS = 500;
const PLAN_FETCH_TIMEOUT_MS = 6_000;
const PLAN_GENERATE_TIMEOUT_MS = 12_000;

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: '嘿 🛶\n\n我是小舟，CS 出身，水深水浅都趟过一些。迷茫过，焦虑过，到现在也没完全想明白，但一直在往前走。\n\n想聊点什么？随便说就行：',
};

const WELCOME_SUGGESTION_POOL = [
  '最近有点迷茫不知道该干嘛',
  '知道该努力但就是动不起来',
  '总觉得别人都比我强...',
  '有些事想找人聊聊',
  '每天都在焦虑但说不清为什么',
  '感觉自己一直在原地踏步',
  '不知道自己到底想要什么',
  '最近做什么都提不起劲',
  '有个选择一直在纠结',
  '想找个人吐槽一下',
  '觉得自己哪里都不够好',
  '对未来有点害怕',
];

function getWelcomeSuggestions(): string[] {
  return pickN(WELCOME_SUGGESTION_POOL, 4);
}

const PROFILE_CHOOSE: Message = {
  role: 'assistant',
  content: '想分析谁？我来帮你看看 🛶',
};

const PROFILE_CHOOSE_SUGGESTIONS = [
  '🙋 了解我自己',
  '👥 看懂身边的人',
];

const PROFILE_SELF_WELCOME: Message = {
  role: 'assistant',
  content: '好嘞，让我来认识一下你 🛶\n\n别紧张，就当朋友闲聊。随时可以点「生成画像」看分析结果。\n\n先聊聊——你现在是在读还是已经毕业了？学的什么专业呀？',
};

const PROFILE_SELF_SUGGESTION_POOL = [
  '刚上大学还在适应中',
  '大三了有点慌',
  '在读研，也不确定接下来',
  '已经工作了但想聊聊',
  '大二，专业不太喜欢',
  '快毕业了还没想好出路',
  '刚转专业到计算机',
  '工作两年了想换方向',
  '大一，什么都不懂',
  '研二了还在迷茫',
];

function getProfileSelfSuggestions(): string[] {
  return pickN(PROFILE_SELF_SUGGESTION_POOL, 4);
}

const PROFILE_OTHER_WELCOME: Message = {
  role: 'assistant',
  content: '有意思，我最喜欢帮人"读人"了 🔍\n\n你想分析谁？先告诉我：\n- ta 是你的什么人？（同学/室友/老师/同事/领导/朋友/家人）\n- 发生了什么事让你想了解 ta？',
};

const PROFILE_OTHER_SUGGESTION_POOL = [
  '室友有些行为我看不懂',
  '有个同事让我很头疼',
  '不知道领导到底在想什么',
  '有个朋友最近让我很困惑',
  '和一个人关系变得很微妙',
  '有人总是让我不舒服但说不清',
  '团队里有个人特别难搞',
  '家人的一些做法我不理解',
  '有个暧昧对象让我很纠结',
  '导师最近的态度让我摸不透',
];

function getProfileOtherSuggestions(): string[] {
  return pickN(PROFILE_OTHER_SUGGESTION_POOL, 4);
}

// ===== localStorage =====
function saveToStorage(messages: Message[]) {
  try {
    if (messages.length > 1) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  } catch {}
}

function loadFromStorage(): Message[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Message[];
      if (Array.isArray(parsed) && parsed.length > 1) return parsed;
    }
  } catch {}
  return null;
}

function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function loadDataOptIn(): boolean {
  try {
    return localStorage.getItem(DATA_OPT_IN_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveDataOptIn(value: boolean) {
  try {
    localStorage.setItem(DATA_OPT_IN_KEY, value ? 'true' : 'false');
  } catch {}
}

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing && existing.length <= 128) return existing;
    const generated = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

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

function buildPlanContextFromChat(messages: Message[]): string {
  const userMessages = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter(Boolean);

  const joined = userMessages.slice(-4).join('\n');
  if (!joined) return '';
  return joined.length > PLAN_CONTEXT_MAX_CHARS ? joined.slice(-PLAN_CONTEXT_MAX_CHARS) : joined;
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
    return {
      plans: plans as PlanItem[],
      today_index: todayIndex,
      today_plan: (todayPlan as PlanItem | null) ?? null,
    };
  } catch {
    return null;
  }
}

function savePlanCache(
  sessionId: string,
  payload: { plans: PlanItem[]; today_index: number; today_plan: PlanItem | null }
) {
  try {
    localStorage.setItem(
      `${PLAN_CACHE_KEY_PREFIX}${sessionId}`,
      JSON.stringify({ ...payload, cached_at: Date.now() })
    );
  } catch {}
}

function parsePlanQuery(text: string, todayIndex: number): { kind: 'all' } | { kind: 'day'; day_index: number } | null {
  const input = text.trim();
  if (!input) return null;

  // Avoid false positives: only handle messages that clearly ask about plan/task.
  if (!/(计划|任务)/.test(input)) return null;

  if (/(全部|所有|完整).*(计划|任务)/.test(input) || /(7天|七天).*(计划|任务)/.test(input)) {
    return { kind: 'all' };
  }

  const digitMatch = input.match(/第\s*(\d+)\s*天/);
  if (digitMatch) {
    const day = Number(digitMatch[1]);
    if (Number.isInteger(day)) return { kind: 'day', day_index: day };
  }

  const chineseMatch = input.match(/第\s*([一二三四五六七])\s*天/);
  if (chineseMatch) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 };
    const day = map[chineseMatch[1]];
    if (day) return { kind: 'day', day_index: day };
  }

  if (/今天/.test(input)) return { kind: 'day', day_index: todayIndex };
  if (/明天/.test(input)) return { kind: 'day', day_index: Math.min(7, todayIndex + 1) };
  if (/后天/.test(input)) return { kind: 'day', day_index: Math.min(7, todayIndex + 2) };

  return null;
}

function unwrapEnvelope<T extends Record<string, unknown>>(raw: unknown): T {
  if (
    raw
    && typeof raw === 'object'
    && (raw as ApiEnvelope<T>).success === true
    && (raw as ApiEnvelope<T>).data
  ) {
    return (raw as ApiEnvelope<T>).data as T;
  }

  return raw as T;
}

function isNDJSONResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/x-ndjson');
}

async function readNDJSONStream<T extends { message?: string }>(
  response: Response,
  onDelta: (text: string) => void,
): Promise<T> {
  if (!response.body) {
    throw new Error('流式响应不可读');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  const streamState: { meta: NDJSONMetaLine | null } = { meta: null };

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;
    let parsed: NDJSONLine;
    try {
      parsed = JSON.parse(line) as NDJSONLine;
    } catch {
      return;
    }

    if (parsed.t === 'delta') {
      fullText += parsed.c;
      onDelta(parsed.c);
      return;
    }

    if (parsed.t === 'error') {
      throw new Error(parsed.message || '流式请求失败');
    }

    streamState.meta = parsed;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      processLine(line);
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf('\n');
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    processLine(buffer);
  }

  if (streamState.meta) {
    if (typeof streamState.meta.message !== 'string') {
      streamState.meta.message = fullText;
    }
    return streamState.meta as unknown as T;
  }

  return { message: fullText } as unknown as T;
}

export default function Home() {
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [profileMessages, setProfileMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(() => getWelcomeSuggestions());
  const [chatSuggestionsBak, setChatSuggestionsBak] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [hadCrisis, setHadCrisis] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<RelationshipScenario | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [recapMeta, setRecapMeta] = useState<{ success?: boolean; latencyMs?: number; errorType?: string }>();
  const [isRecapLoading, setIsRecapLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [todayPlan, setTodayPlan] = useState<PlanItem | null>(null);
  const [todayIndex, setTodayIndex] = useState(1);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [isPlanActing, setIsPlanActing] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [scenarioCopied, setScenarioCopied] = useState(false);
  const [dataOptIn, setDataOptIn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      setMessages(saved);
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    setDataOptIn(loadDataOptIn());
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const cached = loadPlanCache(sessionId);
    if (cached?.plans?.length) {
      applyPlanData(cached);
      fetchPlanData({ silent: true });
      return;
    }
    fetchPlanData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 关闭/刷新页面时提醒（聊了足够多且没评价过）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const totalMsgs = messages.length + profileMessages.length;
      if (totalMsgs >= 5 && !feedbackDone) {
        e.preventDefault();
        // 现代浏览器会显示默认提示语
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [messages, profileMessages, feedbackDone]);

  useEffect(() => {
    if (mode === 'chat') saveToStorage(messages);
  }, [messages, mode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, profileMessages, isLoading, suggestions, reportContent]);

  const isProfileMode = mode === 'profile' || mode === 'profile_other';
  const currentMessages = mode === 'chat' ? messages : profileMessages;

  const toggleDataOptIn = () => {
    const next = !dataOptIn;
    setDataOptIn(next);
    saveDataOptIn(next);
  };

  const sendSessionMetrics = async (msgs: Message[], currentMode: AppMode) => {
    if (!dataOptIn || !sessionId) return;
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return;
    const avgLen = userMsgs.reduce((sum, m) => sum + m.content.length, 0) / userMsgs.length;
    const lastUserMsg = userMsgs[userMsgs.length - 1]?.content || '';
    const summary = lastUserMsg.length > 60 ? lastUserMsg.slice(0, 60) : lastUserMsg;
    try {
      await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          mode: currentMode,
          conversation_turns: Math.floor(msgs.length / 2),
          user_msg_count: userMsgs.length,
          avg_user_msg_length: Math.round(avgLen * 10) / 10,
          had_crisis: hadCrisis,
          summary,
        }),
      });
    } catch {}
  };

  const startNewChat = () => {
    // 如果聊了足够多且还没评价过，先弹出评价卡
    if (messages.length >= 5 && !feedbackDone && !showFeedback) {
      setPendingReset(true);
      setShowFeedback(true);
      return;
    }
    doResetChat();
  };

  const doResetChat = () => {
    sendSessionMetrics(messages, mode);
    clearStorage();
    setMessages([WELCOME_MESSAGE]);
    setSuggestions(getWelcomeSuggestions());
    setShowFeedback(false);
    setFeedbackDone(false);
    setHadCrisis(false);
    setPendingReset(false);
    setRecap(null);
    setRecapMeta(undefined);
    setSelectedScenario(null);
  };

  const startProfile = () => {
    setChatSuggestionsBak(suggestions);
    setMode('profile');
    setProfileMessages([PROFILE_CHOOSE]);
    setSuggestions(PROFILE_CHOOSE_SUGGESTIONS);
    setReportContent(null);
    setSelectedScenario(null);
  };

  const backToChat = () => {
    // 画像模式聊了足够多且没评价过，先弹评价
    if (profileMessages.length >= 5 && !feedbackDone && !showFeedback) {
      setShowFeedback(true);
      return;
    }
    doBackToChat();
  };

  const doBackToChat = () => {
    sendSessionMetrics(profileMessages, mode);
    setMode('chat');
    setSuggestions(chatSuggestionsBak.length > 0 ? chatSuggestionsBak : (messages.length <= 1 ? getWelcomeSuggestions() : []));
    setReportContent(null);
    setSelectedScenario(null);
  };

  const applyPlanData = (payload: { plans?: PlanItem[]; today_index?: number; today_plan?: PlanItem | null }) => {
    const nextPlans = payload.plans || [];
    const nextTodayIndex = payload.today_index || 1;
    const nextTodayPlan = payload.today_plan ?? nextPlans.find(plan => plan.day_index === nextTodayIndex) ?? null;
    setPlans(nextPlans);
    setTodayIndex(nextTodayIndex);
    setTodayPlan(nextTodayPlan);
  };

  const fetchPlanData = async (options?: { silent?: boolean; retryOnTimeout?: boolean }) => {
    if (!sessionId) return;
    const silent = options?.silent === true;
    const retryOnTimeout = options?.retryOnTimeout !== false;
    if (!silent) {
      setIsPlanLoading(true);
      setPlanError(null);
    }
    try {
      const response = await fetchWithTimeout(
        `/api/plan/fetch?session_id=${encodeURIComponent(sessionId)}`,
        { method: 'GET' },
        PLAN_FETCH_TIMEOUT_MS
      );
      const raw = await response.json();
      const payload = unwrapEnvelope<{
        plans: PlanItem[];
        today_index: number;
        today_plan: PlanItem | null;
      }>(raw);

      if (!response.ok || !payload) {
        throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '读取计划失败');
      }

      applyPlanData(payload);
      savePlanCache(sessionId, payload);
      setPlanError(null);
    } catch (error) {
      const aborted = isAbortError(error);
      const message = aborted
        ? '读取计划有点慢，先用当前数据，稍后会自动刷新。'
        : (error instanceof Error ? error.message : '读取计划失败');
      if (!silent) {
        setPlanError(message);
      }
      if (aborted && retryOnTimeout) {
        setTimeout(() => {
          fetchPlanData({ silent: true, retryOnTimeout: false });
        }, 1200);
      }
    } finally {
      if (!silent) setIsPlanLoading(false);
    }
  };

  const generatePlan = async () => {
    if (!sessionId) return;
    setIsPlanActing(true);
    setPlanError(null);
    try {
      const context = buildPlanContextFromChat(messages);
      const response = await fetchWithTimeout(
        '/api/plan/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            context,
          }),
        },
        PLAN_GENERATE_TIMEOUT_MS
      );
      const raw = await response.json();
      const payload = unwrapEnvelope<{
        plans: PlanItem[];
        today_index: number;
      }>(raw);

      if (!response.ok || !payload) {
        throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '生成计划失败');
      }

      applyPlanData(payload);
      savePlanCache(sessionId, {
        plans: payload.plans,
        today_index: payload.today_index,
        today_plan: payload.plans.find((plan) => plan.day_index === payload.today_index) ?? null,
      });
    } catch (error) {
      const message = isAbortError(error)
        ? '生成有点慢，已自动走快速策略。你可以稍后再点一次确认。'
        : (error instanceof Error ? error.message : '生成计划失败');
      setPlanError(message);
    } finally {
      setIsPlanActing(false);
    }
  };

  const updateTodayPlanStatus = async (status: Extract<PlanStatus, 'done' | 'skipped'>) => {
    if (!sessionId || !todayPlan) return;
    setIsPlanActing(true);
    setPlanError(null);
    try {
      const response = await fetch('/api/plan/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          day_index: todayPlan.day_index,
          status,
        }),
      });
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plan: PlanItem }>(raw);

      if (!response.ok || !payload?.plan) {
        throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '更新任务状态失败');
      }

      const nextPlan = payload.plan;
      setPlans((prev) => {
        const nextPlans = prev.map((plan) => (
          plan.day_index === nextPlan.day_index ? nextPlan : plan
        ));
        savePlanCache(sessionId, {
          plans: nextPlans,
          today_index: todayIndex,
          today_plan: nextPlan,
        });
        return nextPlans;
      });
      setTodayPlan(nextPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新任务状态失败';
      setPlanError(message);
    } finally {
      setIsPlanActing(false);
    }
  };

  const regenerateTodayPlan = async () => {
    if (!sessionId || !todayPlan) return;
    setIsPlanActing(true);
    setPlanError(null);
    try {
      const context = buildPlanContextFromChat(messages);
      const response = await fetch('/api/plan/regenerate-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          day_index: todayPlan.day_index,
          context,
        }),
      });
      const raw = await response.json();
      const payload = unwrapEnvelope<{ plan: PlanItem }>(raw);

      if (!response.ok || !payload?.plan) {
        throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '重生成任务失败');
      }

      const nextPlan = payload.plan;
      setPlans((prev) => {
        const nextPlans = prev.map((plan) => (
          plan.day_index === nextPlan.day_index ? nextPlan : plan
        ));
        savePlanCache(sessionId, {
          plans: nextPlans,
          today_index: todayIndex,
          today_plan: nextPlan,
        });
        return nextPlans;
      });
      setTodayPlan(nextPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : '重生成任务失败';
      setPlanError(message);
    } finally {
      setIsPlanActing(false);
    }
  };

  const maybeAnswerPlanQuestion = (content: string): string | null => {
    const query = parsePlanQuery(content, todayIndex);
    if (!query) return null;

    // 若本地计划尚未就绪，交给后端按 session_id 兜底查询，避免前端误判。
    if (isPlanLoading || plans.length === 0) return null;

    if (query.kind === 'all') {
      const lines = plans.map((plan) => `Day ${plan.day_index}/7：${plan.task_text}`);
      return `你的 7 天微行动计划是：\n${lines.join('\n')}`;
    }

    const dayIndex = query.day_index;
    if (dayIndex < 1 || dayIndex > 7) {
      return '我这套计划只有 1-7 天。你想问第几天？';
    }

    const plan = plans.find((item) => item.day_index === dayIndex);
    if (!plan) {
      return null;
    }

    const statusText = plan.status === 'done' ? '✅ 已完成' : plan.status === 'skipped' ? '⏭ 已跳过' : '🕒 待完成';
    return `Day ${plan.day_index}/7：${plan.task_text}\n状态：${statusText}\n如果你愿意，我也可以帮你把这个任务拆成更小的 2-3 步。`;
  };

  const generateRecap = async () => {
    const userTurnCount = messages.filter(m => m.role === 'user').length;
    if (userTurnCount < 2) return;

    const startedAt = Date.now();
    analytics.trackRecapGenerateClicked({
      success: true,
      latency_ms: 0,
      error_type: 'none',
    });

    setIsRecapLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          mode: 'generate_recap',
        }),
      });
      const raw = await response.json();
      const payload = unwrapEnvelope<{
        message: string;
        recap: Recap;
      }>(raw);

      if (!response.ok || !payload?.recap) {
        throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || '复盘生成失败');
      }

      setRecap(payload.recap);
      setRecapMeta({
        success: true,
        latencyMs: Date.now() - startedAt,
        errorType: 'none',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '复盘生成失败';
      setRecap(null);
      setRecapMeta({
        success: false,
        latencyMs: Date.now() - startedAt,
        errorType: message,
      });
      setSuggestions([message]);
    } finally {
      setIsRecapLoading(false);
    }
  };

  const copyLatestScenarioScript = async () => {
    if (!selectedScenario) return;
    const latestAssistant = [...profileMessages].reverse().find(m => m.role === 'assistant');
    if (!latestAssistant?.content) return;

    const startedAt = Date.now();
    try {
      await navigator.clipboard.writeText(latestAssistant.content);
      setScenarioCopied(true);
      trackScenarioScriptCopied(selectedScenario, {
        success: true,
        latency_ms: Date.now() - startedAt,
        error_type: 'none',
      });
      setTimeout(() => setScenarioCopied(false), 1500);
    } catch {
      trackScenarioScriptCopied(selectedScenario, {
        success: false,
        latency_ms: Date.now() - startedAt,
        error_type: 'clipboard_error',
      });
    }
  };

  const generateReport = async () => {
    // 检查用户是否提供了足够的实质性内容（至少 2 条超过 5 字的用户消息）
    const substantiveUserMsgs = profileMessages.filter(
      m => m.role === 'user' && m.content.length > 5
    );
    if (substantiveUserMsgs.length < 2) {
      setSuggestions(pickN([
        '我再多说几句吧',
        '好吧让我想想还有什么细节',
        '那我补充一下具体的事情',
        '我再描述具体一点',
        '让我想想 ta 最近做了什么',
        '我再说说 ta 平时的表现',
      ], 2));
      return;
    }
    setIsLoading(true);
    setReportContent(null);
    const startedAt = Date.now();
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: profileMessages.map(m => ({ role: m.role, content: m.content })),
          mode: mode === 'profile_other' ? 'generate_report_other' : 'generate_report',
          scenario: mode === 'profile_other' ? selectedScenario : null,
          session_id: sessionId || null,
        }),
      });
      let finalMessage = '';
      let nextSuggestions: string[] = [];

      if (isNDJSONResponse(response)) {
        setReportContent('');
        const data = await readNDJSONStream<{ message?: string; suggestions?: string[] }>(
          response,
          (delta) => {
            setReportContent((prev) => (prev ?? '') + delta);
          }
        );
        finalMessage = typeof data.message === 'string' ? data.message : '';
        nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        if (!response.ok || !finalMessage) {
          throw new Error('API request failed');
        }
      } else {
        const raw = await response.json();
        const data = unwrapEnvelope<{ message: string; suggestions?: string[] }>(raw);
        if (!response.ok || !data?.message) {
          throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || 'API request failed');
        }
        finalMessage = data.message;
        nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      }

      if (mode === 'profile_other' && selectedScenario) {
        trackScenarioResponseGenerated(selectedScenario, {
          success: true,
          latency_ms: Date.now() - startedAt,
          error_type: 'none',
        });
      }

      setReportContent(finalMessage);
      setSuggestions(nextSuggestions);
    } catch (error) {
      console.error('Failed to generate report:', error);
      if (mode === 'profile_other' && selectedScenario) {
        trackScenarioResponseGenerated(selectedScenario, {
          success: false,
          latency_ms: Date.now() - startedAt,
          error_type: 'api_error',
        });
      }
      setReportContent('抱歉，报告生成失败了。请稍后再试。');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('了解我自己')) {
      setSelectedScenario(null);
      setProfileMessages([PROFILE_SELF_WELCOME]);
      setSuggestions(getProfileSelfSuggestions());
      return;
    }
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('看懂身边的人')) {
      setMode('profile_other');
      setSelectedScenario(null);
      setProfileMessages([PROFILE_OTHER_WELCOME]);
      setSuggestions(getProfileOtherSuggestions());
      return;
    }
    if ((mode === 'profile' || mode === 'profile_other') && (content.includes('结束画像') || content.includes('生成画像') || content.includes('看看分析'))) {
      generateReport();
      return;
    }

    if (!isProfileMode) {
      const planAnswer = maybeAnswerPlanQuestion(content);
      if (planAnswer) {
        const userMessage: Message = { role: 'user', content };
        const updatedMessages = [...messages, userMessage];
        setRecap(null);
        setRecapMeta(undefined);
        setMessages([...updatedMessages, { role: 'assistant', content: planAnswer }]);
        setSuggestions([]);
        return;
      }
    }

    setSuggestions([]);
    const userMessage: Message = { role: 'user', content };
    const currentMsgs = isProfileMode ? profileMessages : messages;
    const updatedMessages = [...currentMsgs, userMessage];

    if (!isProfileMode) {
      setRecap(null);
      setRecapMeta(undefined);
    }

    if (isProfileMode) {
      setProfileMessages(updatedMessages);
    } else {
      setMessages(updatedMessages);
    }

    setIsLoading(true);
    const startedAt = Date.now();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          mode: mode === 'profile_other' ? 'profile_other' : mode,
          scenario: mode === 'profile_other' ? selectedScenario : null,
          session_id: sessionId || null,
        }),
      });
      const upsertAssistantMessage = (nextContent: string, isCrisis?: boolean) => {
        const updater = (prev: Message[]) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (!last || last.role !== 'assistant') {
            next.push({ role: 'assistant', content: nextContent, isCrisis });
            return next;
          }
          next[next.length - 1] = {
            ...last,
            content: nextContent,
            ...(typeof isCrisis === 'boolean' ? { isCrisis } : {}),
          };
          return next;
        };
        if (isProfileMode) setProfileMessages(updater);
        else setMessages(updater);
      };

      const isStream = isNDJSONResponse(response);
      let finalMessage = '';
      let nextSuggestions: string[] = [];
      let isCrisis = false;

      if (isStream) {
        let streamed = '';
        upsertAssistantMessage('');
        const data = await readNDJSONStream<{
          message?: string;
          suggestions?: string[];
          isCrisis?: boolean;
        }>(
          response,
          (delta) => {
            streamed += delta;
            upsertAssistantMessage(streamed);
          }
        );
        finalMessage = typeof data.message === 'string' && data.message.length > 0 ? data.message : streamed;
        nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        isCrisis = Boolean(data.isCrisis);
        if (!response.ok || !finalMessage) {
          throw new Error('API request failed');
        }
      } else {
        const raw = await response.json();
        const data = unwrapEnvelope<{
          message: string;
          suggestions?: string[];
          isCrisis?: boolean;
        }>(raw);
        if (!response.ok || !data?.message) {
          throw new Error((raw as ApiEnvelope<unknown>)?.error?.message || 'API request failed');
        }
        finalMessage = data.message;
        nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        isCrisis = Boolean(data.isCrisis);
      }

      if (isCrisis) setHadCrisis(true);

      if (mode === 'profile_other' && selectedScenario) {
        trackScenarioResponseGenerated(selectedScenario, {
          success: true,
          latency_ms: Date.now() - startedAt,
          error_type: 'none',
        });
      }

      upsertAssistantMessage(finalMessage, isCrisis);
      setSuggestions(nextSuggestions.length > 0 ? nextSuggestions : []);
    } catch (error) {
      console.error('Failed to send message:', error);
      if (mode === 'profile_other' && selectedScenario) {
        trackScenarioResponseGenerated(selectedScenario, {
          success: false,
          latency_ms: Date.now() - startedAt,
          error_type: 'api_error',
        });
      }
      const errorMsg: Message = {
        role: 'assistant',
        content: '抱歉，我这边出了点问题 😵 稍后再试试。',
      };
      if (isProfileMode) {
        setProfileMessages([...updatedMessages, errorMsg]);
      } else {
        setMessages([...updatedMessages, errorMsg]);
      }
      setSuggestions(pickN([
        '重新试试',
        '换个话题聊聊',
        '没事，我再发一次',
        '要不先聊别的',
        '稍等一下再试',
        '我换个说法试试',
      ], 2));
    } finally {
      setIsLoading(false);
    }
  };

  const submitFeedback = async (rating: number, feedback: string | null, saveChat: boolean) => {
    if (saveChat) {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content })),
          rating,
          feedback,
          hadCrisis,
          mode,
        }),
      });
    }
    setFeedbackDone(true);
    // 提交后自动跳转
    if (pendingReset || isProfileMode) {
      setTimeout(() => {
        if (pendingReset) doResetChat();
        else if (isProfileMode) doBackToChat();
      }, 1500);
    }
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    setFeedbackDone(true);
    if (pendingReset) doResetChat();
    else if (isProfileMode) doBackToChat();
  };

  const canShowFeedback = !isProfileMode && messages.length >= 9 && !showFeedback && !feedbackDone;
  const userTurnCount = messages.filter(m => m.role === 'user').length;
  const canGenerateRecap = mode === 'chat' && userTurnCount >= 2 && !isLoading && !isRecapLoading;
  const latestScenarioAssistantMessage = [...profileMessages]
    .reverse()
    .find(m => m.role === 'assistant' && m.content.trim().length > 0);

  return (
    <div className="chat-container flex flex-col h-screen h-[100dvh] max-w-3xl lg:max-w-4xl mx-auto relative">
      {/* ===== Header ===== */}
      <header className="glass safe-top sticky top-0 z-20 border-b border-slate-200/60">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative pulse-online w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-sky-400 via-blue-400 to-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <span className="text-base sm:text-lg">🛶</span>
            </div>
            <div>
              <h1 className="font-semibold text-[15px] sm:text-base text-slate-800 leading-tight tracking-tight">
                小舟 · Cyber Guide
              </h1>
              <p className="text-[11px] text-sky-500 leading-tight">
                {mode === 'chat' ? '在线 · 渡你过河的 CS 小船' : mode === 'profile_other' ? '🔍 读人模式' : '📋 画像分析模式'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!isProfileMode ? (
              <>
                {messages.length > 1 && (
                  <button
                    onClick={startNewChat}
                    className="px-2 py-1.5 text-[12px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    ✨ 新对话
                  </button>
                )}
                {canGenerateRecap && (
                  <button
                    onClick={generateRecap}
                    disabled={isRecapLoading}
                    className="px-2 py-1.5 text-[12px] text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors"
                  >
                    {isRecapLoading ? '生成中...' : '🧭 复盘卡'}
                  </button>
                )}
                <button
                  onClick={startProfile}
                  className="px-2 py-1.5 text-[12px] text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
                >
                  📋 画像
                </button>
                <button
                  onClick={toggleDataOptIn}
                  title={dataOptIn ? '已开启匿名指标记录（点击关闭）' : '已关闭匿名指标记录（点击开启）'}
                  className={`px-2 py-1.5 text-[12px] rounded-lg border transition-colors ${
                    dataOptIn
                      ? 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                      : 'text-slate-400 bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {dataOptIn ? '🔓 记录' : '🔒 记录'}
                </button>
              </>
            ) : (
              <div className="flex gap-1.5">
                {!reportContent && profileMessages.filter(m => m.role === 'user' && m.content.length > 5).length >= 2 && (
                  <button
                    onClick={generateReport}
                    disabled={isLoading}
                    className="px-2 py-1.5 text-[12px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                  >
                    ✨ 生成{mode === 'profile_other' ? '分析' : '画像'}
                  </button>
                )}
                <button
                  onClick={backToChat}
                  className="px-2 py-1.5 text-[12px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  返回聊天
                </button>
              </div>
            )}
          </div>
        </div>
        {showDisclaimer && !isProfileMode && (
          <div className="disclaimer-bar px-4 py-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] sm:text-xs text-amber-600/70 flex-1 text-center">
              <span className="mr-1">🛶</span>
              小舟是 AI 陪伴工具，分享的经验仅供参考，不替代专业咨询
            </p>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="text-amber-500/50 hover:text-amber-600 text-xs p-1 transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* ===== 消息区域 ===== */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-3 sm:px-5 lg:px-8 py-4 sm:py-6 space-y-1">
          {mode === 'chat' && (
            <section className="message-bubble flex justify-start mb-3">
              <div className="max-w-[95%] sm:max-w-[82%] rounded-2xl rounded-bl-sm overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-indigo-50 border border-indigo-200 rounded-t-2xl px-4 py-3">
                  <p className="text-[14px] font-semibold text-indigo-700">📅 7天微行动计划 · 今日任务</p>
                </div>
                <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3">
                  {isPlanLoading ? (
                    <p className="text-[13px] text-slate-500">正在读取你的今日任务...</p>
                  ) : todayPlan ? (
                    <div className="space-y-2">
                      <p className="text-[12px] text-slate-500">
                        Day {todayPlan.day_index}/7 · 当前状态：
                        {todayPlan.status === 'done'
                          ? ' ✅ 已完成'
                          : todayPlan.status === 'skipped'
                            ? ' ⏭ 已跳过'
                            : ' 🕒 待完成'}
                      </p>
                      <p className="text-[14px] text-slate-700 leading-relaxed break-words">
                        {todayPlan.task_text}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => updateTodayPlanStatus('done')}
                          disabled={isPlanActing || todayPlan.status === 'done'}
                          className="px-2.5 py-1.5 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                        >
                          ✅ 完成
                        </button>
                        <button
                          onClick={() => updateTodayPlanStatus('skipped')}
                          disabled={isPlanActing || todayPlan.status === 'skipped'}
                          className="px-2.5 py-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 transition-colors"
                        >
                          ⏭ 跳过
                        </button>
                        <button
                          onClick={regenerateTodayPlan}
                          disabled={isPlanActing}
                          className="px-2.5 py-1.5 text-[12px] text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-40 transition-colors"
                        >
                          🔄 重生成今天
                        </button>
                        {messages.some((m) => m.role === 'user' && m.content.trim().length > 0) && (
                          <button
                            onClick={() => {
                              if (confirm('会覆盖现有 7 天任务并重置状态，继续吗？')) generatePlan();
                            }}
                            disabled={isPlanActing}
                            className="px-2.5 py-1.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors"
                          >
                            ♻️ 重新生成7天
                          </button>
                        )}
                      </div>
                      {todayIndex < 7 && (
                        <div className="pt-2 border-t border-slate-200/60">
                          <p className="text-[12px] text-slate-500 mb-0.5">
                            明天（Day {todayIndex + 1}/7）
                          </p>
                          <p className="text-[13px] text-slate-700 leading-relaxed break-words">
                            {plans.find((plan) => plan.day_index === todayIndex + 1)?.task_text || '（还没生成/还在读取）'}
                          </p>
                        </div>
                      )}
                      {plans.length > 0 && (
                        <details className="pt-1">
                          <summary className="cursor-pointer select-none text-[12px] text-slate-500 hover:text-slate-700">
                            查看全部 7 天
                          </summary>
                          <div className="mt-2 space-y-1">
                            {plans.map((plan) => (
                              <div key={plan.day_index} className="text-[12px] text-slate-600 break-words">
                                <span className="font-semibold text-slate-700">Day {plan.day_index}/7</span>
                                <span className="ml-2">{plan.task_text}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[13px] text-slate-500">还没有你的 7 天计划，先生成一份吧。</p>
                      {messages.filter((m) => m.role === 'user').length === 0 && (
                        <p className="text-[12px] text-slate-400">
                          小提示：先聊两句再生成，任务会更贴合你现在的情况。
                        </p>
                      )}
                      <button
                        onClick={generatePlan}
                        disabled={isPlanActing || !sessionId}
                        className="px-3 py-1.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors"
                      >
                        {isPlanActing ? '生成中...' : '✨ 生成7天计划'}
                      </button>
                    </div>
                  )}
                  {planError && (
                    <p className="text-[12px] text-rose-500 mt-2">{planError}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {mode === 'profile_other' && !reportContent && (
            <div className="mb-2">
              <ScenarioPicker
                value={selectedScenario}
                onChange={setSelectedScenario}
                disabled={isLoading}
              />
              {selectedScenario && latestScenarioAssistantMessage && (
                <div className="flex justify-end mt-1">
                  <button
                    onClick={copyLatestScenarioScript}
                    className="px-2.5 py-1.5 text-[12px] text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
                  >
                    {scenarioCopied ? '✅ 已复制话术' : '📋 复制上一条话术'}
                  </button>
                </div>
              )}
            </div>
          )}

          {currentMessages.map((message, index) => (
            <ChatMessage
              key={`${mode}-${index}`}
              role={message.role}
              content={message.content}
              isCrisis={message.isCrisis}
            />
          ))}

          {isLoading && <TypingIndicator />}

          {reportContent && (
            <ProfileReport content={reportContent} onClose={backToChat} isOtherMode={mode === 'profile_other'} />
          )}

          {mode === 'chat' && recap && (
            <RecapCard
              recap={recap}
              generationMeta={recapMeta}
              onClose={() => setRecap(null)}
            />
          )}

          {showFeedback && !feedbackDone && (
            <FeedbackCard
              onSubmit={submitFeedback}
              onSkip={handleFeedbackSkip}
            />
          )}

          {!isLoading && !reportContent && !showFeedback && suggestions.length > 0 && (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={sendMessage}
              disabled={isLoading}
            />
          )}

          {canShowFeedback && !isLoading && (
            <div className="flex justify-center mt-3">
              <button
                onClick={() => setShowFeedback(true)}
                className="px-3 py-1.5 text-[12px] text-sky-500 bg-sky-50 border border-sky-200 rounded-full hover:bg-sky-100 hover:text-sky-600 transition-colors"
              >
                💬 聊完了？给我打个分吧
              </button>
            </div>
          )}

          <div ref={messagesEndRef} className="h-1" />
        </div>
      </main>

      {/* ===== 输入区域 ===== */}
      <footer className="glass safe-bottom sticky bottom-0 z-20 border-t border-slate-200/60">
        <div className="px-3 sm:px-5 lg:px-8 pt-3 pb-3">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading || isRecapLoading || !!reportContent}
          />
        </div>
      </footer>
    </div>
  );
}
