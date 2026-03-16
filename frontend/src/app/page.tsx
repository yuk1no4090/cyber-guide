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
import PlanCard from './components/PlanCard';
import ProfileForm, { type StructuredProfileData } from './components/ProfileForm';
import SimilarCasesCard, { type SimilarCaseItem } from './components/SimilarCasesCard';
import Sidebar, { type SidebarSessionItem } from './components/Sidebar';
import LoginModal from './components/LoginModal';
import { useSession } from './hooks/useSession';
import { usePlan } from './hooks/usePlan';
import { useAuth } from './hooks/useAuth';
import { analytics } from '@/lib/analytics';
import { authFetch, unwrapEnvelope, type ApiEnvelope } from '@/lib/api';
import { pickN } from '@/lib/random';
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
  similarCases?: SimilarCaseItem[];
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
const PROFILE_STORAGE_KEY = 'cyber-guide-profile';
const THEME_STORAGE_KEY = 'cyber-guide-theme';
const ACTIVE_SESSION_KEY = 'cyber-guide-active-session-id';
const PROFILE_DATA_PREFIX = '[PROFILE_DATA]';

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

const DEFAULT_WELCOME_SUGGESTIONS = WELCOME_SUGGESTION_POOL.slice(0, 4);
const DEFAULT_CHAT_FOLLOWUP_SUGGESTIONS = [
  '继续聊聊',
  '你能再具体一点吗？',
  '给我一个可执行计划',
  '换个角度分析一下',
];
const DEFAULT_PROFILE_FOLLOWUP_SUGGESTIONS = [
  '请结合我的背景再细化',
  '给我一版 7 天行动清单',
  '帮我比较读研和就业',
];

const PROFILE_CHOOSE: Message = {
  role: 'assistant',
  content: '想分析谁？我来帮你看看 🛶',
};

// ===== Action 标识符（suggestion chip 用前缀触发特定行为） =====
const ACTION_PREFIX = '__action:';
const ACTION_PROFILE_SELF = `${ACTION_PREFIX}profile_self`;
const ACTION_PROFILE_OTHER = `${ACTION_PREFIX}profile_other`;
const ACTION_GENERATE_REPORT = `${ACTION_PREFIX}generate_report`;

function isAction(text: string): boolean {
  return text.startsWith(ACTION_PREFIX);
}

const PROFILE_CHOOSE_SUGGESTIONS = [
  ACTION_PROFILE_SELF,
  ACTION_PROFILE_OTHER,
];

const PROFILE_SELF_WELCOME: Message = {
  role: 'assistant',
  content: '好嘞，让我来认识一下你 🛶\n\n别紧张，就当朋友闲聊。随时可以点「生成画像」看分析结果。\n\n先聊聊——你现在是在读还是已经毕业了？学的什么专业呀？',
};

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

function loadProfileFromStorage(): StructuredProfileData | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StructuredProfileData;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.school || !parsed.major || !parsed.stage || !parsed.intent) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveProfileToStorage(profile: StructuredProfileData) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

function sanitizeProfileValue(value: string): string {
  return (value || '').replace(/\|/g, '｜').replace(/=/g, '＝').trim();
}

function serializeProfileData(profile: StructuredProfileData): string {
  return `${PROFILE_DATA_PREFIX} ` +
    `school=${sanitizeProfileValue(profile.school)}|` +
    `major=${sanitizeProfileValue(profile.major)}|` +
    `stage=${sanitizeProfileValue(profile.stage)}|` +
    `intent=${sanitizeProfileValue(profile.intent)}|` +
    `gpa=${sanitizeProfileValue(profile.gpa)}|` +
    `internship=${sanitizeProfileValue(profile.internship)}|` +
    `research=${sanitizeProfileValue(profile.research)}|` +
    `competition=${sanitizeProfileValue(profile.competition)}`;
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
  const { sessionId, dataOptIn, toggleDataOptIn } = useSession();
  const {
    user,
    isLoggedIn,
    isLoading: authLoading,
    login,
    register,
    sendRegisterCode,
    loginWithGithub,
    logout,
    upgradeAnonymousSession,
  } = useAuth(sessionId);
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [profileMessages, setProfileMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_WELCOME_SUGGESTIONS);
  const [chatSuggestionsBak, setChatSuggestionsBak] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [hadCrisis, setHadCrisis] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<RelationshipScenario | null>(null);
  const [structuredProfile, setStructuredProfile] = useState<StructuredProfileData | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [similarCases, setSimilarCases] = useState<SimilarCaseItem[]>([]);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [recapMeta, setRecapMeta] = useState<{ success?: boolean; latencyMs?: number; errorType?: string }>();
  const [isRecapLoading, setIsRecapLoading] = useState(false);
  const [scenarioCopied, setScenarioCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [sessions, setSessions] = useState<SidebarSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    plans, todayPlan, todayIndex,
    isPlanLoading, isPlanActing, planError,
    generatePlan, updateTodayPlanStatus, regenerateTodayPlan,
  } = usePlan(sessionId, messages);

  useEffect(() => {
    setStructuredProfile(loadProfileFromStorage());
    // Refresh should always start a brand-new conversation.
    clearStorage();
    setSuggestions(getWelcomeSuggestions());
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') {
        setDarkMode(true);
      } else if (saved === 'light') {
        setDarkMode(false);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setDarkMode(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', darkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  const loadSessions = async (): Promise<SidebarSessionItem[]> => {
    if (!sessionId || !isLoggedIn) {
      setSessions([]);
      return [];
    }
    try {
      const res = await authFetch(sessionId, '/api/sessions?page=0&size=30', { method: 'GET' }, 8_000);
      const raw = await res.json();
      const payload = unwrapEnvelope<{ items: SidebarSessionItem[] }>(raw);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setSessions(items);
      return items;
    } catch {
      setSessions([]);
      return [];
    }
  };

  const loadSessionMessages = async (id: string) => {
    if (!sessionId || !id) return;
    setIsSessionLoading(true);
    try {
      const res = await authFetch(sessionId, `/api/sessions/${id}/messages`, { method: 'GET' }, 10_000);
      const raw = await res.json();
      const payload = unwrapEnvelope<{ messages: Array<{ role: 'user' | 'assistant'; content: string; isCrisis?: boolean }> }>(raw);
      const mapped = Array.isArray(payload?.messages) ? payload.messages : [];
      if (mapped.length > 0) {
        setMessages(mapped.map((m) => ({
          role: m.role,
          content: m.content,
          isCrisis: m.isCrisis,
        })));
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
      setMode('chat');
      setSelectedSessionId(id);
      try { localStorage.setItem(ACTIVE_SESSION_KEY, id); } catch {}
    } catch {
      // keep current messages
    } finally {
      setIsSessionLoading(false);
    }
  };

  const createSession = async (): Promise<string | null> => {
    if (!sessionId || !isLoggedIn) return null;
    try {
      const res = await authFetch(sessionId, '/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: '新对话', mode: 'chat', session_id: sessionId }),
      }, 8_000);
      const raw = await res.json();
      const payload = unwrapEnvelope<{ session: SidebarSessionItem }>(raw);
      if (payload?.session?.id) {
        const next = payload.session;
        setSessions((prev) => [next, ...prev.filter((s) => s.id !== next.id)]);
        setSelectedSessionId(next.id);
        try { localStorage.setItem(ACTIVE_SESSION_KEY, next.id); } catch {}
        return next.id;
      }
    } catch {
      // ignored
    }
    return null;
  };

  const renameSession = async (id: string, title: string) => {
    if (!sessionId || !isLoggedIn) return;
    await authFetch(sessionId, `/api/sessions/${id}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }, 8_000);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
  };

  const deleteSession = async (id: string) => {
    if (!sessionId || !isLoggedIn) return;
    await authFetch(sessionId, `/api/sessions/${id}`, { method: 'DELETE' }, 8_000);
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (selectedSessionId === id) {
      const fallback = remaining[0]?.id || null;
      setSelectedSessionId(fallback);
      if (fallback) {
        try { localStorage.setItem(ACTIVE_SESSION_KEY, fallback); } catch {}
        await loadSessionMessages(fallback);
      } else {
        try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
        setMessages([WELCOME_MESSAGE]);
      }
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    if (!isLoggedIn) {
      setSessions([]);
      setSelectedSessionId(null);
      try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
      return;
    }
    void (async () => {
      await upgradeAnonymousSession();
      const items = await loadSessions();
      const savedActiveId = (() => {
        try { return localStorage.getItem(ACTIVE_SESSION_KEY); } catch { return null; }
      })();
      const chosen = (savedActiveId && items.some((s) => s.id === savedActiveId))
        ? savedActiveId
        : items[0]?.id || null;
      if (chosen) {
        await loadSessionMessages(chosen);
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isLoggedIn]);

  useEffect(() => {
    if (!sessionId || !isLoggedIn) return;
    void (async () => {
      try {
        const res = await authFetch(sessionId, '/api/profile', { method: 'GET' }, 8_000);
        const raw = await res.json();
        const payload = unwrapEnvelope<{ profile: StructuredProfileData }>(raw);
        if (payload?.profile) {
          setStructuredProfile(payload.profile);
          saveProfileToStorage(payload.profile);
        }
      } catch {
        // ignore profile sync errors
      }
    })();
  }, [sessionId, isLoggedIn]);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, profileMessages, isLoading, suggestions, reportContent]);

  const isProfileMode = mode === 'profile' || mode === 'profile_other';
  const currentMessages = mode === 'chat' ? messages : profileMessages;

  const toApiMessages = (sourceMessages: Message[]) => {
    const payload = sourceMessages.map((m) => ({ role: m.role, content: m.content }));
    const profile = structuredProfile ?? loadProfileFromStorage();
    if (!profile) return payload;
    const serialized = serializeProfileData(profile);
    if (payload.some((m) => m.role === 'user' && m.content.startsWith(PROFILE_DATA_PREFIX))) {
      return payload;
    }
    return [{ role: 'user', content: serialized }, ...payload];
  };

  const sendSessionMetrics = async (msgs: Message[], currentMode: AppMode) => {
    if (!dataOptIn || !sessionId) return;
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return;
    const avgLen = userMsgs.reduce((sum, m) => sum + m.content.length, 0) / userMsgs.length;
    const lastUserMsg = userMsgs[userMsgs.length - 1]?.content || '';
    const summary = lastUserMsg.length > 60 ? lastUserMsg.slice(0, 60) : lastUserMsg;
    try {
      await authFetch(sessionId, '/api/metrics', {
        method: 'POST',
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
    setSimilarCases([]);
    if (isLoggedIn) {
      void createSession();
    } else {
      setSelectedSessionId(null);
    }
  };

  const startProfile = () => {
    setChatSuggestionsBak(suggestions);
    setMode('profile');
    setProfileMessages([PROFILE_CHOOSE]);
    setSuggestions(PROFILE_CHOOSE_SUGGESTIONS);
    setReportContent(null);
    setSelectedScenario(null);
    setShowProfileForm(false);
    setSimilarCases([]);
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
    setShowProfileForm(false);
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
      const response = await authFetch(sessionId, '/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: toApiMessages(messages),
          mode: 'generate_recap',
          session_id: sessionId,
        }),
      }, 30_000);
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
      const response = await authFetch(sessionId, '/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: toApiMessages(profileMessages),
          mode: mode === 'profile_other' ? 'generate_report_other' : 'generate_report',
          scenario: mode === 'profile_other' ? selectedScenario : null,
          session_id: sessionId || null,
        }),
      }, 30_000);
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

  const handleProfileFormSubmit = (data: StructuredProfileData) => {
    setStructuredProfile(data);
    saveProfileToStorage(data);
    if (isLoggedIn && sessionId) {
      void authFetch(sessionId, '/api/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }, 8_000);
    }
    setShowProfileForm(false);
    void sendMessage('请基于我的画像先给我一版建议：如果我还没想好，请分别给出读研和就业两条路径，并给出7天行动清单。');
  };

  const sendMessage = async (content: string) => {
    // ===== Action 路由（显式标识符，不依赖文本匹配） =====
    if (isAction(content)) {
      if (content === ACTION_PROFILE_SELF && mode === 'profile') {
        setSelectedScenario(null);
        setProfileMessages([PROFILE_SELF_WELCOME]);
        setShowProfileForm(true);
        setSuggestions([]);
        setSimilarCases([]);
        return;
      }
      if (content === ACTION_PROFILE_OTHER && mode === 'profile') {
        setMode('profile_other');
        setSelectedScenario(null);
        setProfileMessages([PROFILE_OTHER_WELCOME]);
        setSuggestions(getProfileOtherSuggestions());
        setShowProfileForm(false);
        setSimilarCases([]);
        return;
      }
      if (content === ACTION_GENERATE_REPORT && isProfileMode) {
        generateReport();
        return;
      }
      // 未知 action，忽略
      return;
    }

    // ===== 兼容旧文本匹配（用户手动输入的情况） =====
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('了解我自己')) {
      setSelectedScenario(null);
      setProfileMessages([PROFILE_SELF_WELCOME]);
      setShowProfileForm(true);
      setSuggestions([]);
      setSimilarCases([]);
      return;
    }
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('看懂身边的人')) {
      setMode('profile_other');
      setSelectedScenario(null);
      setProfileMessages([PROFILE_OTHER_WELCOME]);
      setSuggestions(getProfileOtherSuggestions());
      setShowProfileForm(false);
      setSimilarCases([]);
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

    let activePersistedSessionId = selectedSessionId;
    if (isLoggedIn && !activePersistedSessionId) {
      activePersistedSessionId = await createSession();
      if (activePersistedSessionId) {
        setSelectedSessionId(activePersistedSessionId);
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
      const response = await authFetch(sessionId, '/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          messages: toApiMessages(updatedMessages),
          mode: mode === 'profile_other' ? 'profile_other' : mode,
          scenario: mode === 'profile_other' ? selectedScenario : null,
          session_id: sessionId || null,
          chat_session_id: activePersistedSessionId || null,
        }),
      }, 30_000);
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
      let nextSimilarCases: SimilarCaseItem[] = [];

      if (isStream) {
        let streamed = '';
        let firstDelta = true;
        upsertAssistantMessage('');
        const data = await readNDJSONStream<{
          message?: string;
          suggestions?: string[];
          isCrisis?: boolean;
          similarCases?: SimilarCaseItem[];
        }>(
          response,
          (delta) => {
            if (firstDelta) {
              setIsLoading(false); // Hide typing indicator as soon as stream starts
              firstDelta = false;
            }
            streamed += delta;
            upsertAssistantMessage(streamed);
          }
        );
        finalMessage = typeof data.message === 'string' && data.message.length > 0 ? data.message : streamed;
        nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        isCrisis = Boolean(data.isCrisis);
        nextSimilarCases = Array.isArray(data.similarCases)
          ? data.similarCases
              .filter((item) => item && typeof item.url === 'string' && item.url.length > 0)
              .map((item) => ({
                title: item.title || '相似案例',
                url: item.url,
                snippet: item.snippet,
                source: item.source,
                category: item.category,
              }))
          : [];
        if (!response.ok || !finalMessage) {
          throw new Error('API request failed');
        }
        // Stream already built the assistant message via onDelta — just update crisis flag if needed
        if (isCrisis) {
          upsertAssistantMessage(finalMessage, true);
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

      // Only upsert for non-stream path; stream already built the message via onDelta
      if (!isStream) {
        upsertAssistantMessage(finalMessage, isCrisis);
      }
      if (nextSuggestions.length > 0) {
        setSuggestions(nextSuggestions);
      } else if (isProfileMode) {
        setSuggestions(pickN(DEFAULT_PROFILE_FOLLOWUP_SUGGESTIONS, 2));
      } else {
        setSuggestions(pickN(DEFAULT_CHAT_FOLLOWUP_SUGGESTIONS, 3));
      }
      setSimilarCases(nextSimilarCases.slice(0, 3));
      if (isLoggedIn) {
        void loadSessions();
      }
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
      setSimilarCases([]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitFeedback = async (rating: number, feedback: string | null, saveChat: boolean) => {
    if (saveChat) {
      await authFetch(sessionId, '/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content })),
          rating,
          feedback,
          hadCrisis,
          mode,
          session_id: sessionId,
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
    <>
      <div className="flex h-screen h-[100dvh] overflow-hidden">
        <aside
          className={`overflow-hidden transition-all duration-200 ease-out ${
            sidebarOpen ? 'flex-[1_1_0%] max-w-[300px]' : 'flex-[0_0_0px] max-w-0'
          }`}
        >
          <Sidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            darkMode={darkMode}
            user={user}
            onToggleDarkMode={() => setDarkMode((v) => !v)}
            onSelectSession={loadSessionMessages}
            onNewSession={doResetChat}
            onRenameSession={renameSession}
            onDeleteSession={deleteSession}
            onLoginClick={() => setShowLoginModal(true)}
            onLogout={logout}
          />
        </aside>
        <div className="cg-chat-shell chat-container flex flex-col h-screen h-[100dvh] flex-[3_1_0%] min-w-0 relative">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className={`absolute left-3 top-3 z-30 rounded-lg border px-2 py-1.5 text-xs shadow-sm backdrop-blur ${
              darkMode
                ? 'border-slate-700 bg-slate-900/90 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white/90 text-slate-700 hover:bg-slate-50'
            }`}
            aria-label="切换侧边栏"
          >
            ☰
          </button>
          {/* ===== Header ===== */}
          <header className="glass safe-top sticky top-0 z-20 border-b border-slate-200/60">
        <div className="pl-12 pr-4 sm:pl-14 sm:pr-6 py-3 flex items-center justify-between">
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
          <div className="flex items-center gap-2 overflow-x-auto">
            {!authLoading && !isLoggedIn && (
              <button
                onClick={() => setShowLoginModal(true)}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
              >
                登录
              </button>
            )}
            {!isProfileMode ? (
              <>
                {messages.length > 1 && (
                  <button
                    onClick={startNewChat}
                    className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    ✨ 新对话
                  </button>
                )}
                {canGenerateRecap && (
                  <button
                    onClick={generateRecap}
                    disabled={isRecapLoading}
                    className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors"
                  >
                    {isRecapLoading ? '生成中...' : '🧭 复盘卡'}
                  </button>
                )}
                <button
                  onClick={startProfile}
                  className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
                >
                  📋 画像
                </button>
                <button
                  onClick={toggleDataOptIn}
                  title={dataOptIn ? '已开启匿名指标记录（点击关闭）' : '已关闭匿名指标记录（点击开启）'}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
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
                  className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
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
          <main className="flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label="对话消息">
        <div className="px-3 sm:px-5 lg:px-8 py-4 sm:py-6 space-y-1">
          {isSessionLoading && (
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              正在加载会话内容...
            </div>
          )}
          {mode === 'chat' && (
            <PlanCard
              plans={plans}
              todayPlan={todayPlan}
              todayIndex={todayIndex}
              isPlanLoading={isPlanLoading}
              isPlanActing={isPlanActing}
              planError={planError}
              sessionId={sessionId}
              hasUserMessages={messages.some((m) => m.role === 'user' && m.content.trim().length > 0)}
              onUpdateStatus={updateTodayPlanStatus}
              onRegenerate={regenerateTodayPlan}
              onGeneratePlan={generatePlan}
            />
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

          {mode === 'profile' && showProfileForm && (
            <ProfileForm
              initialValue={structuredProfile ?? undefined}
              onSubmit={handleProfileFormSubmit}
            />
          )}

          {currentMessages.map((message, index) => (
            <ChatMessage
              key={`${mode}-${index}`}
              role={message.role}
              content={message.content}
              isCrisis={message.isCrisis}
            />
          ))}

          {!reportContent && similarCases.length > 0 && (
            <SimilarCasesCard cases={similarCases} />
          )}

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
            disabled={isLoading || isRecapLoading || !!reportContent || showProfileForm}
          />
        </div>
          </footer>
        </div>
      </div>
      <LoginModal
        open={showLoginModal}
        loading={authLoading}
        onClose={() => setShowLoginModal(false)}
        onLogin={async (email, password) => {
          const anonymousToken = await login(email, password);
          await upgradeAnonymousSession(anonymousToken);
          await loadSessions();
        }}
        onRegister={async (email, password, emailCode, nickname) => {
          const anonymousToken = await register(email, password, emailCode, nickname);
          await upgradeAnonymousSession(anonymousToken);
          await loadSessions();
        }}
        onSendCode={sendRegisterCode}
        onGithub={loginWithGithub}
      />
    </>
  );
}
