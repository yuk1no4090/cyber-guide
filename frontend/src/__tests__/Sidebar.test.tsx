import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import Sidebar from '@/app/components/Sidebar';

describe('Sidebar', () => {
  const baseProps = {
    sessions: [
      { id: 's1', title: '第一个会话', mode: 'chat', updatedAt: new Date().toISOString() },
    ],
    selectedSessionId: 's1',
    darkMode: false,
    user: null,
    onToggleDarkMode: vi.fn(),
    onSelectSession: vi.fn(),
    onNewSession: vi.fn(),
    onRenameSession: vi.fn().mockResolvedValue(undefined),
    onDeleteSession: vi.fn().mockResolvedValue(undefined),
    onLoginClick: vi.fn(),
    onLogout: vi.fn(),
  };

  it('opens rename dialog and submits the new title', async () => {
    render(<Sidebar {...baseProps} />);

    fireEvent.click(screen.getByLabelText('会话操作'));
    fireEvent.click(screen.getByText('重命名'));

    const dialog = await screen.findByText('重命名会话');
    const input = screen.getByPlaceholderText('输入会话名称');
    fireEvent.change(input, { target: { value: '新的标题' } });
    fireEvent.click(within(dialog.parentElement as HTMLElement).getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(baseProps.onRenameSession).toHaveBeenCalledWith('s1', '新的标题');
    });
  });

  it('opens delete dialog and confirms deletion', async () => {
    render(<Sidebar {...baseProps} />);

    fireEvent.click(screen.getByLabelText('会话操作'));
    fireEvent.click(screen.getByText('删除'));

    const dialog = await screen.findByText('删除会话');
    fireEvent.click(within(dialog.parentElement as HTMLElement).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(baseProps.onDeleteSession).toHaveBeenCalledWith('s1');
    });
  });
});
