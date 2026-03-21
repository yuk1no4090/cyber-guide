/**
 * API client — all requests go through Next.js rewrite to Java backend.
 * Handles JWT token lifecycle (obtain, cache, inject into headers).
 */

const API_BASE = '';  // empty = same origin, Next.js rewrites /api/* to backend
const TOKEN_KEY = 'cyber-guide-jwt';
const TRACE_ID_HEADER = 'X-Trace-Id';

// ─── Token management ───

let tokenPromise: Promise<string> | null = null;
let cachedTraceId: string | null = null;

function getCachedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function cacheToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function setToken(token: string) {
  cacheToken(token);
}

export function getCachedTokenUnsafe(): string | null {
  return getCachedToken();
}

/**
 * Get a valid JWT token. Fetches from /api/auth/anonymous if not cached.
 * Deduplicates concurrent calls (only one fetch in-flight at a time).
 */
export async function getToken(sessionId: string): Promise<string> {
  const cached = getCachedToken();
  if (cached) return cached;

  if (!tokenPromise) {
    tokenPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort('token-timeout'), 8_000);
        const res = await fetch(`${API_BASE}/api/auth/anonymous`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
        const data = await res.json();
        const token = data.token as string;
        cacheToken(token);
        return token;
      } finally {
        tokenPromise = null;
      }
    })();
  }

  return tokenPromise;
}

/**
 * Clear cached token (e.g. on 401 to force re-auth).
 */
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  tokenPromise = null;
}

// ─── API helpers ───

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error?: { code?: string; message?: string } | null;
}

export function unwrapEnvelope<T extends Record<string, unknown>>(raw: unknown): T {
  if (raw && typeof raw === 'object' && (raw as ApiEnvelope<T>).success === true && (raw as ApiEnvelope<T>).data) {
    return (raw as ApiEnvelope<T>).data as T;
  }
  return raw as T;
}

/**
 * Build headers with JWT Authorization.
 */
export function authHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...extra,
  };
  if (cachedTraceId) {
    headers[TRACE_ID_HEADER] = cachedTraceId;
  }
  return headers;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const existingSignal = init.signal;
    // If caller already provided a signal, don't override it
    const signal = existingSignal || controller.signal;
    return await fetch(input, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Authenticated fetch — automatically injects JWT and handles 401 retry.
 * Timeout only applies to the actual HTTP request, not token acquisition.
 */
export async function authFetch(
  sessionId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  // Get token first (not counted in timeout)
  const token = await getToken(sessionId);
  const headers = {
    ...authHeaders(token),
    ...(init.headers as Record<string, string> || {}),
  };

  const res = await fetchWithTimeout(input, { ...init, headers }, timeoutMs);
  cachedTraceId = res.headers.get(TRACE_ID_HEADER) || cachedTraceId;

  // If 401/403, clear token and retry once
  if (res.status === 401 || res.status === 403) {
    clearToken();
    const newToken = await getToken(sessionId);
    const retryHeaders = {
      ...authHeaders(newToken),
      ...(init.headers as Record<string, string> || {}),
    };
    const retryRes = await fetchWithTimeout(input, { ...init, headers: retryHeaders }, timeoutMs);
    cachedTraceId = retryRes.headers.get(TRACE_ID_HEADER) || cachedTraceId;
    return retryRes;
  }

  return res;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
