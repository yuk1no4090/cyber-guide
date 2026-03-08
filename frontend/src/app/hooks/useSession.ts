'use client';

import { useState, useEffect } from 'react';

const SESSION_KEY = 'cyber-guide-session-id';
const DATA_OPT_IN_KEY = 'cyber-guide-data-opt-in';

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

export function useSession() {
  const [sessionId, setSessionId] = useState('');
  const [dataOptIn, setDataOptIn] = useState(false);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    setDataOptIn(loadDataOptIn());
  }, []);

  const toggleDataOptIn = () => {
    const next = !dataOptIn;
    setDataOptIn(next);
    saveDataOptIn(next);
  };

  return { sessionId, dataOptIn, toggleDataOptIn };
}
