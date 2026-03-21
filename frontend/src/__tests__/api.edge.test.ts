import { authFetch, clearToken, fetchWithTimeout, getToken, isAbortError } from '@/lib/api';
import { beforeEach, vi } from 'vitest';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Headers(),
    clone: vi.fn(),
  } as unknown as Response;
}

describe('api edge cases', () => {
  beforeEach(() => {
    clearToken();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ── Network failures ──

  it('getToken throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(getToken('s-1')).rejects.toThrow('Failed to fetch');
  });

  it('getToken throws on non-200 auth response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({}, 500)));
    await expect(getToken('s-1')).rejects.toThrow('Auth failed: 500');
  });

  it('authFetch propagates network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(authFetch('s-1', '/api/chat')).rejects.toThrow('offline');
  });

  // ── Malformed server responses ──

  it('getToken handles server returning HTML instead of JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(getToken('s-1')).rejects.toThrow();
  });

  it('getToken handles server returning empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    // token is undefined → should still cache it (or at least not crash)
    const token = await getToken('s-1');
    expect(token).toBeUndefined();
  });

  // ── Timeout behavior ──

  it('fetchWithTimeout rejects after timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      (_input: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    ));

    await expect(fetchWithTimeout('/api/slow', {}, 50)).rejects.toThrow();
  });

  // ── Token deduplication ──

  it('concurrent getToken calls share one inflight request', async () => {
    let resolveAuth: (v: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise(r => { resolveAuth = r; }));
    vi.stubGlobal('fetch', fetchMock);

    const p1 = getToken('s-dup');
    const p2 = getToken('s-dup');

    resolveAuth!(mockResponse({ token: 'jwt-dedup', session_id: 's-dup', type: 'anonymous' }));

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('jwt-dedup');
    expect(t2).toBe('jwt-dedup');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── 401 retry clears stale token ──

  it('authFetch does NOT infinite-loop on persistent 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockResponse({ token: 'jwt-a' }))     // initial getToken
      .mockResolvedValueOnce(mockResponse({}, 401))                 // first request → 401
      .mockResolvedValueOnce(mockResponse({ token: 'jwt-b' }))     // retry getToken
      .mockResolvedValueOnce(mockResponse({}, 401));                // retry request → 401 again
    vi.stubGlobal('fetch', fetchMock);

    const response = await authFetch('s-loop', '/api/chat');
    // Should return the second 401 without looping forever
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  // ── isAbortError ──

  it('isAbortError correctly identifies AbortError', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError(new Error('normal'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('string')).toBe(false);
  });
});
