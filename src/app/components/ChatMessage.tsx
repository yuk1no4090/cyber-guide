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

    // ### 小标题
    formatted = formatted.replace(/^### (.+)/gm, '<div class="text-[13px] font-semibold text-slate-800 mt-2 mb-1">$1</div>');
    // ## 小标题
    formatted = formatted.replace(/^## (.+)/gm, '<div class="text-[14px] font-semibold text-slate-800 mt-3 mb-1">$1</div>');

    // 粗体
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');

    // 编号列表：1. 2. 3.
    formatted = formatted.replace(/^(\d+)\.\s+(.+)/gm, '<div class="flex gap-1.5 items-start mb-0.5"><span class="text-sky-500 font-medium min-w-[1.2em] text-right">$1.</span><span>$2</span></div>');

    // 无序列表：- 
    formatted = formatted.replace(/^- (.+)/gm, '<div class="flex gap-1.5 items-start mb-0.5"><span class="text-sky-500 mt-0.5">•</span><span>$1</span></div>');

    // 电话号码高亮
    formatted = formatted.replace(/([\d-]{7,})/g, '<span class="text-cyan-400 font-medium">$1</span>');

    // 行内代码
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-sky-50 rounded text-sky-700 text-[13px]">$1</code>');

    // 换行
    formatted = formatted.replace(/\n/g, '<br />');

    // 清理连续空行
    formatted = formatted.replace(/(<br \/>){3,}/g, '<br /><br />');

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
          <span className="w-4 h-4 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-[9px]">
            🛶
          </span>
          <span className="text-[11px] text-sky-500 font-medium">小舟</span>
          {isCrisis && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded text-[10px] font-medium border border-red-500/20">
              紧急
            </span>
          )}
        </div>

        {/* 消息内容 */}
        <div
          className="text-[14px] sm:text-[15px] leading-[1.7] text-slate-700"
          dangerouslySetInnerHTML={{ __html: formatContent(content) }}
        />
      </div>
    </div>
  );
}
