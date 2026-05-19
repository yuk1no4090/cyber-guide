import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import PlanCard from '@/app/components/PlanCard';

describe('PlanCard', () => {
  it('opens regenerate-all confirmation before calling onGeneratePlan', () => {
    const onGeneratePlan = vi.fn();

    render(
      <PlanCard
        plans={[{ day_index: 1, task_text: '任务一', status: 'todo' }]}
        todayPlan={{ day_index: 1, task_text: '任务一', status: 'todo' }}
        todayIndex={1}
        isPlanLoading={false}
        isPlanActing={false}
        planError={null}
        sessionId="session-1"
        hasUserMessages
        onUpdateStatus={vi.fn()}
        onRegenerate={vi.fn()}
        onGeneratePlan={onGeneratePlan}
      />,
    );

    fireEvent.click(screen.getByText('♻️ 重新生成7天'));
    expect(screen.getByText('重新生成 7 天计划')).toBeInTheDocument();

    fireEvent.click(screen.getByText('继续生成'));
    expect(onGeneratePlan).toHaveBeenCalled();
  });
});
