import { authFetch, clearToken, getCachedTokenUnsafe, getToken } from '@/lib/api';
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

  it('authFetch clears stale token and retries once on 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({
        token: 'jwt-old',
        session_id: 's-3',
        type: 'anonymous',
      }))
      .mockResolvedValueOnce(mockJsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(mockJsonResponse({
        token: 'jwt-new',
        session_id: 's-3',
        type: 'anonymous',
      }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const response = await authFetch('s-3', '/api/chat', { method: 'POST', body: '{}' });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const firstApiHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    const secondApiHeaders = (fetchMock.mock.calls[3][1] as RequestInit).headers as Record<string, string>;
    expect(firstApiHeaders.Authorization).toBe('Bearer jwt-old');
    expect(secondApiHeaders.Authorization).toBe('Bearer jwt-new');
  });
});
