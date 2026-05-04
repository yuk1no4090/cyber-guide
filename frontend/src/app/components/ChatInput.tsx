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
          disabled={disabled}
          className="shrink-0 mb-0.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="上传文件（开发中）"
          aria-label="上传文件"
        >
          <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 6.75l-7.6 7.6a3 3 0 104.24 4.24l7.07-7.07a5 5 0 10-7.07-7.07L5.7 11.89a7 7 0 109.9 9.9l5.66-5.66" />
          </svg>
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
          disabled={disabled}
          className="shrink-0 mb-0.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="语音输入（开发中）"
          aria-label="语音输入"
        >
          <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.5a4 4 0 004-4v-6a4 4 0 10-8 0v6a4 4 0 004 4z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11v3.5a7 7 0 01-14 0V11m7 10v-2.5" />
          </svg>
        </button>

        <button
          type="submit"
          disabled={disabled || !hasContent}
          className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${
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
      <p className="text-center text-[11px] text-slate-400 dark:text-slate-600 mt-2">
        Cyber Guide 可能产生错误信息，重要决策请结合专业顾问意见
      </p>
    </form>
  );
}
