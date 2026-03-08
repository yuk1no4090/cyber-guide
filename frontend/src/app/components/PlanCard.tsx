'use client';

import type { PlanItem } from '@/app/hooks/usePlan';

interface PlanCardProps {
  plans: PlanItem[];
  todayPlan: PlanItem | null;
  todayIndex: number;
  isPlanActing: boolean;
  planError: string | null;
  onMarkDone: () => void;
  onMarkSkipped: () => void;
  onRegenerate: () => void;
}

export function PlanCard({
  plans, todayPlan, todayIndex, isPlanActing, planError,
  onMarkDone, onMarkSkipped, onRegenerate,
}: PlanCardProps) {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl p-4 shadow-sm border border-[var(--color-border)] fade-in-up">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
        7 天行动计划 · 第 {todayIndex} 天
      </h3>

      {todayPlan && (
        <div className="mb-3 p-3 rounded-xl bg-[var(--color-bg-light)]">
          <p className="text-sm text-[var(--color-text)]">
            {todayPlan.task_text ?? todayPlan.taskText}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            状态: {todayPlan.status === 'done' ? '已完成' : todayPlan.status === 'skipped' ? '已跳过' : '待完成'}
          </p>
        </div>
      )}

      {planError && (
        <p className="text-xs text-[var(--color-danger)] mb-2">{planError}</p>
      )}

      <div className="flex gap-2 flex-wrap">
        {todayPlan?.status === 'todo' && (
          <>
            <button
              onClick={onMarkDone}
              disabled={isPlanActing}
              className="px-3 py-1.5 rounded-lg text-xs bg-green-500 text-white disabled:opacity-40"
            >
              完成
            </button>
            <button
              onClick={onMarkSkipped}
              disabled={isPlanActing}
              className="px-3 py-1.5 rounded-lg text-xs bg-gray-400 text-white disabled:opacity-40"
            >
              跳过
            </button>
          </>
        )}
        <button
          onClick={onRegenerate}
          disabled={isPlanActing}
          className="px-3 py-1.5 rounded-lg text-xs bg-[var(--color-primary)] text-white disabled:opacity-40"
        >
          换一个
        </button>
      </div>

      {/* Mini progress */}
      <div className="flex gap-1 mt-3">
        {plans.map((p, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              p.status === 'done' ? 'bg-green-400' :
              p.status === 'skipped' ? 'bg-gray-300' :
              (p.day_index ?? p.dayIndex) === todayIndex ? 'bg-[var(--color-primary)]' :
              'bg-[var(--color-bg-lighter)]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
