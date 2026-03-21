'use client';

import React, { useState, useMemo } from 'react';
import { sanitizeHTML } from '@/lib/sanitize';

interface ProfileReportProps {
  content: string;
  onClose: () => void;
  isOtherMode?: boolean;
}

const ProfileReport = React.memo(function ProfileReport({ content, onClose, isOtherMode }: ProfileReportProps) {
  const [copied, setCopied] = useState(false);

  const formattedHtml = useMemo(() => {
    let formatted = content;
    formatted = formatted.replace(/^### (.+)/gm, '<h3 class="text-base font-semibold text-slate-800 dark:text-slate-100 mt-4 mb-2">$1</h3>');
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100 font-semibold">$1</strong>');
    formatted = formatted.replace(/\| (.+?) \| (.+?) \|/g, (_, col1, col2) => {
      if (col1.includes('---')) return '';
      if (col1.includes('维度')) return `<div class="grid grid-cols-[100px_1fr] gap-1 text-[13px] mt-1 mb-1 px-2 py-1 bg-sky-50/50 dark:bg-sky-900/30 rounded font-medium text-slate-600 dark:text-slate-300"><span>${col1}</span><span>${col2}</span></div>`;
      return `<div class="grid grid-cols-[100px_1fr] gap-1 text-[13px] px-2 py-1.5 border-b border-slate-100 dark:border-slate-700"><span class="text-slate-500 dark:text-slate-400">${col1}</span><span class="text-slate-700 dark:text-slate-200">${col2}</span></div>`;
    });
    formatted = formatted.replace(/^- (.+)/gm, '<div class="flex gap-1.5 items-start text-[13px] mb-1"><span class="text-sky-500 dark:text-sky-300 mt-0.5">•</span><span class="text-slate-700 dark:text-slate-200">$1</span></div>');
    formatted = formatted.replace(/\n/g, '<br />');
    formatted = formatted.replace(/(<br \/>){3,}/g, '<br /><br />');

    return sanitizeHTML(formatted, {
      ALLOWED_TAGS: ['h3', 'div', 'span', 'strong', 'br'],
      ALLOWED_ATTR: ['class'],
    });
  }, [content]);

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
        <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-sky-50 dark:from-slate-900 dark:via-sky-950/40 dark:to-slate-900 border border-sky-200 dark:border-sky-900/50 rounded-t-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-sky-700 dark:text-sky-200">{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="复制报告"
            >
              {copied ? '✅ 已复制' : '📋 复制'}
            </button>
            <button
              onClick={onClose}
              className="text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              返回聊天
            </button>
          </div>
        </div>

        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3">
          <div
            className="text-[13px] sm:text-[14px] leading-[1.7] text-slate-700 dark:text-slate-200 break-words overflow-wrap-anywhere"
            dangerouslySetInnerHTML={{ __html: formattedHtml }}
          />
        </div>
      </div>
    </div>
  );
});

export default ProfileReport;
