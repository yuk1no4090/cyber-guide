'use client';

import React, { useState } from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
}

export default function ChatMessage({ role, content, isCrisis }: ChatMessageProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);

  const formatContent = (text: string) => {
    let formatted = text;

    formatted = formatted.replace(/^### (.+)/gm, '<div class="text-[13px] font-semibold text-slate-800 mt-2 mb-1">$1</div>');
    formatted = formatted.replace(/^## (.+)/gm, '<div class="text-[14px] font-semibold text-slate-800 mt-3 mb-1">$1</div>');
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');
    formatted = formatted.replace(/^(\d+)\.\s+(.+)/gm, '<div class="flex gap-1.5 items-start mb-0.5"><span class="text-sky-500 font-medium min-w-[1.2em] text-right">$1.</span><span>$2</span></div>');
    formatted = formatted.replace(/^- (.+)/gm, '<div class="flex gap-1.5 items-start mb-0.5"><span class="text-sky-500 mt-0.5">•</span><span>$1</span></div>');
    formatted = formatted.replace(/([\d-]{7,})/g, '<span class="text-sky-600 font-medium">$1</span>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-sky-50 rounded text-sky-700 text-[13px]">$1</code>');
    formatted = formatted.replace(/\n/g, '<br />');
    formatted = formatted.replace(/(<br \/>){3,}/g, '<br /><br />');

    return formatted;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 静默失败
    }
  };

  if (isUser) {
    return (
      <div className="message-bubble flex justify-end mb-3">
        <div className="user-bubble max-w-[82%] sm:max-w-[65%] rounded-2xl rounded-br-sm px-3.5 py-2.5 sm:px-4 sm:py-3 overflow-hidden">
          <div
            className="text-[14px] sm:text-[15px] leading-relaxed text-white/95 break-words overflow-wrap-anywhere"
            dangerouslySetInnerHTML={{ __html: formatContent(content) }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="message-bubble flex justify-start mb-3 group">
      <div className={`
        max-w-[88%] sm:max-w-[72%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 sm:px-4 sm:py-3 relative
        ${isCrisis ? 'crisis-message' : 'ai-bubble'}
      `}>
        {/* AI 标识 + 复制按钮 */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
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
          {/* 复制按钮 */}
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title="复制内容"
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-emerald-500">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
              </svg>
            )}
          </button>
        </div>

        {/* 消息内容 */}
        <div
          className="text-[14px] sm:text-[15px] leading-[1.7] text-slate-700 break-words overflow-wrap-anywhere"
          dangerouslySetInnerHTML={{ __html: formatContent(content) }}
        />
      </div>
    </div>
  );
}
