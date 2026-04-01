'use client';

import React from 'react';

export interface SimilarCaseItem {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  category?: string;
  school?: string;
  schoolTier?: string;
  gpa?: string;
  rankPct?: string;
  outcome?: string;
  destSchool?: string;
}

interface SimilarCasesCardProps {
  cases: SimilarCaseItem[];
}

export default function SimilarCasesCard({ cases }: SimilarCasesCardProps) {
  if (!cases || cases.length === 0) return null;

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="max-w-[96%] sm:max-w-[86%] rounded-2xl rounded-bl-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-indigo-50 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 border border-indigo-200 dark:border-indigo-900/50 rounded-t-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔎</span>
            <span className="text-[14px] font-semibold text-indigo-700 dark:text-indigo-200">与你背景相似的案例</span>
          </div>
        </div>
        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3 space-y-2.5">
          {cases.slice(0, 3).map((item, idx) => (
            <div key={`${item.url}-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-3">
              <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-100">{item.title || `案例 ${idx + 1}`}</div>
              {item.snippet && (
                <div className="text-[12px] text-slate-500 dark:text-slate-300 mt-1 leading-relaxed">{item.snippet}</div>
              )}
              {(item.schoolTier || item.gpa || item.rankPct || item.outcome) && (
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
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
                      {item.outcome}{item.destSchool ? ` → ${item.destSchool}` : ''}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[11px] text-slate-400 dark:text-slate-500">{item.category || item.source || '案例'}</div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-sky-600 dark:text-sky-300 hover:text-sky-700 dark:hover:text-sky-100 hover:underline"
                >
                  查看原文
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
