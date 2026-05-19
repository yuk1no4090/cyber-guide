'use client';

import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  };

  useEffect(() => {
    handleInput();
  }, [message]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = message.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-3xl px-4 py-3 focus-within:border-sky-400 dark:focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-400/20 transition-all duration-200 shadow-sm">
        <button
          type="button"
          disabled
          className="shrink-0 mb-0.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100/80 dark:bg-slate-800/70 cursor-default"
          title="文件上传即将开放"
          aria-label="文件上传即将开放"
        >
          文件
        </button>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题（Shift+Enter 换行）..."
          disabled={disabled}
          rows={1}
          aria-label="输入消息"
          className="chat-input-textarea flex-1 appearance-none bg-transparent border-0 outline-none ring-0 shadow-none focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none resize-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 max-h-[180px] py-0.5 leading-relaxed disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ minHeight: '24px' }}
        />

        <button
          type="button"
          disabled
          className="shrink-0 mb-0.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100/80 dark:bg-slate-800/70 cursor-default"
          title="语音输入即将开放"
          aria-label="语音输入即将开放"
        >
          语音
        </button>

        <button
          type="submit"
          disabled={disabled || !hasContent}
          className={`shrink-0 h-9 min-w-9 rounded-2xl px-2 flex items-center justify-center transition-all duration-200 ${
            hasContent && !disabled
              ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm shadow-sky-200 dark:shadow-sky-900/40 scale-100'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed scale-95'
          }`}
          aria-label="发送消息"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
      <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-2">
        Cyber Guide 可能产生错误信息，重要决策请结合专业顾问意见
      </p>
    </form>
  );
}
