'use client';

import React from 'react';
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
  return (
    <section className="message-bubble flex justify-start mb-3">
      <div className="max-w-[95%] sm:max-w-[82%] rounded-2xl rounded-bl-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 via-sky-50 to-indigo-50 border border-indigo-200 rounded-t-2xl px-4 py-3">
          <p className="text-[14px] font-semibold text-indigo-700">📅 7天微行动计划 · 今日任务</p>
        </div>
        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3">
          {isPlanLoading ? (
            <p className="text-[13px] text-slate-500">正在读取你的今日任务...</p>
          ) : todayPlan ? (
            <div className="space-y-2">
              <p className="text-[12px] text-slate-500">
                Day {todayPlan.day_index}/7 · 当前状态：
                {todayPlan.status === 'done' ? ' ✅ 已完成' : todayPlan.status === 'skipped' ? ' ⏭ 已跳过' : ' 🕒 待完成'}
              </p>
              <p className="text-[14px] text-slate-700 leading-relaxed break-words">{todayPlan.task_text}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => onUpdateStatus('done')} disabled={isPlanActing || todayPlan.status === 'done'}
                  className="px-2.5 py-1.5 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors">
                  ✅ 完成
                </button>
                <button onClick={() => onUpdateStatus('skipped')} disabled={isPlanActing || todayPlan.status === 'skipped'}
                  className="px-2.5 py-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 transition-colors">
                  ⏭ 跳过
                </button>
                <button onClick={onRegenerate} disabled={isPlanActing}
                  className="px-2.5 py-1.5 text-[12px] text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-40 transition-colors">
                  🔄 重生成今天
                </button>
                {hasUserMessages && (
                  <button
                    onClick={() => { if (confirm('会覆盖现有 7 天任务并重置状态，继续吗？')) onGeneratePlan(); }}
                    disabled={isPlanActing}
                    className="px-2.5 py-1.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors">
                    ♻️ 重新生成7天
                  </button>
                )}
              </div>
              {todayIndex < 7 && (
                <div className="pt-2 border-t border-slate-200/60">
                  <p className="text-[12px] text-slate-500 mb-0.5">明天（Day {todayIndex + 1}/7）</p>
                  <p className="text-[13px] text-slate-700 leading-relaxed break-words">
                    {plans.find((plan) => plan.day_index === todayIndex + 1)?.task_text || '（还没生成/还在读取）'}
                  </p>
                </div>
              )}
              {plans.length > 0 && (
                <details className="pt-1">
                  <summary className="cursor-pointer select-none text-[12px] text-slate-500 hover:text-slate-700">查看全部 7 天</summary>
                  <div className="mt-2 space-y-1">
                    {plans.map((plan) => (
                      <div key={plan.day_index} className="text-[12px] text-slate-600 break-words">
                        <span className="font-semibold text-slate-700">Day {plan.day_index}/7</span>
                        <span className="ml-2">{plan.task_text}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-slate-500">还没有你的 7 天计划，先生成一份吧。</p>
              {!hasUserMessages && (
                <p className="text-[12px] text-slate-400">小提示：先聊两句再生成，任务会更贴合你现在的情况。</p>
              )}
              <button onClick={onGeneratePlan} disabled={isPlanActing || !sessionId}
                className="px-3 py-1.5 text-[12px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors">
                {isPlanActing ? '生成中...' : '✨ 生成7天计划'}
              </button>
            </div>
          )}
          {planError && <p className="text-[12px] text-rose-500 mt-2">{planError}</p>}
        </div>
      </div>
    </section>
  );
});

export default PlanCard;
