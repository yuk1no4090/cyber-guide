'use client';

import React from 'react';

export default function TypingIndicator() {
  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="ai-bubble rounded-2xl rounded-bl-sm px-3.5 py-2.5 sm:px-4 sm:py-3">
        {/* AI 标识 */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[9px]">
            🐭
          </span>
          <span className="text-[11px] text-amber-400/70 font-medium">耗子</span>
        </div>
        {/* 跳动的点 */}
        <div className="flex items-center gap-1 py-0.5 px-1">
          <div className="typing-dot w-[6px] h-[6px] bg-emerald-400/60 rounded-full" />
          <div className="typing-dot w-[6px] h-[6px] bg-emerald-400/60 rounded-full" />
          <div className="typing-dot w-[6px] h-[6px] bg-emerald-400/60 rounded-full" />
        </div>
      </div>
    </div>
  );
}
