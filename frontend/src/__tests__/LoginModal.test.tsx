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

  it('labels every field for assistive tech, not just with a placeholder', () => {
    render(<LoginModal {...baseProps} />);

    // A placeholder vanishes as soon as someone types and is not a label, so
    // screen-reader users had nothing to identify these fields by.
    expect(screen.getByLabelText('邮箱')).toBeTruthy();
    expect(screen.getByLabelText('密码（至少 6 位）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy();
  });

  it('moves focus into the dialog when it opens', () => {
    render(<LoginModal {...baseProps} />);

    expect(document.activeElement).toBe(screen.getByLabelText('邮箱'));
  });

  it('keeps Tab inside the dialog', () => {
    render(<LoginModal {...baseProps} />);
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, input')
    ).filter((el) => !el.hasAttribute('disabled'));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Tabbing off the end wraps to the start rather than escaping into the page
    // behind the overlay, which the mouse cannot reach but the keyboard could.
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('announces a validation error to a screen reader', async () => {
    render(<LoginModal {...baseProps} emailCodeRequired />);

    fireEvent.click(screen.getByRole('button', { name: '注册' }));
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });
});
