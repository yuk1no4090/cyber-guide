'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  authFetch,
  clearStoredAnonymousToken,
  clearToken,
  getStoredAnonymousToken,
  prepareAnonymousTokenForUpgrade,
  setToken,
  unwrapEnvelope,
} from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  nickname?: string;
  avatarUrl?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, emailCode: string, nickname?: string) => Promise<string | null>;
  sendRegisterCode: (email: string) => Promise<void>;
  loginWithGithub: () => void;
  logout: () => void;
  upgradeAnonymousSession: (anonymousToken?: string | null) => Promise<void>;
  refreshMe: () => Promise<void>;
}

type AuthResultPayload = {
  token: string;
  user: AuthUser;
};

export function useAuth(sessionId: string): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await authFetch(sessionId, '/api/auth/me', { method: 'GET' }, 8_000);
      const raw = await res.json();
      const payload = unwrapEnvelope<{ isLoggedIn: boolean; user?: AuthUser }>(raw);
      if (res.ok && payload?.isLoggedIn && payload.user) {
        setUser(payload.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token) {
      setToken(token, 'user');
      url.searchParams.delete('token');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) return;
    (async () => {
      setIsLoading(true);
      await refreshMe();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshMe]);

  const applyAuthResult = useCallback(async (path: string, body: Record<string, unknown>) => {
    const previousToken = prepareAnonymousTokenForUpgrade(sessionId);
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let raw: unknown = null;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      if (!res.ok) {
        throw new Error((text || '认证失败').slice(0, 200));
      }
      throw new Error('服务返回了非 JSON 响应');
    }
    const payload = unwrapEnvelope<AuthResultPayload>(raw);
    if (!res.ok || !payload?.token || !payload?.user) {
      throw new Error((raw as { error?: { message?: string } })?.error?.message || '认证失败');
    }
    setToken(payload.token, 'user');
    setUser(payload.user);
    return previousToken;
  }, [sessionId]);

  const login = useCallback(async (email: string, password: string) => {
    return applyAuthResult('/api/auth/login', { email, password });
  }, [applyAuthResult]);

  const register = useCallback(async (email: string, password: string, emailCode: string, nickname?: string) => {
    return applyAuthResult('/api/auth/register', { email, password, nickname, emailCode });
  }, [applyAuthResult]);

  const sendRegisterCode = useCallback(async (email: string) => {
    const res = await fetch('/api/auth/email-code/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const raw = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((raw as { error?: { message?: string } })?.error?.message || '验证码发送失败');
    }
  }, []);

  const loginWithGithub = useCallback(() => {
    if (typeof window === 'undefined') return;
    const redirect = `${window.location.origin}${window.location.pathname}`;
    window.location.href = `/api/auth/github?redirect_uri=${encodeURIComponent(redirect)}`;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    clearStoredAnonymousToken();
    setUser(null);
  }, []);

  const upgradeAnonymousSession = useCallback(async (anonymousToken?: string | null) => {
    if (!sessionId || !user) return;
    const candidateToken = anonymousToken || getStoredAnonymousToken(sessionId);
    if (!candidateToken) return;
    await authFetch(sessionId, '/api/auth/upgrade', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, anonymous_token: candidateToken }),
    }, 8_000);
    clearStoredAnonymousToken();
  }, [sessionId, user]);

  return useMemo(() => ({
    user,
    isLoggedIn: Boolean(user),
    isLoading,
    login,
    register,
    sendRegisterCode,
    loginWithGithub,
    logout,
    upgradeAnonymousSession,
    refreshMe,
  }), [user, isLoading, login, register, sendRegisterCode, loginWithGithub, logout, upgradeAnonymousSession, refreshMe]);
}
