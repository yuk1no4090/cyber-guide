import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import LoginModal from '@/app/components/LoginModal';

describe('LoginModal', () => {
  const baseProps = {
    open: true,
    loading: false,
    onClose: vi.fn(),
    onLogin: vi.fn().mockResolvedValue(undefined),
    onRegister: vi.fn().mockResolvedValue(undefined),
    onSendCode: vi.fn().mockResolvedValue(undefined),
    onGithub: vi.fn(),
  };

  it('closes on overlay click', () => {
    render(<LoginModal {...baseProps} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('hides the verification-code field when the backend does not require one', () => {
    render(<LoginModal {...baseProps} emailCodeRequired={false} />);

    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(screen.queryByPlaceholderText('邮箱验证码')).toBeNull();
    expect(screen.queryByRole('button', { name: '发送验证码' })).toBeNull();
  });

  it('shows the verification-code field when the backend requires one', () => {
    render(<LoginModal {...baseProps} emailCodeRequired />);

    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(screen.getByPlaceholderText('邮箱验证码')).toBeTruthy();
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeTruthy();
  });

  it('says no mail was sent when the server reports sent=false', async () => {
    const onSendCode = vi.fn().mockResolvedValue({ sent: false, cooldownSeconds: 60 });
    render(<LoginModal {...baseProps} emailCodeRequired onSendCode={onSendCode} />);

    fireEvent.click(screen.getByRole('button', { name: '注册' }));
    fireEvent.change(screen.getByPlaceholderText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => {
      expect(screen.getByText(/未实际发送邮件/)).toBeTruthy();
    });
  });

  it('confirms delivery when the server reports sent=true', async () => {
    const onSendCode = vi.fn().mockResolvedValue({ sent: true, cooldownSeconds: 60 });
    render(<LoginModal {...baseProps} emailCodeRequired onSendCode={onSendCode} />);

    fireEvent.click(screen.getByRole('button', { name: '注册' }));
    fireEvent.change(screen.getByPlaceholderText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => {
      expect(screen.getByText(/验证码已发送/)).toBeTruthy();
    });
  });

  it('closes on Escape', async () => {
    render(<LoginModal {...baseProps} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(baseProps.onClose).toHaveBeenCalled();
    });
  });
});
