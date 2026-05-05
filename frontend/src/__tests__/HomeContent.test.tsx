import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeContent from '@/app/HomeContent';

const mockAuthState = {
  user: { id: 'u-1', email: 'user@example.com', nickname: 'Tester' },
  isLoggedIn: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  sendRegisterCode: vi.fn(),
  loginWithGithub: vi.fn(),
  logout: vi.fn(),
  upgradeAnonymousSession: vi.fn().mockResolvedValue(undefined),
};

vi.mock('next/dynamic', () => ({
  default: (loader: unknown) => loader,
}));

vi.mock('@/app/hooks/useSession', () => ({
  useSession: () => ({
    sessionId: 'session-1',
    dataOptIn: false,
    toggleDataOptIn: vi.fn(),
  }),
}));

vi.mock('@/app/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/app/hooks/usePlan', () => ({
  usePlan: () => ({
    plans: [],
    todayPlan: null,
    todayIndex: 1,
    isPlanLoading: false,
    isPlanActing: false,
    planError: null,
    generatePlan: vi.fn(),
    updateTodayPlanStatus: vi.fn(),
    regenerateTodayPlan: vi.fn(),
  }),
}));

vi.mock('@/app/hooks/useTheme', () => ({
  useTheme: () => ({
    darkMode: false,
    toggleDarkMode: vi.fn(),
  }),
}));

const loadSessionMessages = vi.fn().mockImplementation(async () => undefined);
const loadSessions = vi.fn().mockResolvedValue([{ id: 'chat-1', title: '已保存会话', mode: 'chat' }]);

vi.mock('@/app/hooks/useSidebarSessions', () => ({
  useSidebarSessions: ({ setMessages, setMode }: { setMessages: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => void; setMode: (mode: 'chat' | 'profile' | 'profile_other') => void }) => {
    loadSessionMessages.mockImplementation(async () => {
      setMode('chat');
      setMessages([
        { role: 'assistant', content: '已登录会话内容' },
        { role: 'user', content: '我的隐私消息' },
      ]);
    });
    return {
      sidebarOpen: false,
      setSidebarOpen: vi.fn(),
      sessions: [{ id: 'chat-1', title: '已保存会话', mode: 'chat' }],
      setSessions: vi.fn(),
      selectedSessionId: 'chat-1',
      setSelectedSessionId: vi.fn(),
      isSessionLoading: false,
      loadSessions,
      loadSessionMessages,
      createSession: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
    };
  },
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    authFetch: vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
      headers: new Headers(),
      status: 200,
    }),
    unwrapEnvelope: (raw: unknown) => {
      if (raw && typeof raw === 'object' && 'success' in (raw as Record<string, unknown>)) {
        return ((raw as { data?: unknown }).data ?? {}) as Record<string, unknown>;
      }
      return (raw ?? {}) as Record<string, unknown>;
    },
  };
});

describe('HomeContent auth/session behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState.isLoggedIn = true;
    mockAuthState.user = { id: 'u-1', email: 'user@example.com', nickname: 'Tester' };
  });

  it('clears visible private session content after logout', async () => {
    const { rerender } = render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText('我的隐私消息')).toBeInTheDocument();
    });

    mockAuthState.isLoggedIn = false;
    mockAuthState.user = null;
    rerender(<HomeContent />);

    await waitFor(() => {
      expect(screen.queryByText('我的隐私消息')).not.toBeInTheDocument();
    });
    expect(screen.getByText('开始你的规划工作台')).toBeInTheDocument();
  });

  it('tries to upgrade anonymous session on logged-in load', async () => {
    render(<HomeContent />);

    await waitFor(() => {
      expect(mockAuthState.upgradeAnonymousSession).toHaveBeenCalled();
    });
  });

  it('resets to welcome view when starting a new chat', async () => {
    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText('我的隐私消息')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '新对话' }));

    await waitFor(() => {
      expect(screen.queryByText('我的隐私消息')).not.toBeInTheDocument();
    });
    expect(screen.getByText('开始你的规划工作台')).toBeInTheDocument();
  });
});
