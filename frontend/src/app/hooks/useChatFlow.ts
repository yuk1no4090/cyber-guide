'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Recap } from '@/lib/recap';
import type { EvidenceItem } from '../components/ChatMessage';
import type { SimilarCaseItem } from '../components/SimilarCasesCard';
import { authFetch, unwrapEnvelope, type ApiEnvelope } from '@/lib/api';
import { pickN } from '@/lib/random';
import { analytics } from '@/lib/analytics';
import { trackScenarioResponseGenerated, type RelationshipScenario } from '@/lib/scenario';

export interface ChatMessageState {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
  evidence?: EvidenceItem[];
}

export type AppMode = 'chat' | 'profile' | 'profile_other';

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
  evidence?: EvidenceItem[];
  [key: string]: unknown;
}

interface NDJSONErrorLine {
  t: 'error';
  message: string;
}

type NDJSONLine = NDJSONDeltaLine | NDJSONMetaLine | NDJSONErrorLine;

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
  if (buffer.trim()) processLine(buffer);

  if (streamState.meta) {
    if (typeof streamState.meta.message !== 'string') {
      streamState.meta.message = fullText;
    }
    return streamState.meta as unknown as T;
  }
  return { message: fullText } as unknown as T;
}

interface GenerateRecapActionArgs {
  sessionId: string;
  messages: ChatMessageState[];
  toApiMessages: (sourceMessages: ChatMessageState[]) => Array<{ role: 'user' | 'assistant'; content: string }>;
  setRecap: (v: Recap | null) => void;
  setRecapMeta: (v: { success?: boolean; latencyMs?: number; errorType?: string } | undefined) => void;
  setSuggestions: (v: string[]) => void;
  setIsRecapLoading: (v: boolean) => void;
}

export async function generateRecapAction({
  sessionId,
  messages,
  toApiMessages,
  setRecap,
  setRecapMeta,
  setSuggestions,
  setIsRecapLoading,
}: GenerateRecapActionArgs): Promise<void> {
  const userTurnCount = messages.filter((m) => m.role === 'user').length;
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
    const payload = unwrapEnvelope<{ message: string; recap: Recap }>(raw);
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
}

interface SendMessageActionArgs {
  content: string;
  mode: AppMode;
  isProfileMode: boolean;
  selectedScenario: RelationshipScenario | null;
  sessionId: string;
  isLoggedIn: boolean;
  selectedSessionId: string | null;
  createSession: () => Promise<string | null>;
  setSelectedSessionId: (id: string | null) => void;
  loadSessions: () => Promise<unknown>;
  messages: ChatMessageState[];
  profileMessages: ChatMessageState[];
  toApiMessages: (sourceMessages: ChatMessageState[]) => Array<{ role: 'user' | 'assistant'; content: string }>;
  setRecap: (v: Recap | null) => void;
  setRecapMeta: (v: { success?: boolean; latencyMs?: number; errorType?: string } | undefined) => void;
  setMessages: Dispatch<SetStateAction<ChatMessageState[]>>;
  setProfileMessages: Dispatch<SetStateAction<ChatMessageState[]>>;
  setSuggestions: (v: string[]) => void;
  setIsLoading: (v: boolean) => void;
  setHadCrisis: (v: boolean) => void;
  setSimilarCases: (v: SimilarCaseItem[]) => void;
  defaultProfileSuggestions: string[];
  defaultChatSuggestions: string[];
}

export async function sendMessageAction({
  content,
  mode,
  isProfileMode,
  selectedScenario,
  sessionId,
  isLoggedIn,
  selectedSessionId,
  createSession,
  setSelectedSessionId,
  loadSessions,
  messages,
  profileMessages,
  toApiMessages,
  setRecap,
  setRecapMeta,
  setMessages,
  setProfileMessages,
  setSuggestions,
  setIsLoading,
  setHadCrisis,
  setSimilarCases,
  defaultProfileSuggestions,
  defaultChatSuggestions,
}: SendMessageActionArgs): Promise<void> {
  let activePersistedSessionId = selectedSessionId;
  if (isLoggedIn && !activePersistedSessionId) {
    activePersistedSessionId = await createSession();
    if (activePersistedSessionId) {
      setSelectedSessionId(activePersistedSessionId);
    }
  }

  setSuggestions([]);
  const userMessage: ChatMessageState = { role: 'user', content };
  const currentMsgs = isProfileMode ? profileMessages : messages;
  const updatedMessages = [...currentMsgs, userMessage];

  if (!isProfileMode) {
    setRecap(null);
    setRecapMeta(undefined);
  }

  if (isProfileMode) setProfileMessages(updatedMessages);
  else setMessages(updatedMessages);

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

    const upsertAssistantMessage = (nextContent: string, isCrisis?: boolean, evidence?: EvidenceItem[]) => {
      const updater = (prev: ChatMessageState[]) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.role !== 'assistant') {
          next.push({ role: 'assistant', content: nextContent, isCrisis, evidence });
          return next;
        }
        next[next.length - 1] = {
          ...last,
          content: nextContent,
          ...(typeof isCrisis === 'boolean' ? { isCrisis } : {}),
          ...(Array.isArray(evidence) ? { evidence } : {}),
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
    let nextEvidence: EvidenceItem[] = [];

    if (isStream) {
      let streamed = '';
      let firstDelta = true;
      upsertAssistantMessage('');
      const data = await readNDJSONStream<{
        message?: string;
        suggestions?: string[];
        isCrisis?: boolean;
        similarCases?: SimilarCaseItem[];
        evidence?: EvidenceItem[];
      }>(
        response,
        (delta) => {
          if (firstDelta) {
            setIsLoading(false);
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => ({
              title: item.title || '相似案例',
              url: item.url,
              snippet: item.snippet,
              source: item.source,
              category: item.category,
              school: item.school ?? undefined,
              schoolTier: item.schoolTier ?? undefined,
              gpa: item.gpa ?? undefined,
              rankPct: item.rankPct ?? undefined,
              outcome: item.outcome ?? undefined,
              destSchool: item.destSchool ?? undefined,
            }))
        : [];
      nextEvidence = Array.isArray(data.evidence)
        ? data.evidence
            .filter((item) => item && typeof item === 'object')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => ({
              title: item.title,
              source: item.source,
              url: item.url,
              score: typeof item.score === 'number' ? item.score : undefined,
              tier: item.tier,
              school: item.school ?? undefined,
              schoolTier: item.schoolTier ?? undefined,
              gpa: item.gpa ?? undefined,
              rankPct: item.rankPct ?? undefined,
              outcome: item.outcome ?? undefined,
              destSchool: item.destSchool ?? undefined,
            }))
        : [];
      if (!response.ok || !finalMessage) throw new Error('API request failed');
      upsertAssistantMessage(finalMessage, isCrisis, nextEvidence);
    } else {
      const raw = await response.json();
      const data = unwrapEnvelope<{ message: string; suggestions?: string[]; isCrisis?: boolean }>(raw);
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
    if (!isStream) upsertAssistantMessage(finalMessage, isCrisis);

    if (nextSuggestions.length > 0) setSuggestions(nextSuggestions);
    else if (isProfileMode) setSuggestions(pickN(defaultProfileSuggestions, 2));
    else setSuggestions(pickN(defaultChatSuggestions, 3));

    setSimilarCases(nextSimilarCases.slice(0, 3));
    if (isLoggedIn) {
      await loadSessions();
    }
  } catch (error) {
    if (mode === 'profile_other' && selectedScenario) {
      trackScenarioResponseGenerated(selectedScenario, {
        success: false,
        latency_ms: Date.now() - startedAt,
        error_type: 'api_error',
      });
    }
    const errorMsg: ChatMessageState = {
      role: 'assistant',
      content: '抱歉，我这边出了点问题 😵 稍后再试试。',
    };
    if (isProfileMode) setProfileMessages([...updatedMessages, errorMsg]);
    else setMessages([...updatedMessages, errorMsg]);
    setSuggestions(pickN(['重新试试', '换个话题聊聊', '没事，我再发一次', '要不先聊别的', '稍等一下再试', '我换个说法试试'], 2));
    setSimilarCases([]);
  } finally {
    setIsLoading(false);
  }
}

interface SubmitFeedbackActionArgs {
  saveChat: boolean;
  sessionId: string;
  currentMessages: ChatMessageState[];
  rating: number;
  feedback: string | null;
  hadCrisis: boolean;
  mode: AppMode;
  setFeedbackDone: (v: boolean) => void;
  pendingReset: boolean;
  isProfileMode: boolean;
  doResetChat: () => void;
  doBackToChat: () => void;
}

export async function submitFeedbackAction({
  saveChat,
  sessionId,
  currentMessages,
  rating,
  feedback,
  hadCrisis,
  mode,
  setFeedbackDone,
  pendingReset,
  isProfileMode,
  doResetChat,
  doBackToChat,
}: SubmitFeedbackActionArgs): Promise<void> {
  if (saveChat) {
    await authFetch(sessionId, '/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        messages: currentMessages.map((m) => ({ role: m.role, content: m.content })),
        rating,
        feedback,
        hadCrisis,
        mode,
        session_id: sessionId,
      }),
    });
  }
  setFeedbackDone(true);
  if (pendingReset || isProfileMode) {
    setTimeout(() => {
      if (pendingReset) doResetChat();
      else if (isProfileMode) doBackToChat();
    }, 1500);
  }
}

export function useChatFlow(initialMessages: ChatMessageState[], initialSuggestions: string[]) {
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<ChatMessageState[]>(initialMessages);
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions);
  const [chatSuggestionsBak, setChatSuggestionsBak] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [hadCrisis, setHadCrisis] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [recapMeta, setRecapMeta] = useState<{ success?: boolean; latencyMs?: number; errorType?: string }>();
  const [isRecapLoading, setIsRecapLoading] = useState(false);

  return {
    mode,
    setMode,
    messages,
    setMessages,
    suggestions,
    setSuggestions,
    chatSuggestionsBak,
    setChatSuggestionsBak,
    isLoading,
    setIsLoading,
    showDisclaimer,
    setShowDisclaimer,
    showFeedback,
    setShowFeedback,
    feedbackDone,
    setFeedbackDone,
    hadCrisis,
    setHadCrisis,
    pendingReset,
    setPendingReset,
    recap,
    setRecap,
    recapMeta,
    setRecapMeta,
    isRecapLoading,
    setIsRecapLoading,
  };
}
