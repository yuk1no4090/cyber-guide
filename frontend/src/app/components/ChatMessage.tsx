'use client';

import React, { useState, useMemo } from 'react';
import { sanitizeHTML } from '@/lib/sanitize';

export interface EvidenceItem {
  title?: string;
  source?: string;
  url?: string;
  score?: number;
  tier?: string;
  school?: string;
  schoolTier?: string;
  gpa?: string;
  rankPct?: string;
  outcome?: string;
  destSchool?: string;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
  evidence?: EvidenceItem[];
  animationDelayMs?: number;
}

const ChatMessage = React.memo(function ChatMessage({ role, content, isCrisis, evidence, animationDelayMs = 0 }: ChatMessageProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);

  const formattedHtml = useMemo(() => {
    let formatted = content;

    formatted = formatted.replace(/^### (.+)/gm, '<div class="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mt-2 mb-1">$1</div>');
    formatted = formatted.replace(/^## (.+)/gm, '<div class="text-[14px] font-semibold text-slate-800 dark:text-slate-100 mt-3 mb-1">$1</div>');
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-slate-50">$1</strong>');
    formatted = formatted.replace(/^(\d+)\.\s+(.+)/gm, '<div class="flex gap-1.5 items-start mb-0.5"><span class="text-sky-500 font-medium min-w-[1.2em] text-right">$1.</span><span>$2</span></div>');
    formatted = formatted.replace(/^- (.+)/gm, '<div class="flex gap-1.5 items-start mb-0.5"><span class="text-sky-500 mt-0.5">•</span><span>$1</span></div>');
    formatted = formatted.replace(/([\d-]{7,})/g, '<span class="text-sky-600 dark:text-sky-300 font-medium">$1</span>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-sky-50 dark:bg-sky-900/35 rounded text-sky-700 dark:text-sky-200 text-[13px]">$1</code>');
    // Markdown links: [text](https://example.com)
    formatted = formatted.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-300 underline underline-offset-2 break-all">$1</a>'
    );
    // Plain URLs
    formatted = formatted.replace(
      /(^|[\s(（])(https?:\/\/[^\s<)）]+)([)）.,!?，。；;:]?)/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-300 underline underline-offset-2 break-all">$2</a>$3'
    );
    formatted = formatted.replace(/\n/g, '<br />');
    formatted = formatted.replace(/(<br \/>){3,}/g, '<br /><br />');

    return sanitizeHTML(formatted, {
      ALLOWED_TAGS: ['div', 'span', 'strong', 'code', 'br', 'a'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    });
  }, [content]);

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
      <div className="message-bubble flex justify-end mb-4" style={{ animationDelay: `${animationDelayMs}ms` }}>
        <div className="flex flex-col items-end gap-1 max-w-[75%]">
          <div className="user-bubble rounded-2xl rounded-br-sm px-4 py-3 shadow-lg shadow-sky-200/50 dark:shadow-sky-950/40">
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: formattedHtml }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-bubble flex justify-start mb-4 group" style={{ animationDelay: `${animationDelayMs}ms` }}>
      <div className="mr-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-cyan-400 to-blue-600 text-white shadow-md shadow-sky-200/60 dark:shadow-sky-950/50">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.42A12.08 12.08 0 0118 14.5c0 1.8-2.69 3.25-6 3.25s-6-1.45-6-3.25c0-1.35.11-2.65-.16-3.92L12 14z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`
          max-w-[88%] rounded-2xl rounded-bl-sm px-4 py-3.5 relative
          ${isCrisis ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'ai-bubble polish-card'}
        `}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-300">小舟</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span className="text-[10px] text-slate-400 dark:text-slate-500">AI 学业职业规划助手</span>
            {isCrisis && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-200">
                紧急
              </span>
            )}
          </div>
          {/* 复制按钮 */}
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            title="复制内容"
            aria-label="复制消息内容"
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
              </svg>
            )}
          </button>

          {/* 消息内容 */}
          <div
            className="chat-message-content text-sm leading-relaxed text-slate-700 dark:text-slate-100 break-words overflow-wrap-anywhere pr-8"
            dangerouslySetInnerHTML={{ __html: formattedHtml }}
          />
        {Array.isArray(evidence) && evidence.length > 0 && (
          <details className="mt-2.5 rounded-xl border border-sky-100/80 dark:border-sky-900/45 bg-gradient-to-br from-sky-50/80 to-indigo-50/70 dark:from-slate-900/70 dark:to-slate-800/70 px-2.5 py-2">
            <summary className="cursor-pointer text-[11px] text-slate-600 dark:text-slate-300 font-medium">
              📎 回答依据（{evidence.length}）
            </summary>
            <div className="evidence-panel mt-1.5 space-y-1.5">
              {evidence.slice(0, 5).map((item, idx) => (
                <div key={`${item.url || item.title || 'e'}-${idx}`} className="rounded-lg border border-slate-200/70 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="font-medium text-slate-700 dark:text-slate-100 truncate">
                    {item.title || `证据 ${idx + 1}`}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    {item.source && <span>来源: {item.source}</span>}
                    {typeof item.score === 'number' && <span>相关度: {item.score.toFixed(1)}</span>}
                    {item.tier && <span>层级: {item.tier}</span>}
                  </div>
                  {(item.schoolTier || item.gpa || item.rankPct || item.outcome || item.destSchool) && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                      {item.schoolTier && (
                        <span className="rounded-full border border-indigo-200/80 dark:border-indigo-700/70 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-200">
                          {item.schoolTier}
                        </span>
                      )}
                      {item.gpa && (
                        <span className="rounded-full border border-sky-200/80 dark:border-sky-700/70 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 text-sky-700 dark:text-sky-200">
                          GPA {item.gpa}
                        </span>
                      )}
                      {item.rankPct && (
                        <span className="rounded-full border border-teal-200/80 dark:border-teal-700/70 bg-teal-50 dark:bg-teal-900/30 px-1.5 py-0.5 text-teal-700 dark:text-teal-200">
                          排名 {item.rankPct}
                        </span>
                      )}
                      {item.outcome && (
                        <span className="rounded-full border border-amber-200/80 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 text-amber-700 dark:text-amber-200">
                          {item.outcome}
                          {item.destSchool ? ` → ${item.destSchool}` : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-0.5 text-[10px] text-sky-600 dark:text-sky-300 hover:text-sky-700 dark:hover:text-sky-200 hover:underline"
                    >
                      查看原文
                    </a>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
        </div>
      </div>
    </div>
  );
});

export default ChatMessage;
