'use client';

import React from 'react';

export interface SimilarCaseItem {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  category?: string;
}

interface SimilarCasesCardProps {
  cases: SimilarCaseItem[];
}

export default function SimilarCasesCard({ cases }: SimilarCasesCardProps) {
  if (!cases || cases.length === 0) return null;

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="max-w-[96%] sm:max-w-[86%] rounded-2xl rounded-bl-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-indigo-50 border border-indigo-200 rounded-t-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔎</span>
            <span className="text-[14px] font-semibold text-indigo-700">与你背景相似的案例</span>
          </div>
        </div>
        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3 space-y-2.5">
          {cases.slice(0, 3).map((item, idx) => (
            <div key={`${item.url}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="text-[13px] font-semibold text-slate-700">{item.title || `案例 ${idx + 1}`}</div>
              {item.snippet && (
                <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">{item.snippet}</div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[11px] text-slate-400">{item.category || item.source || '案例'}</div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-sky-600 hover:text-sky-700 hover:underline"
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
