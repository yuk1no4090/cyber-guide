'use client';

import React from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
}

export default function ChatMessage({ role, content, isCrisis }: ChatMessageProps) {
  const isUser = role === 'user';

  const formatContent = (text: string) => {
    let formatted = text;
    // 粗体
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    // 列表项
    formatted = formatted.replace(/^- (.+)/gm, '<span class="flex gap-1.5 items-start"><span class="text-emerald-400/70 mt-0.5">•</span><span>$1</span></span>');
    // 电话号码高亮
    formatted = formatted.replace(/([\d-]{7,})/g, '<span class="text-cyan-400 font-medium">$1</span>');
    // 换行
    formatted = formatted.replace(/\n/g, '<br />');
    return formatted;
  };

  if (isUser) {
    return (
      <div className="message-bubble flex justify-end mb-3">
        <div className="user-bubble max-w-[82%] sm:max-w-[65%] rounded-2xl rounded-br-sm px-3.5 py-2.5 sm:px-4 sm:py-3">
          <div
            className="text-[14px] sm:text-[15px] leading-relaxed text-white/95"
            dangerouslySetInnerHTML={{ __html: formatContent(content) }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className={`
        max-w-[88%] sm:max-w-[72%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 sm:px-4 sm:py-3
        ${isCrisis ? 'crisis-message' : 'ai-bubble'}
      `}>
        {/* AI 标识 */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-[9px]">
            🌿
          </span>
          <span className="text-[11px] text-emerald-400/70 font-medium">Cyber Guide</span>
          {isCrisis && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded text-[10px] font-medium border border-red-500/20">
              紧急
            </span>
          )}
        </div>

        {/* 消息内容 */}
        <div
          className="text-[14px] sm:text-[15px] leading-[1.7] text-gray-200/90"
          dangerouslySetInnerHTML={{ __html: formatContent(content) }}
        />
      </div>
    </div>
  );
}
