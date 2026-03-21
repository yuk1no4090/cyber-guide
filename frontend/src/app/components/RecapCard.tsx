'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { Recap } from '@/lib/recap';
import { analytics } from '@/lib/analytics';

interface RecapCardProps {
  recap: Recap;
  onClose?: () => void;
  generationMeta?: {
    success?: boolean;
    latencyMs?: number;
    errorType?: string;
  };
}

export default function RecapCard({ recap, onClose, generationMeta }: RecapCardProps) {
  const [copied, setCopied] = useState(false);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;

    analytics.trackRecapGenerated({
      success: generationMeta?.success ?? true,
      latency_ms: generationMeta?.latencyMs ?? 0,
      error_type: generationMeta?.errorType ?? 'none',
    });
  }, [generationMeta]);

  const actionsText = useMemo(
    () => recap.actions.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    [recap.actions]
  );

  const handleCopyActions = async () => {
    const started = Date.now();

    try {
      await navigator.clipboard.writeText(actionsText);
      setCopied(true);
      analytics.trackRecapActionCopied({
        success: true,
        latency_ms: Date.now() - started,
        error_type: 'none',
      });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      analytics.trackRecapActionCopied({
        success: false,
        latency_ms: Date.now() - started,
        error_type: 'clipboard_error',
      });
    }
  };

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="polish-card max-w-[95%] sm:max-w-[82%] rounded-2xl rounded-bl-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-sky-50 dark:from-slate-900 dark:via-sky-950/40 dark:to-slate-900 border border-sky-200 dark:border-sky-900/50 rounded-t-2xl px-4 py-3 flex items-center justify-between gap-2">
          <p className="text-[14px] sm:text-[15px] font-semibold text-sky-700 dark:text-sky-200">
            🛶 对话复盘卡
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyActions}
              className="text-[11px] sm:text-xs px-2 py-1 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="复制行动清单"
              aria-label="复制行动清单"
            >
              {copied ? '✅ 已复制' : '📋 复制行动'}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="text-[11px] sm:text-xs px-2 py-1 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                aria-label="关闭复盘卡"
              >
                关闭
              </button>
            )}
          </div>
        </div>

        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3 space-y-3">
          <section>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">当前状态</p>
            <p className="text-[13px] sm:text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed break-words">
              {recap.summary}
            </p>
          </section>

          <section>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">核心卡点</p>
            <ul className="space-y-1">
              {recap.blockers.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="text-[13px] sm:text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed break-words"
                >
                  • {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">明天前可做的小动作</p>
            <ol className="space-y-1">
              {recap.actions.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="text-[13px] sm:text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed break-words"
                >
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl bg-sky-50/70 dark:bg-sky-900/30 border border-sky-100 dark:border-sky-900/55 px-3 py-2">
            <p className="text-[12px] text-sky-500 dark:text-sky-300 mb-1">一句鼓励</p>
            <p className="text-[13px] sm:text-[14px] text-sky-700 dark:text-sky-100 leading-relaxed break-words">
              {recap.encouragement}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

