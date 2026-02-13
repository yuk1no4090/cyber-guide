import { describe, it, expect } from 'vitest';
import {
  buildRecapFailureResponse,
  buildRecapSuccessResponse,
  generateRecapFromMessages,
  hasActionVerb,
  isRecapEligibleMode,
  isValidRecap,
} from '@/lib/recap';

const baseMessages = [
  { role: 'assistant' as const, content: '最近怎么样？' },
  { role: 'user' as const, content: '我最近很焦虑，项目推进不动。' },
  { role: 'assistant' as const, content: '最卡的是哪一步？' },
  { role: 'user' as const, content: '需求总改，我也不知道先做什么。' },
];

describe('recap 生成 - 正常场景', () => {
  it('标准对话可生成结构化 recap', async () => {
    const result = await generateRecapFromMessages(baseMessages, {
      invokeAI: async () => JSON.stringify({
        summary: '你现在被需求变化拉扯，但已经在主动找节奏。',
        blockers: ['优先级不稳定，执行顺序反复变化'],
        actions: ['整理明天最重要的3件事', '问导师确认优先级'],
        encouragement: '小舟陪你先稳住节奏，先做最小闭环就会有底气。',
      }),
    });

    expect(result.usedFallback).toBe(false);
    expect(result.errorType).toBeNull();
    expect(result.recap.summary.length).toBeGreaterThan(0);
    expect(result.recap.blockers.length).toBeGreaterThanOrEqual(1);
    expect(result.recap.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.recap.encouragement.length).toBeGreaterThan(0);
    expect(isValidRecap(result.recap)).toBe(true);
  });
});

describe('recap 生成 - 边界场景', () => {
  it('对话太短时仍返回可用 fallback recap', async () => {
    const result = await generateRecapFromMessages([
      { role: 'user', content: '有点乱' },
    ]);

    expect(result.usedFallback).toBe(true);
    expect(result.errorType).toBe('no_ai_provider');
    expect(isValidRecap(result.recap)).toBe(true);
  });

  it('超长上下文会被截断，不影响生成', async () => {
    const longMessages = Array.from({ length: 70 }).map((_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `第${index}轮：我在准备很多事情，感觉任务特别多，担心做不完。`.repeat(2),
    }));

    let receivedConversation = '';
    const result = await generateRecapFromMessages(longMessages, {
      invokeAI: async ({ conversation }) => {
        receivedConversation = conversation;
        return JSON.stringify({
          summary: '你在多任务切换中消耗很大，需要先收敛战线。',
          blockers: ['任务堆叠但优先级不清晰'],
          actions: ['整理明日待办，只留3件'],
          encouragement: '先划出主航道，小舟陪你稳稳往前。',
        });
      },
    });

    expect(receivedConversation.length).toBeLessThanOrEqual(3700);
    expect(result.usedFallback).toBe(false);
    expect(isValidRecap(result.recap)).toBe(true);
  });

  it('空内容输入时也能产出完整 recap', async () => {
    const result = await generateRecapFromMessages([
      { role: 'assistant', content: '' },
      { role: 'user', content: '   ' },
    ]);

    expect(result.usedFallback).toBe(true);
    expect(result.recap.summary.length).toBeGreaterThan(0);
    expect(result.recap.blockers.length).toBeGreaterThanOrEqual(1);
    expect(result.recap.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.recap.encouragement.length).toBeGreaterThan(0);
    expect(isValidRecap(result.recap)).toBe(true);
  });
});

describe('recap 生成 - 异常场景', () => {
  it('AI 超时时触发 fallback', async () => {
    const result = await generateRecapFromMessages(baseMessages, {
      invokeAI: async () => {
        const err = new Error('request timeout') as Error & { code?: string };
        err.code = 'AI_TIMEOUT';
        throw err;
      },
    });

    expect(result.usedFallback).toBe(true);
    expect(result.errorType).toBe('ai_timeout');
    expect(isValidRecap(result.recap)).toBe(true);
  });

  it('AI 返回脏格式时触发 fallback', async () => {
    const result = await generateRecapFromMessages(baseMessages, {
      invokeAI: async () => '你今天聊了很多，我们慢慢来，先休息下再说。',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.errorType).toBe('dirty_format');
    expect(isValidRecap(result.recap)).toBe(true);
  });
});

describe('recap 约束 - actions 规范化', () => {
  it('actions 会被限制在 1~3 条、<=30 字且含行动动词', async () => {
    const result = await generateRecapFromMessages(baseMessages, {
      invokeAI: async () => JSON.stringify({
        summary: '你知道问题在哪，但缺一个可执行起点。',
        blockers: ['计划很多但落地节奏混乱'],
        actions: [
          '把明天想做的事情都列得越细越好然后再开始执行',
          '优先级清单',
          '今天找同学聊聊并约一个30分钟结对',
          '第四条应该被截掉',
        ],
        encouragement: '先把船头对准方向，小舟在旁边给你看水流。',
      }),
    });

    expect(result.recap.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.recap.actions.length).toBeLessThanOrEqual(3);
    for (const action of result.recap.actions) {
      expect(action.length).toBeLessThanOrEqual(30);
      expect(hasActionVerb(action)).toBe(true);
    }
  });
});

describe('recap 回归 - 不影响既有模式与响应结构', () => {
  it('仅 chat / generate_recap 被视为可生成复盘卡模式', () => {
    expect(isRecapEligibleMode('chat')).toBe(true);
    expect(isRecapEligibleMode('generate_recap')).toBe(true);
    expect(isRecapEligibleMode('profile')).toBe(false);
    expect(isRecapEligibleMode('profile_other')).toBe(false);
    expect(isRecapEligibleMode('generate_report')).toBe(false);
  });

  it('成功/失败响应保持统一结构', () => {
    const success = buildRecapSuccessResponse({
      summary: 'summary',
      blockers: ['blocker'],
      actions: ['做一件小事'],
      encouragement: '继续向前',
    });
    const failure = buildRecapFailureResponse('AI_TIMEOUT', '请求超时');

    expect(success).toEqual({
      success: true,
      data: {
        message: '复盘卡已生成',
        recap: {
          summary: 'summary',
          blockers: ['blocker'],
          actions: ['做一件小事'],
          encouragement: '继续向前',
        },
      },
      error: null,
    });

    expect(failure).toEqual({
      success: false,
      data: null,
      error: { code: 'AI_TIMEOUT', message: '请求超时' },
    });
  });
});

