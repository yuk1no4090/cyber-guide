import { describe, expect, it } from 'vitest';
import {
  RELATIONSHIP_SCENARIOS,
  buildScenarioSystemPrompt,
  createScenarioAnalyticsEnvelope,
  formatScenarioScript,
  getScenarioKnowledgeSource,
  getScenarioTemplate,
  normalizeScenario,
  parseScenarioModelOutput,
} from '@/lib/scenario';
import { retrieve } from '@/lib/rag';

describe('profile_other 场景参数解析', () => {
  it('支持英文 id、英文别名、中文别名', () => {
    expect(normalizeScenario('roommate_boundary')).toBe('roommate_boundary');
    expect(normalizeScenario('coworker')).toBe('coworker_collab');
    expect(normalizeScenario('领导沟通')).toBe('leader_communication');
    expect(normalizeScenario('朋友')).toBe('friend_conflict');
    expect(normalizeScenario('暧昧')).toBe('ambiguous_boundary');
  });

  it('无效场景返回 null', () => {
    expect(normalizeScenario('unknown')).toBeNull();
    expect(normalizeScenario('')).toBeNull();
    expect(normalizeScenario(undefined)).toBeNull();
  });
});

describe('5 个关系场景模板', () => {
  for (const scenario of RELATIONSHIP_SCENARIOS) {
    it(`${scenario} 包含完整结构`, () => {
      const script = getScenarioTemplate(scenario);
      const text = formatScenarioScript(script);
      const prompt = buildScenarioSystemPrompt(scenario);

      expect(script.relationship_judgment.length).toBeGreaterThan(0);
      expect(script.communication_goal.length).toBeGreaterThan(0);
      expect(script.script_a.length).toBeGreaterThan(0);
      expect(script.script_b.length).toBeGreaterThan(0);
      expect(script.pitfalls.length).toBeGreaterThanOrEqual(1);
      expect(script.pitfalls.length).toBeLessThanOrEqual(2);

      expect(text).toContain('关系判断（简版）');
      expect(text).toContain('沟通目标');
      expect(text).toContain('话术A（温和）');
      expect(text).toContain('话术B（直接）');
      expect(text).toContain('避坑点');
      expect(text).toContain('免责声明');

      expect(prompt).toContain('请输出严格 JSON');
      expect(prompt).toContain('"relationship_judgment"');
    });
  }
});

describe('结构化解析与 fallback', () => {
  it('当 AI 返回合法 JSON 时优先使用结构化结果', () => {
    const raw = JSON.stringify({
      relationship_judgment: '关系处于边界磨合期。',
      communication_goal: '先对齐规则再谈情绪。',
      script_a: '我想先把规则说清楚。',
      script_b: '这条边界我必须明确。',
      pitfalls: ['别翻旧账'],
      disclaimer: '仅供沟通参考，不构成医疗或法律结论。',
    });

    const parsed = parseScenarioModelOutput(raw, 'roommate_boundary');
    expect(parsed.usedFallback).toBe(false);
    expect(parsed.script.relationship_judgment).toContain('边界磨合');
    expect(parsed.script.pitfalls).toEqual(['别翻旧账']);
  });

  it('当 AI 返回格式异常时 fallback 到场景模板', () => {
    const parsed = parseScenarioModelOutput('这不是 JSON 格式，也没有稳定字段', 'friend_conflict');
    expect(parsed.usedFallback).toBe(true);
    expect(parsed.script).toEqual(getScenarioTemplate('friend_conflict'));
  });
});

describe('RAG 场景 boost', () => {
  for (const scenario of RELATIONSHIP_SCENARIOS) {
    it(`${scenario} 在读人模式下优先对应场景知识`, () => {
      const results = retrieve(
        '我们最近关系很拧巴，我想要一套更好落地的沟通话术',
        5,
        { mode: 'profile_other', scenario }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.source).toBe(getScenarioKnowledgeSource(scenario));
    });
  }
});

describe('回归：非场景路径不受影响', () => {
  it('普通 chat 模式即使传入 scenario 也保持原检索结果', () => {
    const query = '最近有点焦虑和失眠，想找呼吸放松的办法';
    const baseline = retrieve(query, 5);
    const withScenarioInChat = retrieve(query, 5, {
      mode: 'chat',
      scenario: 'roommate_boundary',
    });

    expect(withScenarioInChat).toEqual(baseline);
  });

  it('profile 模式与 profile_other(无scenario)保持默认检索行为', () => {
    const query = '最近压力很大，容易烦躁，想学会稳定情绪';
    const baseline = retrieve(query, 5);
    const profileResult = retrieve(query, 5, { mode: 'profile' });
    const profileOtherWithoutScenario = retrieve(query, 5, { mode: 'profile_other' });

    expect(profileResult).toEqual(baseline);
    expect(profileOtherWithoutScenario).toEqual(baseline);
  });
});

describe('场景埋点 envelope', () => {
  it('scenario 事件包含 required 字段', () => {
    const envelope = createScenarioAnalyticsEnvelope('scenario_response_generated', {
      scenario: 'leader_communication',
      success: false,
      latency_ms: 1320.8,
      error_type: 'ai_format_error',
    });

    expect(envelope.event).toBe('scenario_response_generated');
    expect(envelope.payload.scenario).toBe('leader_communication');
    expect(envelope.payload.success).toBe(false);
    expect(envelope.payload.latency_ms).toBe(1321);
    expect(envelope.payload.error_type).toBe('ai_format_error');
  });
});

