'use client';

import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
      // 重置高度
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
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="说说你的想法..."
          disabled={disabled}
          rows={1}
          className="
            w-full px-3.5 py-2.5 sm:px-4 sm:py-3
            bg-[#1a1d27] text-gray-100
            border border-white/[0.08]
            rounded-2xl resize-none
            text-[14px] sm:text-[15px]
            placeholder:text-gray-500
            focus:outline-none input-glow
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200
          "
          style={{ maxHeight: '120px' }}
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !hasContent}
        className={`
          btn-send
          h-10 w-10 sm:h-11 sm:w-11
          rounded-xl sm:rounded-2xl
          flex items-center justify-center
          text-white
          flex-shrink-0
          ${hasContent ? 'scale-100' : 'scale-95'}
          transition-all duration-200
        `}
        aria-label="发送消息"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-[18px] h-[18px] sm:w-5 sm:h-5"
        >
          <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
        </svg>
      </button>
    </form>
  );
}
