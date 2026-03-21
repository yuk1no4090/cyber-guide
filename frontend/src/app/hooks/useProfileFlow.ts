'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { StructuredProfileData } from '../components/ProfileForm';
import type { SimilarCaseItem } from '../components/SimilarCasesCard';
import type { RelationshipScenario } from '@/lib/scenario';
import type { ChatMessageState } from './useChatFlow';
import { authFetch, unwrapEnvelope, type ApiEnvelope } from '@/lib/api';
import { pickN } from '@/lib/random';
import { trackScenarioResponseGenerated } from '@/lib/scenario';

function isNDJSONResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/x-ndjson');
}

async function readNDJSONStream<T extends { message?: string }>(
  response: Response,
  onDelta: (text: string) => void,
): Promise<T> {
  if (!response.body) throw new Error('流式响应不可读');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let meta: T | null = null;

  const processLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    const parsed = JSON.parse(line) as { t?: string; c?: string; message?: string };
    if (parsed.t === 'delta') {
      fullText += parsed.c || '';
      onDelta(parsed.c || '');
      return;
    }
    if (parsed.t === 'error') {
      throw new Error(parsed.message || '流式请求失败');
    }
    meta = parsed as unknown as T;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      processLine(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
      idx = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) processLine(buffer);

  if (meta) {
    if (typeof (meta as { message?: string }).message !== 'string') {
      (meta as { message?: string }).message = fullText;
    }
    return meta;
  }
  return { message: fullText } as T;
}

interface GenerateReportActionArgs {
  profileMessages: ChatMessageState[];
  mode: 'profile' | 'profile_other';
  selectedScenario: RelationshipScenario | null;
  sessionId: string;
  toApiMessages: (sourceMessages: ChatMessageState[]) => Array<{ role: 'user' | 'assistant'; content: string }>;
  setIsLoading: (v: boolean) => void;
  setReportContent: Dispatch<SetStateAction<string | null>>;
  setSuggestions: (v: string[]) => void;
}

export async function generateReportAction({
  profileMessages,
  mode,
  selectedScenario,
  sessionId,
  toApiMessages,
  setIsLoading,
  setReportContent,
  setSuggestions,
}: GenerateReportActionArgs): Promise<void> {
  const substantiveUserMsgs = profileMessages.filter(
    (m) => m.role === 'user' && m.content.length > 5
  );
  if (substantiveUserMsgs.length < 2) {
    setSuggestions(pickN(['我再多说几句吧', '好吧让我想想还有什么细节', '那我补充一下具体的事情', '我再描述具体一点', '让我想想 ta 最近做了什么', '我再说说 ta 平时的表现'], 2));
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
      if (!response.ok || !finalMessage) throw new Error('API request failed');
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
  } catch {
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
}

interface HandleProfileSubmitActionArgs {
  data: StructuredProfileData;
  isLoggedIn: boolean;
  sessionId: string;
  saveProfileToStorage: (profile: StructuredProfileData) => void;
  setStructuredProfile: (v: StructuredProfileData) => void;
  setShowProfileForm: (v: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
}

export async function handleProfileFormSubmitAction({
  data,
  isLoggedIn,
  sessionId,
  saveProfileToStorage,
  setStructuredProfile,
  setShowProfileForm,
  sendMessage,
}: HandleProfileSubmitActionArgs): Promise<void> {
  setStructuredProfile(data);
  saveProfileToStorage(data);
  if (isLoggedIn && sessionId) {
    void authFetch(sessionId, '/api/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }, 8_000);
  }
  setShowProfileForm(false);
  await sendMessage('请基于我的画像先给我一版建议：如果我还没想好，请分别给出读研和就业两条路径，并给出7天行动清单。');
}

export function useProfileFlow() {
  const [profileMessages, setProfileMessages] = useState<ChatMessageState[]>([]);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<RelationshipScenario | null>(null);
  const [structuredProfile, setStructuredProfile] = useState<StructuredProfileData | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [similarCases, setSimilarCases] = useState<SimilarCaseItem[]>([]);
  const [scenarioCopied, setScenarioCopied] = useState(false);

  return {
    profileMessages,
    setProfileMessages,
    reportContent,
    setReportContent,
    selectedScenario,
    setSelectedScenario,
    structuredProfile,
    setStructuredProfile,
    showProfileForm,
    setShowProfileForm,
    similarCases,
    setSimilarCases,
    scenarioCopied,
    setScenarioCopied,
  };
}
