'use client';

import React, { useState } from 'react';
import type { PlanItem, PlanStatus } from '../hooks/usePlan';

interface PlanCardProps {
  plans: PlanItem[];
  todayPlan: PlanItem | null;
  todayIndex: number;
  isPlanLoading: boolean;
  isPlanActing: boolean;
  planError: string | null;
  sessionId: string;
  hasUserMessages: boolean;
  onUpdateStatus: (status: Extract<PlanStatus, 'done' | 'skipped'>) => void;
  onRegenerate: () => void;
  onGeneratePlan: () => void;
}

const PlanCard = React.memo(function PlanCard({
  plans, todayPlan, todayIndex,
  isPlanLoading, isPlanActing, planError,
  sessionId, hasUserMessages,
  onUpdateStatus, onRegenerate, onGeneratePlan,
}: PlanCardProps) {
  const [confirmingRegenerateAll, setConfirmingRegenerateAll] = useState(false);

  return (
    <section className="message-bubble flex justify-start mb-3">
      <div className="polish-card max-w-[95%] sm:max-w-[82%] rounded-2xl rounded-bl-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-indigo-50 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 border border-indigo-200 dark:border-indigo-900/50 rounded-t-2xl px-4 py-3">
          <p className="text-[14px] font-semibold text-indigo-700 dark:text-indigo-200">📅 7天微行动计划 · 今日任务</p>
        </div>
        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3">
          {isPlanLoading ? (
            <p className="text-[13px] text-slate-500 dark:text-slate-400">正在读取你的今日任务...</p>
          ) : todayPlan ? (
            <div className="space-y-2">
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Day {todayPlan.day_index}/7 · 当前状态：
                {todayPlan.status === 'done' ? ' ✅ 已完成' : todayPlan.status === 'skipped' ? ' ⏭ 已跳过' : ' 🕒 待完成'}
              </p>
              <p className="text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed break-words">{todayPlan.task_text}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => onUpdateStatus('done')} disabled={isPlanActing || todayPlan.status === 'done'}
                  className="px-2.5 py-1.5 text-[12px] text-emerald-700 dark:text-emerald-100 bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/55 disabled:opacity-40 transition-colors">
                  ✅ 完成
                </button>
                <button onClick={() => onUpdateStatus('skipped')} disabled={isPlanActing || todayPlan.status === 'skipped'}
                  className="px-2.5 py-1.5 text-[12px] text-amber-700 dark:text-amber-100 bg-amber-50 dark:bg-amber-900/35 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/55 disabled:opacity-40 transition-colors">
                  ⏭ 跳过
                </button>
                <button onClick={onRegenerate} disabled={isPlanActing}
                  className="px-2.5 py-1.5 text-[12px] text-sky-700 dark:text-sky-100 bg-sky-50 dark:bg-sky-900/40 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/55 disabled:opacity-40 transition-colors">
                  🔄 重生成今天
                </button>
                {hasUserMessages && (
                  <button
                    onClick={() => setConfirmingRegenerateAll(true)}
                    disabled={isPlanActing}
                    className="px-2.5 py-1.5 text-[12px] text-indigo-700 dark:text-indigo-100 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/55 disabled:opacity-40 transition-colors">
                    ♻️ 重新生成7天
                  </button>
                )}
              </div>
              {todayIndex < 7 && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/70">
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-0.5">明天（Day {todayIndex + 1}/7）</p>
                  <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed break-words">
                    {plans.find((plan) => plan.day_index === todayIndex + 1)?.task_text || '（还没生成/还在读取）'}
                  </p>
                </div>
              )}
              {plans.length > 0 && (
                <details className="pt-1">
                  <summary className="cursor-pointer select-none text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">查看全部 7 天</summary>
                  <div className="mt-2 space-y-1">
                    {plans.map((plan) => (
                      <div key={plan.day_index} className="text-[12px] text-slate-600 dark:text-slate-300 break-words">
                        <span className="font-semibold text-slate-700 dark:text-slate-100">Day {plan.day_index}/7</span>
                        <span className="ml-2">{plan.task_text}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-slate-500 dark:text-slate-400">还没有你的 7 天计划，先生成一份吧。</p>
              {!hasUserMessages && (
                <p className="text-[12px] text-slate-400 dark:text-slate-500">小提示：先聊两句再生成，任务会更贴合你现在的情况。</p>
              )}
              <button onClick={onGeneratePlan} disabled={isPlanActing || !sessionId}
                className="px-3 py-1.5 text-[12px] text-indigo-700 dark:text-indigo-100 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/55 disabled:opacity-40 transition-colors">
                {isPlanActing ? '生成中...' : '✨ 生成7天计划'}
              </button>
            </div>
          )}
          {planError && <p className="text-[12px] text-rose-500 mt-2">{planError}</p>}
        </div>
      </div>
      {confirmingRegenerateAll && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setConfirmingRegenerateAll(false)}>
          <div className="cg-modal w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="text-base font-semibold text-slate-800 dark:text-slate-100">重新生成 7 天计划</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">会覆盖现有 7 天任务并重置状态，确定继续吗？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingRegenerateAll(false)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingRegenerateAll(false);
                  onGeneratePlan();
                }}
                className="rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-600"
              >
                继续生成
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

export default PlanCard;
