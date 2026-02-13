export interface RecapMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Recap {
  summary: string;
  blockers: string[];
  actions: string[];
  encouragement: string;
}

export interface RecapApiErrorPayload {
  code: string;
  message: string;
}

export interface RecapApiSuccessResponse {
  success: true;
  data: {
    message: string;
    recap: Recap;
  };
  error: null;
}

export interface RecapApiFailureResponse {
  success: false;
  data: null;
  error: RecapApiErrorPayload;
}

export type RecapApiResponse = RecapApiSuccessResponse | RecapApiFailureResponse;

export interface RecapPromptInput {
  systemPrompt: string;
  conversation: string;
}

export interface GenerateRecapOptions {
  invokeAI?: (input: RecapPromptInput) => Promise<string>;
  now?: () => number;
}

export interface GenerateRecapResult {
  message: string;
  recap: Recap;
  usedFallback: boolean;
  errorType: string | null;
  latencyMs: number;
}

const MAX_CONTEXT_CHARS = 3600;

export const ACTION_VERBS = [
  '做',
  '写',
  '发',
  '问',
  '整理',
  '复习',
  '提交',
  '列',
  '联系',
  '确认',
  '安排',
  '尝试',
  '完成',
  '检查',
  '沟通',
  '规划',
] as const;

const ACTION_VERB_REGEX = new RegExp(ACTION_VERBS.join('|'));

const RECAP_SYSTEM_PROMPT = [
  '你是小舟🛶，请基于对话生成“对话复盘卡”。',
  '只允许输出 JSON，不要输出任何额外解释。',
  'JSON 结构必须是：',
  '{"summary":"", "blockers":[""], "actions":[""], "encouragement":""}',
  '要求：',
  '1) summary 一句话',
  '2) blockers 1-2 条',
  '3) actions 1-3 条，且每条 <=30 字，并且包含行动动词（做/写/发/问/整理/复习/提交等）',
  '4) encouragement 用小舟风格，真诚、不鸡汤',
].join('\n');

type PartialRecap = Partial<Recap>;

interface RecapRule {
  pattern: RegExp;
  blocker: string;
  action: string;
}

const BLOCKER_RULES: RecapRule[] = [
  {
    pattern: /(迷茫|不知道|不确定|方向|选择|纠结)/i,
    blocker: '方向感还不够清晰，决策容易反复',
    action: '写下3个方向并各列1步',
  },
  {
    pattern: /(拖延|动不起来|执行不了|坚持不住|不行动)/i,
    blocker: '启动门槛偏高，容易想很多做很少',
    action: '做25分钟最小任务并打卡',
  },
  {
    pattern: /(焦虑|压力|害怕|担心|紧张|内耗)/i,
    blocker: '情绪压力偏高，正在挤占执行力',
    action: '整理明日待办，只留3件',
  },
  {
    pattern: /(时间|太忙|任务多|安排不过来|排不开)/i,
    blocker: '任务堆叠但优先级不清晰',
    action: '做一张明日时间块安排表',
  },
  {
    pattern: /(沟通|室友|同学|老师|领导|同事|关系|表达)/i,
    blocker: '沟通目标不够明确，表达成本偏高',
    action: '问对方一个关键问题确认预期',
  },
];

const DEFAULT_BLOCKERS = ['下一步还不够具体，行动路径需要再收敛'];
const DEFAULT_ACTIONS = ['做一件10分钟可完成的小事'];
const DEFAULT_ENCOURAGEMENT = '小舟陪你先划一小段，先动一步，水面就会慢慢开阔。';

export function isRecapEligibleMode(mode: string | undefined): boolean {
  return mode === 'chat' || mode === 'generate_recap';
}

export function buildRecapSuccessResponse(recap: Recap, message = '复盘卡已生成'): RecapApiSuccessResponse {
  return {
    success: true,
    data: {
      message,
      recap,
    },
    error: null,
  };
}

export function buildRecapFailureResponse(code: string, message: string): RecapApiFailureResponse {
  return {
    success: false,
    data: null,
    error: { code, message },
  };
}

export function hasActionVerb(text: string): boolean {
  return ACTION_VERB_REGEX.test(text);
}

export function isValidRecap(recap: Recap): boolean {
  if (!recap.summary.trim() || !recap.encouragement.trim()) return false;
  if (recap.blockers.length < 1 || recap.blockers.length > 2) return false;
  if (recap.actions.length < 1 || recap.actions.length > 3) return false;
  return recap.actions.every(action => action.length <= 30 && hasActionVerb(action));
}

export function buildRecapPrompt(messages: RecapMessage[]): RecapPromptInput {
  return {
    systemPrompt: RECAP_SYSTEM_PROMPT,
    conversation: formatConversation(messages),
  };
}

export async function generateRecapFromMessages(
  messages: RecapMessage[],
  options: GenerateRecapOptions = {}
): Promise<GenerateRecapResult> {
  const now = options.now ?? (() => Date.now());
  const started = now();

  let usedFallback = false;
  let errorType: string | null = null;
  let recap: Recap;

  if (!options.invokeAI) {
    usedFallback = true;
    errorType = 'no_ai_provider';
    recap = buildKeywordFallbackRecap(messages);
  } else {
    try {
      const prompt = buildRecapPrompt(messages);
      const rawOutput = await options.invokeAI(prompt);
      const parsed = parseRecapFromAIOutput(rawOutput);
      if (!parsed || !isStructuredRecap(parsed)) {
        usedFallback = true;
        errorType = 'dirty_format';
        recap = buildKeywordFallbackRecap(messages);
      } else {
        recap = sanitizeRecap(parsed, messages);
      }
    } catch (error) {
      usedFallback = true;
      errorType = classifyRecapError(error);
      recap = buildKeywordFallbackRecap(messages);
    }
  }

  const latencyMs = Math.max(0, now() - started);
  return {
    message: usedFallback ? '复盘卡已生成（稳妥模式）' : '复盘卡已生成',
    recap,
    usedFallback,
    errorType,
    latencyMs,
  };
}

export function buildKeywordFallbackRecap(messages: RecapMessage[]): Recap {
  const userTexts = messages
    .filter(m => m.role === 'user')
    .map(m => normalizeInlineText(m.content))
    .filter(Boolean);

  const mergedText = userTexts.join(' ');
  const blockers = detectBlockers(mergedText);
  const actions = sanitizeActions(
    detectActionsFromBlockers(blockers),
    DEFAULT_ACTIONS
  );

  const summary = buildFallbackSummary(userTexts);
  const encouragement = DEFAULT_ENCOURAGEMENT;

  return {
    summary,
    blockers,
    actions,
    encouragement,
  };
}

function parseRecapFromAIOutput(rawOutput: string): PartialRecap | null {
  const text = normalizeMultiline(rawOutput);
  if (!text) return null;

  const jsonCandidates = extractJsonCandidates(text);
  for (const candidate of jsonCandidates) {
    const parsed = safeParseJson(candidate);
    if (parsed && typeof parsed === 'object') {
      return extractRecapFromObject(parsed as Record<string, unknown>);
    }
  }

  return parseRecapFromSections(text);
}

function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;

  let match = fencedRegex.exec(text);
  while (match) {
    const candidate = match[1]?.trim();
    if (candidate) candidates.push(candidate);
    match = fencedRegex.exec(text);
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  return uniqueStrings(candidates);
}

function safeParseJson(input: string): unknown {
  const normalized = input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function extractRecapFromObject(obj: Record<string, unknown>): PartialRecap {
  const summary = pickFirstString(obj, ['summary', '当前状态', '一句话概括', '一句话']);
  const blockers = pickFirstList(obj, ['blockers', '核心卡点', '卡点', '阻碍']);
  const actions = pickFirstList(obj, ['actions', '小动作', '行动', '明天前行动']);
  const encouragement = pickFirstString(obj, ['encouragement', '鼓励句', '鼓励']);

  return { summary, blockers, actions, encouragement };
}

function parseRecapFromSections(text: string): PartialRecap | null {
  const lines = normalizeMultiline(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  let summary = '';
  let encouragement = '';
  const blockers: string[] = [];
  const actions: string[] = [];
  let current: 'blockers' | 'actions' | null = null;

  for (const originalLine of lines) {
    const line = originalLine.replace(/^[-*•\d.、)\s]+/, '').trim();

    if (isSummaryLine(line)) {
      const value = extractAfterColon(line);
      if (value) summary = value;
      current = null;
      continue;
    }

    if (isBlockerLine(line)) {
      const value = extractAfterColon(line);
      if (value) blockers.push(value);
      current = 'blockers';
      continue;
    }

    if (isActionLine(line)) {
      const value = extractAfterColon(line);
      if (value) actions.push(value);
      current = 'actions';
      continue;
    }

    if (isEncouragementLine(line)) {
      const value = extractAfterColon(line);
      encouragement = value || line;
      current = null;
      continue;
    }

    if (current === 'blockers') blockers.push(line);
    if (current === 'actions') actions.push(line);
  }

  const parsed: PartialRecap = {
    summary,
    blockers,
    actions,
    encouragement,
  };

  return parsed;
}

function isStructuredRecap(recap: PartialRecap): recap is Recap {
  return Boolean(
    recap.summary?.trim()
    && recap.encouragement?.trim()
    && recap.blockers?.length
    && recap.actions?.length
  );
}

function sanitizeRecap(input: PartialRecap, messages: RecapMessage[]): Recap {
  const fallback = buildKeywordFallbackRecap(messages);

  const summary = normalizeOneSentence(input.summary) || fallback.summary;
  const blockers = sanitizeBlockers(input.blockers, fallback.blockers);
  const actions = sanitizeActions(input.actions, fallback.actions);
  const encouragement = normalizeOneSentence(input.encouragement) || fallback.encouragement;

  return { summary, blockers, actions, encouragement };
}

function sanitizeBlockers(input: string[] | undefined, fallback: string[]): string[] {
  const source = input ?? [];
  const cleaned: string[] = [];

  for (const item of source) {
    const normalized = normalizeOneSentence(item);
    if (!normalized) continue;
    if (cleaned.includes(normalized)) continue;
    cleaned.push(normalized);
    if (cleaned.length >= 2) break;
  }

  if (cleaned.length > 0) return cleaned;
  return fallback.slice(0, 2);
}

function sanitizeActions(input: string[] | undefined, fallback: string[]): string[] {
  const source = input ?? [];
  const cleaned: string[] = [];

  for (const item of source) {
    const normalized = sanitizeAction(item);
    if (!normalized) continue;
    if (cleaned.includes(normalized)) continue;
    cleaned.push(normalized);
    if (cleaned.length >= 3) break;
  }

  if (cleaned.length > 0) return cleaned;

  const fallbackActions: string[] = [];
  for (const item of fallback) {
    const normalized = sanitizeAction(item);
    if (!normalized) continue;
    if (fallbackActions.includes(normalized)) continue;
    fallbackActions.push(normalized);
    if (fallbackActions.length >= 3) break;
  }

  return fallbackActions.length > 0 ? fallbackActions : ['做一件10分钟可完成的小事'];
}

function sanitizeAction(raw: string): string | null {
  let action = normalizeOneSentence(raw)
    .replace(/^行动\d*[:：]\s*/, '')
    .replace(/^第?\d+[)）.、:\s-]*/, '');

  if (!action) return null;

  if (!hasActionVerb(action)) {
    action = `做${action}`;
  }

  action = truncateText(action, 30);
  if (!hasActionVerb(action)) {
    action = truncateText(`做${action}`, 30);
  }

  return action || null;
}

function detectBlockers(text: string): string[] {
  const normalized = normalizeInlineText(text);
  if (!normalized) return [...DEFAULT_BLOCKERS];

  const blockers: string[] = [];

  for (const rule of BLOCKER_RULES) {
    if (!rule.pattern.test(normalized)) continue;
    if (!blockers.includes(rule.blocker)) blockers.push(rule.blocker);
    if (blockers.length >= 2) break;
  }

  return blockers.length > 0 ? blockers : [...DEFAULT_BLOCKERS];
}

function detectActionsFromBlockers(blockers: string[]): string[] {
  const actions: string[] = [];

  for (const blocker of blockers) {
    const match = BLOCKER_RULES.find(rule => rule.blocker === blocker);
    if (!match) continue;
    if (!actions.includes(match.action)) actions.push(match.action);
  }

  if (actions.length === 0) return [...DEFAULT_ACTIONS];
  return actions;
}

function buildFallbackSummary(userTexts: string[]): string {
  const latest = [...userTexts].reverse().find(Boolean);
  if (!latest) {
    return '你正在努力把问题说清楚，并愿意往前迈一步。';
  }

  const topic = truncateText(latest, 18);
  return `你最近在为「${topic}」卡住，但已经开始主动梳理。`;
}

function classifyRecapError(error: unknown): string {
  const e = error as { code?: string; name?: string; message?: string };
  if (e?.code === 'AI_TIMEOUT') return 'ai_timeout';
  if (e?.name === 'AbortError') return 'ai_timeout';
  if (typeof e?.message === 'string' && /timeout|timed out|超时/i.test(e.message)) {
    return 'ai_timeout';
  }
  return 'ai_error';
}

function formatConversation(messages: RecapMessage[]): string {
  const normalizedMessages = messages
    .map(m => ({
      role: m.role,
      content: normalizeInlineText(m.content),
    }))
    .filter(m => m.content.length > 0);

  const lines = normalizedMessages.map((m, index) => {
    const roleLabel = m.role === 'user' ? '用户' : m.role === 'assistant' ? '小舟' : '系统';
    return `${index + 1}. ${roleLabel}: ${m.content}`;
  });

  const full = lines.join('\n');
  if (full.length <= MAX_CONTEXT_CHARS) return full;

  return `[前文已截断，保留最近对话]\n${full.slice(-MAX_CONTEXT_CHARS)}`;
}

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickFirstList(obj: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) {
      const list = value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean);
      if (list.length > 0) return list;
    }
    if (typeof value === 'string' && value.trim()) {
      const list = value
        .split(/[|｜\n,，;；]/)
        .map(item => item.trim())
        .filter(Boolean);
      if (list.length > 0) return list;
    }
  }
  return [];
}

function isSummaryLine(line: string): boolean {
  return /^(summary|当前状态|一句话|一句话概括|状态)\s*[:：]?/i.test(line);
}

function isBlockerLine(line: string): boolean {
  return /^(blockers?|核心卡点|卡点|阻碍)\s*[:：]?/i.test(line);
}

function isActionLine(line: string): boolean {
  return /^(actions?|小动作|行动|明天前可做)\s*[:：]?/i.test(line);
}

function isEncouragementLine(line: string): boolean {
  return /^(encouragement|鼓励句|鼓励)\s*[:：]?/i.test(line);
}

function extractAfterColon(line: string): string {
  const parts = line.split(/[:：]/);
  if (parts.length < 2) return '';
  return parts.slice(1).join(':').trim();
}

function normalizeMultiline(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F]/g, '')
    .trim();
}

function normalizeOneSentence(text: string | undefined): string {
  if (!text) return '';
  return normalizeInlineText(text).replace(/[。!?！？]+$/g, '');
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/[，,。.!?？、;；\s]+$/g, '');
}

function uniqueStrings(input: string[]): string[] {
  const output: string[] = [];
  for (const item of input) {
    if (!output.includes(item)) output.push(item);
  }
  return output;
}

