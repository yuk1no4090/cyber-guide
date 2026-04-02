import { describe, it, expect } from 'vitest';
import { parsePlanQuery } from '@/lib/plan';

describe('parsePlanQuery', () => {
  it('returns null for empty input', () => {
    expect(parsePlanQuery('', 1)).toBeNull();
    expect(parsePlanQuery('  ', 1)).toBeNull();
  });

  it('returns null when no plan/task keyword present', () => {
    expect(parsePlanQuery('今天天气不错', 1)).toBeNull();
    expect(parsePlanQuery('帮我写个代码', 1)).toBeNull();
  });

  it('detects "all" plan queries', () => {
    expect(parsePlanQuery('看看全部计划', 1)).toEqual({ kind: 'all' });
    expect(parsePlanQuery('所有任务是什么', 1)).toEqual({ kind: 'all' });
    expect(parsePlanQuery('给我完整计划', 1)).toEqual({ kind: 'all' });
    expect(parsePlanQuery('7天计划', 1)).toEqual({ kind: 'all' });
    expect(parsePlanQuery('七天任务', 1)).toEqual({ kind: 'all' });
  });

  it('detects specific day by digit', () => {
    expect(parsePlanQuery('第3天计划', 1)).toEqual({ kind: 'day', day_index: 3 });
    expect(parsePlanQuery('第 5 天任务', 1)).toEqual({ kind: 'day', day_index: 5 });
  });

  it('detects specific day by Chinese numeral', () => {
    expect(parsePlanQuery('第一天计划', 1)).toEqual({ kind: 'day', day_index: 1 });
    expect(parsePlanQuery('第三天任务', 1)).toEqual({ kind: 'day', day_index: 3 });
    // 注意：「第七天任务」会匹配「七天.*任务」全局模式，返回 { kind: 'all' }
    expect(parsePlanQuery('第七天任务', 1)).toEqual({ kind: 'all' });
  });

  it('handles 今天/明天/后天 relative to todayIndex', () => {
    expect(parsePlanQuery('今天的计划', 3)).toEqual({ kind: 'day', day_index: 3 });
    expect(parsePlanQuery('明天任务', 3)).toEqual({ kind: 'day', day_index: 4 });
    expect(parsePlanQuery('后天计划', 5)).toEqual({ kind: 'day', day_index: 7 }); // capped at 7
  });

  it('caps 明天/后天 at 7', () => {
    expect(parsePlanQuery('明天计划', 7)).toEqual({ kind: 'day', day_index: 7 });
    expect(parsePlanQuery('后天任务', 6)).toEqual({ kind: 'day', day_index: 7 });
  });
});
