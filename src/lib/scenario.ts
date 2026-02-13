export type RelationshipScenario =
  | 'roommate_boundary'
  | 'coworker_collab'
  | 'leader_communication'
  | 'friend_conflict'
  | 'ambiguous_boundary';

export const RELATIONSHIP_SCENARIOS: readonly RelationshipScenario[] = [
  'roommate_boundary',
  'coworker_collab',
  'leader_communication',
  'friend_conflict',
  'ambiguous_boundary',
];

export interface ScenarioScript {
  relationship_judgment: string;
  communication_goal: string;
  script_a: string;
  script_b: string;
  pitfalls: string[];
  disclaimer: string;
}

interface ScenarioConfig {
  id: RelationshipScenario;
  label: string;
  description: string;
  knowledgeSource: string;
  boostKeywords: string[];
  template: ScenarioScript;
}

export interface ScenarioOption {
  id: RelationshipScenario;
  label: string;
  description: string;
}

const DEFAULT_DISCLAIMER = '仅基于你提供的信息做沟通参考，不构成医疗或法律结论。';

const SCENARIO_CONFIG: Record<RelationshipScenario, ScenarioConfig> = {
  roommate_boundary: {
    id: 'roommate_boundary',
    label: '室友边界',
    description: '适合处理借用、作息、卫生等边界摩擦',
    knowledgeSource: 'relationship_roommate',
    boostKeywords: ['室友', '宿舍', '边界', '借用', '作息', '卫生', '公共空间', '越界'],
    template: {
      relationship_judgment: '更像是边界未对齐导致的高频摩擦，不必先给对方贴人格标签。',
      communication_goal: '先对齐具体规则，再约定被触发后的处理方式。',
      script_a: '我想把相处规则说清楚：用我东西前先问一句，我会更安心；我也会提前说哪些可以共用。',
      script_b: '这条我要明确：未经同意不要动我的私人物品；再发生我会把公共和私人区域彻底分开。',
      pitfalls: ['上来翻旧账，会让对方只想自保。', '只说“你总是”，却不给可执行规则。'],
      disclaimer: DEFAULT_DISCLAIMER,
    },
  },
  coworker_collab: {
    id: 'coworker_collab',
    label: '同事协作',
    description: '适合任务不清、配合低效、推诿责任等场景',
    knowledgeSource: 'relationship_coworker',
    boostKeywords: ['同事', '协作', '交付', '对齐', '项目', '责任', '进度', '配合'],
    template: {
      relationship_judgment: '核心冲突多半在协作机制，而不是个人能力高低。',
      communication_goal: '把目标、分工和截止时间一次性对齐，减少反复拉扯。',
      script_a: '我希望这次我们把分工写清楚：你负责 A，我负责 B，周四前互相同步一次，这样更稳。',
      script_b: '我需要明确边界：这部分不在我职责内；如果要我接手，请同步优先级和截止时间。',
      pitfalls: ['当众点名指责，容易把协作问题变成对立。', '只提情绪，不提交付标准。'],
      disclaimer: DEFAULT_DISCLAIMER,
    },
  },
  leader_communication: {
    id: 'leader_communication',
    label: '领导沟通',
    description: '适合汇报、预期管理、资源争取和反馈沟通',
    knowledgeSource: 'relationship_leader',
    boostKeywords: ['领导', '上级', '汇报', '优先级', '资源', '预期', '绩效', '反馈'],
    template: {
      relationship_judgment: '更可能是预期和信息差问题，不一定是针对你个人。',
      communication_goal: '先同步目标与优先级，再给可执行方案和风险预案。',
      script_a: '我先同步下当前进度和风险：按现有资源能在周五交付版本一；若要提前，需要减少范围或加支持。',
      script_b: '我需要你帮我拍板优先级：A 和 B 只能先做一个，请你定主次，我按结果负责推进。',
      pitfalls: ['只报问题不报方案，会被认为推进力不足。', '情绪化反驳，忽略决策语境。'],
      disclaimer: DEFAULT_DISCLAIMER,
    },
  },
  friend_conflict: {
    id: 'friend_conflict',
    label: '朋友冲突',
    description: '适合误会、失约、界限感受损等朋友关系修复',
    knowledgeSource: 'relationship_friend',
    boostKeywords: ['朋友', '误会', '冲突', '失约', '冷战', '受伤', '关系修复', '信任'],
    template: {
      relationship_judgment: '关系仍有修复空间，关键在于先处理情绪再谈对错。',
      communication_goal: '把感受和期待说清楚，确认是否还愿意继续投入这段关系。',
      script_a: '那天的事让我有点受伤，我更在意的是被忽视的感觉；我想听听你当时怎么想的。',
      script_b: '我得直接说：如果类似情况继续发生，我会把关系往普通朋友调整，先保护自己。',
      pitfalls: ['拿“你变了”做定性，容易把谈话锁死。', '逼对方立刻给结论，忽略缓冲时间。'],
      disclaimer: DEFAULT_DISCLAIMER,
    },
  },
  ambiguous_boundary: {
    id: 'ambiguous_boundary',
    label: '暧昧边界',
    description: '适合关系不明、期待不一致和边界试探场景',
    knowledgeSource: 'relationship_ambiguous',
    boostKeywords: ['暧昧', '边界', '关系定位', '试探', '拉扯', '不确定', '承诺', '暧昧对象'],
    template: {
      relationship_judgment: '当前是关系定义不清导致的反复拉扯，不确定本身就在消耗你。',
      communication_goal: '明确彼此期待和边界，避免继续在灰色地带反复投入。',
      script_a: '我想确认我们的关系期待：我对你有好感，也希望彼此边界清楚，不想一直猜来猜去。',
      script_b: '我需要一个明确方向：如果你只想停在暧昧阶段，我会主动拉开距离，避免继续投入。',
      pitfalls: ['把试探当承诺，容易自我加码。', '不说需求只等对方“懂你”。'],
      disclaimer: DEFAULT_DISCLAIMER,
    },
  },
};

const SCENARIO_ALIAS_MAP: Record<string, RelationshipScenario> = {
  roommate: 'roommate_boundary',
  roommate_boundary: 'roommate_boundary',
  roomate_boundary: 'roommate_boundary',
  室友: 'roommate_boundary',
  室友边界: 'roommate_boundary',
  coworker: 'coworker_collab',
  coworker_collab: 'coworker_collab',
  colleague_collab: 'coworker_collab',
  同事: 'coworker_collab',
  同事协作: 'coworker_collab',
  leader: 'leader_communication',
  leader_communication: 'leader_communication',
  manager_communication: 'leader_communication',
  领导: 'leader_communication',
  领导沟通: 'leader_communication',
  friend: 'friend_conflict',
  friend_conflict: 'friend_conflict',
  friendship_conflict: 'friend_conflict',
  朋友: 'friend_conflict',
  朋友冲突: 'friend_conflict',
  ambiguous: 'ambiguous_boundary',
  ambiguous_boundary: 'ambiguous_boundary',
  flirt_boundary: 'ambiguous_boundary',
  暧昧: 'ambiguous_boundary',
  暧昧边界: 'ambiguous_boundary',
};

export type ScenarioAnalyticsEventName =
  | 'scenario_selected'
  | 'scenario_response_generated'
  | 'scenario_script_copied';

export interface ScenarioAnalyticsPayload {
  scenario: RelationshipScenario | null;
  success?: boolean;
  latency_ms?: number;
  error_type?: string;
}

interface ScenarioAnalyticsEnvelope {
  event: ScenarioAnalyticsEventName;
  payload: Required<Pick<ScenarioAnalyticsPayload, 'success' | 'latency_ms' | 'error_type'>> & ScenarioAnalyticsPayload;
  timestamp: string;
}

export function normalizeScenario(input?: string | null): RelationshipScenario | null {
  if (typeof input !== 'string') return null;
  const key = input.trim().toLowerCase();
  if (!key) return null;
  return SCENARIO_ALIAS_MAP[key] ?? null;
}

export function getScenarioOptions(): ScenarioOption[] {
  return RELATIONSHIP_SCENARIOS.map(id => ({
    id,
    label: SCENARIO_CONFIG[id].label,
    description: SCENARIO_CONFIG[id].description,
  }));
}

export function getScenarioKnowledgeSource(scenario: RelationshipScenario): string {
  return SCENARIO_CONFIG[scenario].knowledgeSource;
}

export function getScenarioBoostKeywords(scenario: RelationshipScenario): string[] {
  return [...SCENARIO_CONFIG[scenario].boostKeywords];
}

export function getScenarioTemplate(scenario: RelationshipScenario): ScenarioScript {
  const template = SCENARIO_CONFIG[scenario].template;
  return {
    relationship_judgment: template.relationship_judgment,
    communication_goal: template.communication_goal,
    script_a: template.script_a,
    script_b: template.script_b,
    pitfalls: [...template.pitfalls],
    disclaimer: template.disclaimer,
  };
}

export function buildScenarioSystemPrompt(scenario: RelationshipScenario): string {
  const config = SCENARIO_CONFIG[scenario];
  return [
    `当前场景：${config.label}（${config.id}）`,
    '',
    '请输出严格 JSON，不要输出 markdown，不要输出多余解释：',
    '{',
    '  "relationship_judgment": "关系判断（简版，1-2句）",',
    '  "communication_goal": "沟通目标（1句）",',
    '  "script_a": "话术A（温和，1-3行）",',
    '  "script_b": "话术B（直接，1-3行）",',
    '  "pitfalls": ["避坑点1", "避坑点2"],',
    '  "disclaimer": "仅基于你提供的信息做沟通参考，不构成医疗或法律结论。"',
    '}',
    '',
    '要求：',
    '- 紧扣场景，不做医疗/法律结论',
    '- 话术控制在移动端友好长度，避免大段说教',
    '- 避坑点保持 1-2 条',
  ].join('\n');
}

export interface ScenarioParseResult {
  script: ScenarioScript;
  usedFallback: boolean;
}

export function parseScenarioModelOutput(raw: string, scenario: RelationshipScenario): ScenarioParseResult {
  const parsed = tryParseJsonObject(raw);
  const fromJson = parsed ? toScenarioScript(parsed) : null;

  if (fromJson) {
    return { script: fromJson, usedFallback: false };
  }

  return {
    script: getScenarioTemplate(scenario),
    usedFallback: true,
  };
}

export function formatScenarioScript(script: ScenarioScript): string {
  const pitfalls = script.pitfalls.slice(0, 2).map(item => `- ${item}`).join('\n');
  return [
    `关系判断（简版）：${script.relationship_judgment}`,
    '',
    `沟通目标：${script.communication_goal}`,
    '',
    `话术A（温和）：${script.script_a}`,
    '',
    `话术B（直接）：${script.script_b}`,
    '',
    '避坑点：',
    pitfalls,
    '',
    `免责声明：${script.disclaimer || DEFAULT_DISCLAIMER}`,
  ].join('\n');
}

function normalizePayload(payload: ScenarioAnalyticsPayload): ScenarioAnalyticsEnvelope['payload'] {
  const success = typeof payload.success === 'boolean' ? payload.success : true;
  const latencyMsRaw = typeof payload.latency_ms === 'number' ? payload.latency_ms : 0;
  const latency_ms = Number.isFinite(latencyMsRaw) ? Math.max(0, Math.round(latencyMsRaw)) : 0;
  const error_type = typeof payload.error_type === 'string' && payload.error_type.trim()
    ? payload.error_type
    : 'none';

  return {
    ...payload,
    success,
    latency_ms,
    error_type,
  };
}

export function createScenarioAnalyticsEnvelope(
  event: ScenarioAnalyticsEventName,
  payload: ScenarioAnalyticsPayload
): ScenarioAnalyticsEnvelope {
  return {
    event,
    payload: normalizePayload(payload),
    timestamp: new Date().toISOString(),
  };
}

export function trackScenarioEvent(event: ScenarioAnalyticsEventName, payload: ScenarioAnalyticsPayload): void {
  const envelope = createScenarioAnalyticsEnvelope(event, payload);
  console.info('[analytics]', envelope);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cyber-guide:analytics', {
        detail: envelope,
      })
    );
  }
}

export function trackScenarioSelected(scenario: RelationshipScenario | null): void {
  trackScenarioEvent('scenario_selected', {
    scenario,
    success: true,
    latency_ms: 0,
    error_type: 'none',
  });
}

export function trackScenarioResponseGenerated(
  scenario: RelationshipScenario | null,
  payload: Omit<ScenarioAnalyticsPayload, 'scenario'>
): void {
  trackScenarioEvent('scenario_response_generated', { scenario, ...payload });
}

export function trackScenarioScriptCopied(
  scenario: RelationshipScenario | null,
  payload: Omit<ScenarioAnalyticsPayload, 'scenario'>
): void {
  trackScenarioEvent('scenario_script_copied', { scenario, ...payload });
}

function toScenarioScript(value: unknown): ScenarioScript | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  const relationship_judgment = pickString(obj, ['relationship_judgment', 'relationshipJudgment', '关系判断']);
  const communication_goal = pickString(obj, ['communication_goal', 'communicationGoal', '沟通目标']);
  const script_a = pickString(obj, ['script_a', 'scriptA', '话术A']);
  const script_b = pickString(obj, ['script_b', 'scriptB', '话术B']);
  const pitfalls = pickPitfalls(obj);
  const disclaimer = pickString(obj, ['disclaimer', '免责声明']) || DEFAULT_DISCLAIMER;

  if (!relationship_judgment || !communication_goal || !script_a || !script_b || pitfalls.length === 0) {
    return null;
  }

  return {
    relationship_judgment: shortenLine(relationship_judgment, 80),
    communication_goal: shortenLine(communication_goal, 72),
    script_a: shortenLine(script_a, 120),
    script_b: shortenLine(script_b, 120),
    pitfalls: pitfalls.slice(0, 2).map(item => shortenLine(item, 52)),
    disclaimer: shortenLine(disclaimer, 72),
  };
}

function pickPitfalls(obj: Record<string, unknown>): string[] {
  const raw = obj.pitfalls ?? obj['避坑点'];
  if (Array.isArray(raw)) {
    return raw
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\n|；;]/)
      .map(item => item.replace(/^[-*•\d.\s]+/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function shortenLine(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 3)}...`;
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch?.[1]?.trim() || trimmed;

  const direct = tryJsonParse(candidate);
  if (isPlainObject(direct)) return direct;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const sliced = candidate.slice(start, end + 1);
    const fromSlice = tryJsonParse(sliced);
    if (isPlainObject(fromSlice)) return fromSlice;
  }

  return null;
}

function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

