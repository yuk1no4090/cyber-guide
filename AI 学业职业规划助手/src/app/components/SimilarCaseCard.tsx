import React from "react";
import { ExternalLink, BookOpen, GraduationCap } from "lucide-react";
import type { SimilarCase } from "../data/mockData";

const levelColors: Record<SimilarCase["schoolLevel"], string> = {
  "Top 10": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "Top 30": "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "Top 50": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Top 100": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

interface Props {
  cases: SimilarCase[];
}

export function SimilarCaseCards({ cases }: Props) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen size={14} className="text-sky-500" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          相似成功案例
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {cases.map((c) => (
          <a
            key={c.id}
            href={c.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex-shrink-0 w-[220px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:border-sky-400 dark:hover:border-sky-500 hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <GraduationCap size={14} className="text-sky-500 shrink-0" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                  {c.school}
                </span>
              </div>
              <ExternalLink
                size={12}
                className="text-slate-400 group-hover:text-sky-500 transition-colors shrink-0"
              />
            </div>

            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug mb-2">
              {c.title}
            </h4>

            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
              {c.summary}
            </p>

            <div className="flex gap-1.5 flex-wrap">
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${levelColors[c.schoolLevel]}`}
              >
                {c.schoolLevel}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                GPA {c.gpa}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
