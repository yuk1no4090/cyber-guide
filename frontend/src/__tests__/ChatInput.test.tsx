import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ChatInput from '@/app/components/ChatInput';

describe('ChatInput', () => {
  it('renders input and sends trimmed message on Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByLabelText('输入消息');
    fireEvent.change(textarea, { target: { value: '  你好，小舟  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('你好，小舟');
  });

  it('does not send when disabled', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled />);

    const textarea = screen.getByLabelText('输入消息');
    fireEvent.change(textarea, { target: { value: 'hello' } });

    const button = screen.getByLabelText('发送消息');
    fireEvent.click(button);

    expect(onSend).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });
});
