import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ChatInput from '@/app/components/ChatInput';
import ChatMessage from '@/app/components/ChatMessage';

describe('ChatInput edge cases', () => {
  it('does not send whitespace-only message', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息');

    fireEvent.change(textarea, { target: { value: '   \n\t   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('handles extremely long input without crashing', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息');
    const longText = '哈'.repeat(50000);

    fireEvent.change(textarea, { target: { value: longText } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith(longText);
  });

  it('handles special characters and XSS payloads', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息');
    const xss = '<script>alert("xss")</script>';

    fireEvent.change(textarea, { target: { value: xss } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith(xss);
  });

  it('shift+enter does not submit', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息');

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('clears input after successful send', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(textarea.value).toBe('');
  });

  it('handles emoji input correctly', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText('输入消息');

    fireEvent.change(textarea, { target: { value: '🎓💻🚀' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('🎓💻🚀');
  });
});

describe('ChatMessage edge cases', () => {
  it('renders empty content without crashing', () => {
    const { container } = render(<ChatMessage role="user" content="" />);
    expect(container).toBeTruthy();
  });

  it('sanitizes XSS in content', () => {
    const xss = '<script>alert("xss")</script><img onerror="alert(1)" src=x>';
    render(<ChatMessage role="assistant" content={xss} />);

    // Should not have script or img tags
    const html = document.querySelector('.message-bubble')?.innerHTML || '';
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
  });

  it('renders extremely long content without crashing', () => {
    const longContent = '这是一段很长的回复。'.repeat(5000);
    const { container } = render(<ChatMessage role="assistant" content={longContent} />);
    expect(container).toBeTruthy();
  });

  it('handles markdown-like content correctly', () => {
    const md = '## 标题\n**粗体**\n1. 第一点\n- 列表项\n`code块`';
    render(<ChatMessage role="assistant" content={md} />);

    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('粗体')).toBeInTheDocument();
  });

  it('renders multiple consecutive newlines as max 2 breaks', () => {
    render(<ChatMessage role="assistant" content={"line1\n\n\n\n\nline2"} />);
    const html = document.querySelector('.message-bubble')?.innerHTML || '';
    expect(html).not.toContain('<br /><br /><br />');
  });

  it('renders crisis message with special styling', () => {
    render(<ChatMessage role="assistant" content="请联系心理热线" isCrisis />);
    expect(screen.getByText('紧急')).toBeInTheDocument();
    expect(screen.getByText('小舟')).toBeInTheDocument();
  });

  it('handles content with only special characters', () => {
    const special = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
    const { container } = render(<ChatMessage role="user" content={special} />);
    expect(container).toBeTruthy();
  });

  it('handles content with nested HTML tags', () => {
    const nested = '<div><span><b>nested</b></span></div>';
    render(<ChatMessage role="assistant" content={nested} />);
    // Should render safely without executing nested HTML
    const html = document.querySelector('.message-bubble')?.innerHTML || '';
    expect(html).not.toContain('<b>'); // sanitized by DOMPurify
  });
});
