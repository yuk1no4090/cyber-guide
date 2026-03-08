/**
 * API client — all requests go through Next.js rewrite to Java backend.
 */

const API_BASE = '';  // empty = same origin, Next.js rewrites /api/* to backend

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

export async function fetchWithTimeout(
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

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
