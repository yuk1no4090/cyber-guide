import { describe, it, expect } from 'vitest';
import { checkModeration } from '../src/lib/moderation';

describe('checkModeration - 危机检测', () => {
  // 应该触发
  it('检测到"想死"', () => {
    const result = checkModeration('我想死');
    expect(result.isCrisis).toBe(true);
    expect(result.crisisKeywordsFound).toContain('想死');
  });

  it('检测到"自杀"', () => {
    expect(checkModeration('自杀的方法').isCrisis).toBe(true);
  });

  it('检测到"不想活了"', () => {
    expect(checkModeration('我不想活了').isCrisis).toBe(true);
  });

  // 不应该触发（误触发过滤）
  it('"热死了"不触发', () => {
    expect(checkModeration('今天热死了').isCrisis).toBe(false);
  });

  it('"累死了"不触发', () => {
    expect(checkModeration('加班累死了').isCrisis).toBe(false);
  });

  it('"笑死"不触发', () => {
    expect(checkModeration('笑死我了哈哈哈').isCrisis).toBe(false);
  });

  it('"困死了"不触发', () => {
    expect(checkModeration('下午困死了').isCrisis).toBe(false);
  });

  // 边界用例
  it('正常对话不触发', () => {
    expect(checkModeration('我最近考研压力好大').isCrisis).toBe(false);
  });

  it('空字符串不触发', () => {
    expect(checkModeration('').isCrisis).toBe(false);
  });

  it('"考试要把我逼死了"应该不触发（口语化表达）', () => {
    // "逼死" 不在危机关键词列表中
    expect(checkModeration('考试要把我逼死了').isCrisis).toBe(false);
  });
});

