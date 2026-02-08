'use client';

import React, { useState } from 'react';

interface ProfileReportProps {
  content: string;
  onClose: () => void;
  isOtherMode?: boolean;
}

export default function ProfileReport({ content, onClose, isOtherMode }: ProfileReportProps) {
  const [copied, setCopied] = useState(false);

  const formatReport = (text: string) => {
    let formatted = text;
    formatted = formatted.replace(/^### (.+)/gm, '<h3 class="text-base font-semibold text-slate-800 mt-4 mb-2">$1</h3>');
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800 font-semibold">$1</strong>');
    formatted = formatted.replace(/\| (.+?) \| (.+?) \|/g, (_, col1, col2) => {
      if (col1.includes('---')) return '';
      if (col1.includes('维度')) return `<div class="grid grid-cols-[100px_1fr] gap-1 text-[13px] mt-1 mb-1 px-2 py-1 bg-sky-50/50 rounded font-medium text-slate-600"><span>${col1}</span><span>${col2}</span></div>`;
      return `<div class="grid grid-cols-[100px_1fr] gap-1 text-[13px] px-2 py-1.5 border-b border-slate-100"><span class="text-slate-500">${col1}</span><span class="text-slate-700">${col2}</span></div>`;
    });
    formatted = formatted.replace(/^- (.+)/gm, '<div class="flex gap-1.5 items-start text-[13px] mb-1"><span class="text-sky-500 mt-0.5">•</span><span class="text-slate-700">$1</span></div>');
    formatted = formatted.replace(/\n/g, '<br />');
    formatted = formatted.replace(/(<br \/>){3,}/g, '<br /><br />');
    return formatted;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const title = isOtherMode ? '🔍 ta 的读人报告' : '📋 你的个人画像';

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="max-w-[95%] sm:max-w-[85%] rounded-2xl rounded-bl-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-sky-50 border border-sky-200 rounded-t-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-sky-700">{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              title="复制报告"
            >
              {copied ? '✅ 已复制' : '📋 复制'}
            </button>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-700 text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              返回聊天
            </button>
          </div>
        </div>

        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3">
          <div
            className="text-[13px] sm:text-[14px] leading-[1.7] text-slate-700 break-words overflow-wrap-anywhere"
            dangerouslySetInnerHTML={{ __html: formatReport(content) }}
          />
        </div>
      </div>
    </div>
  );
}
