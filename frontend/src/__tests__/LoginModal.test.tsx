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

  it('closes on Escape', async () => {
    render(<LoginModal {...baseProps} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(baseProps.onClose).toHaveBeenCalled();
    });
  });
});
