'use client';

import { useState } from 'react';
import type { SidebarSessionItem } from '../components/Sidebar';
import type { EvidenceItem } from '../components/ChatMessage';
import { authFetch, unwrapEnvelope } from '@/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
  evidence?: EvidenceItem[];
}

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
  evidence?: EvidenceItem[];
}

const ACTIVE_SESSION_KEY = 'cyber-guide-active-session-id';

interface UseSidebarSessionsArgs {
  sessionId: string;
  isLoggedIn: boolean;
  setMessages: (messages: Message[]) => void;
  setMode: (mode: 'chat' | 'profile' | 'profile_other') => void;
  welcomeMessage: Message;
}

export function useSidebarSessions({
  sessionId,
  isLoggedIn,
  setMessages,
  setMode,
  welcomeMessage,
}: UseSidebarSessionsArgs) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<SidebarSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);

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
      const payload = unwrapEnvelope<{ messages: ApiMessage[] }>(raw);
      const mapped = Array.isArray(payload?.messages) ? payload.messages : [];
      if (mapped.length > 0) {
        setMessages(mapped.map((m) => ({
          role: m.role,
          content: m.content,
          isCrisis: m.isCrisis,
          evidence: Array.isArray(m.evidence) && m.evidence.length > 0 ? m.evidence : undefined,
        })));
      } else {
        setMessages([welcomeMessage]);
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
      const created = payload?.session;
      if (created?.id) {
        setSessions((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
        setSelectedSessionId(created.id);
        try { localStorage.setItem(ACTIVE_SESSION_KEY, created.id); } catch {}
        return created.id;
      }
    } catch {
      // ignore and fallback
    }
    return null;
  };

  const renameSession = async (id: string, title: string) => {
    if (!sessionId || !id) return;
    const normalized = title.trim();
    if (!normalized) return;
    await authFetch(sessionId, `/api/sessions/${id}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title: normalized }),
    }, 8_000);
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: normalized } : s)));
  };

  const deleteSession = async (id: string) => {
    if (!sessionId || !id) return;
    await authFetch(sessionId, `/api/sessions/${id}`, { method: 'DELETE' }, 8_000);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedSessionId === id) {
        const fallback = next[0]?.id ?? null;
        setSelectedSessionId(fallback);
        if (fallback) {
          void loadSessionMessages(fallback);
        } else {
          setMessages([welcomeMessage]);
          try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
        }
      }
      return next;
    });
  };

  return {
    sidebarOpen,
    setSidebarOpen,
    sessions,
    setSessions,
    selectedSessionId,
    setSelectedSessionId,
    isSessionLoading,
    loadSessions,
    loadSessionMessages,
    createSession,
    renameSession,
    deleteSession,
  };
}
