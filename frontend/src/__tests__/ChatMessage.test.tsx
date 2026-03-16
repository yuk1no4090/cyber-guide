import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ChatMessage from '@/app/components/ChatMessage';

describe('ChatMessage', () => {
  it('renders user bubble content', () => {
    render(<ChatMessage role="user" content="**加粗文本**" />);

    expect(screen.getByText('加粗文本')).toBeInTheDocument();
  });

  it('renders assistant label and crisis badge', () => {
    render(<ChatMessage role="assistant" content="请先深呼吸，我们一步一步来。" isCrisis />);

    expect(screen.getByText('小舟')).toBeInTheDocument();
    expect(screen.getByText('紧急')).toBeInTheDocument();
  });

  it('copies content to clipboard on copy click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<ChatMessage role="assistant" content="可复制内容" />);
    fireEvent.click(screen.getByLabelText('复制消息内容'));

    expect(writeText).toHaveBeenCalledWith('可复制内容');
    expect(await screen.findByTitle('复制内容')).toBeInTheDocument();
  });
});
