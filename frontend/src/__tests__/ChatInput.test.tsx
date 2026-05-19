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

  it('shows coming-soon affordances for secondary actions', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    expect(screen.getByLabelText('文件上传即将开放')).toBeDisabled();
    expect(screen.getByLabelText('语音输入即将开放')).toBeDisabled();
  });
});
