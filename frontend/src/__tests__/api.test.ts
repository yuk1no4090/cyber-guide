import {
  authFetch,
  clearStoredAnonymousToken,
  clearToken,
  getCachedTokenKindUnsafe,
  getCachedTokenUnsafe,
  getStoredAnonymousToken,
  getToken,
  setToken,
} from '@/lib/api';
import { beforeEach, vi } from 'vitest';

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('api auth utilities', () => {
  beforeEach(() => {
    clearToken();
    clearStoredAnonymousToken();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('getToken caches token to avoid duplicate auth requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({
      token: 'jwt-1',
      session_id: 's-1',
      type: 'anonymous',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const token1 = await getToken('s-1');
    const token2 = await getToken('s-1');

    expect(token1).toBe('jwt-1');
    expect(token2).toBe('jwt-1');
    expect(getCachedTokenUnsafe()).toBe('jwt-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('authFetch injects bearer token into request headers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({
        token: 'jwt-2',
        session_id: 's-2',
        type: 'anonymous',
      }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await authFetch('s-2', '/api/plan/fetch?session_id=s-2', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1];
    const options = secondCall[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-2');
  });

  it('getToken caches anonymous token for later upgrade', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({
      token: 'jwt-anon',
      session_id: 's-anon',
      type: 'anonymous',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const token = await getToken('s-anon');

    expect(token).toBe('jwt-anon');
    expect(getCachedTokenUnsafe()).toBe('jwt-anon');
    expect(getCachedTokenKindUnsafe()).toBe('anonymous');
    expect(getStoredAnonymousToken('s-anon')).toBe('jwt-anon');
  });

  it('setToken stores user token kind separately from anonymous token cache', () => {
    setToken('jwt-user', 'user');

    expect(getCachedTokenUnsafe()).toBe('jwt-user');
    expect(getCachedTokenKindUnsafe()).toBe('user');
    expect(getStoredAnonymousToken('s-anon')).toBeNull();
  });
});
