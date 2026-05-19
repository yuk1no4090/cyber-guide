import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ChatHeader from '@/app/components/ChatHeader';

describe('ChatHeader', () => {
  const baseProps = {
    mode: 'chat' as const,
    darkMode: false,
    isDesktop: false,
    isTablet: false,
    mobileSidebarOpen: false,
    desktopSidebarCollapsed: false,
    isLoggedIn: false,
    authLoading: false,
    isLoading: false,
    isRecapLoading: false,
    isProfileMode: false,
    canGenerateRecap: true,
    reportContent: null,
    profileMessages: [],
    messages: [
      { role: 'assistant', content: '欢迎' },
      { role: 'user', content: '你好' },
    ],
    onToggleSidebar: vi.fn(),
    onToggleDarkMode: vi.fn(),
    onLoginClick: vi.fn(),
    onStartNewChat: vi.fn(),
    onStartProfile: vi.fn(),
    onBackToChat: vi.fn(),
    onGenerateRecap: vi.fn(),
    onGenerateReport: vi.fn(),
  };

  it('opens the overflow menu and closes it on outside click', async () => {
    render(<ChatHeader {...baseProps} />);

    fireEvent.click(screen.getByLabelText('更多操作'));
    expect(screen.getByText('新对话')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('新对话')).not.toBeInTheDocument();
    });
  });

  it('triggers menu action and closes the menu', async () => {
    render(<ChatHeader {...baseProps} />);

    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('新对话'));

    expect(baseProps.onStartNewChat).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('新对话')).not.toBeInTheDocument();
    });
  });
});
