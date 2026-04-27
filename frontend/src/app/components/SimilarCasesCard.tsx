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

const schoolTierColors: Record<string, string> = {
  'C9': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  '985': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  '211': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  '双非': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  '普通一本': 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
};

export default function SimilarCasesCard({ cases }: SimilarCasesCardProps) {
  if (!cases || cases.length === 0) return null;

  return (
    <div className="mt-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-3.5 h-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          相似成功案例
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {cases.slice(0, 3).map((item, idx) => (
          <a
            key={`${item.url}-${idx}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex-shrink-0 w-[220px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:border-sky-400 dark:hover:border-sky-500 hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-sky-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                  {item.school || '某高校'}
                </span>
              </div>
              <svg className="w-3 h-3 text-slate-400 group-hover:text-sky-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>

            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug mb-2">
              {item.title || `案例 ${idx + 1}`}
            </h4>

            {item.snippet && (
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                {item.snippet}
              </p>
            )}

            <div className="flex gap-1.5 flex-wrap">
              {item.schoolTier && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${schoolTierColors[item.schoolTier] || schoolTierColors['双非']}`}>
                  {item.schoolTier}
                </span>
              )}
              {item.gpa && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  GPA {item.gpa}
                </span>
              )}
              {item.outcome && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  {item.outcome}
                </span>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
