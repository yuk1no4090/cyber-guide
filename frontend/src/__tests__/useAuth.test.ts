import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/app/hooks/useAuth';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as Response;
}

/**
 * Routes a stubbed fetch by URL so a test only has to describe the one endpoint
 * it cares about; everything else answers in a way that keeps the hook quiet.
 */
function stubFetchByUrl(routes: Record<string, Response | (() => Response)>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    for (const [fragment, response] of Object.entries(routes)) {
      if (url.includes(fragment)) {
        return typeof response === 'function' ? response() : response;
      }
    }
    return jsonResponse({ isLoggedIn: false });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('asks the backend whether a verification code is required', async () => {
    stubFetchByUrl({
      '/api/auth/config': jsonResponse({ success: true, data: { email_code_required: false } }),
    });

    const { result } = renderHook(() => useAuth('s-1'));

    await waitFor(() => {
      expect(result.current.emailCodeRequired).toBe(false);
    });
  });

  it('keeps requiring a code when the capability probe fails', async () => {
    // Showing a field the server does not need is recoverable; hiding one it does
    // need is not, so an unanswered probe must not relax the form.
    stubFetchByUrl({ '/api/auth/config': jsonResponse({}, 500) });

    const { result } = renderHook(() => useAuth('s-2'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.emailCodeRequired).toBe(true);
  });

  it('reports that no mail went out when the server says so', async () => {
    stubFetchByUrl({
      '/api/auth/config': jsonResponse({ success: true, data: { email_code_required: true } }),
      '/api/auth/email-code/send': jsonResponse({
        success: true,
        data: { sent: false, required: true, ttl_seconds: 0, cooldown_seconds: 0 },
      }),
    });

    const { result } = renderHook(() => useAuth('s-3'));
    await waitFor(() => {
      expect(result.current.emailCodeRequired).toBe(true);
    });

    const outcome = await result.current.sendRegisterCode('a@example.com');

    // The old endpoint hardcoded sent:true, which is what sent people off to
    // wait for a mail that was never generated.
    expect(outcome.sent).toBe(false);
  });

  it('surfaces the server error message when a code cannot be sent', async () => {
    stubFetchByUrl({
      '/api/auth/email-code/send': jsonResponse(
        { success: false, error: { message: 'too many requests' } },
        429
      ),
    });

    const { result } = renderHook(() => useAuth('s-4'));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(result.current.sendRegisterCode('a@example.com')).rejects.toThrow('too many requests');
  });

  it('starts logged out and stays logged out when /me says so', async () => {
    stubFetchByUrl({
      '/api/auth/config': jsonResponse({ success: true, data: { email_code_required: false } }),
      '/api/auth/me': jsonResponse({ success: true, data: { isLoggedIn: false } }),
    });

    const { result } = renderHook(() => useAuth('s-5'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
