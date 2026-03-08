import { NextRequest, NextResponse } from 'next/server';
import type OpenAI from 'openai';
import { openai, CHAT_MODEL, FALLBACK_MODEL } from '@/lib/openai';
import { checkModeration, CRISIS_RESPONSE } from '@/lib/moderation';
import { retrieve, formatEvidence } from '@/lib/rag';
import { getSystemPrompt, getPromptVersion } from '@/lib/prompt';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { ndjsonResponse, openaiStreamToNDJSON } from '@/lib/stream';
import {
  buildRecapFailureResponse,
  buildRecapSuccessResponse,
  generateRecapFromMessages,
} from '@/lib/recap';
import {
  buildScenarioSystemPrompt,
  formatScenarioScript,
  normalizeScenario,
  parseScenarioModelOutput,
  trackScenarioResponseGenerated,
} from '@/lib/scenario';
import type { ActionPlanRow, ActionPlanStatus } from '@/lib/supabase';
import { pickOne, pickN } from '@/lib/random';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const runtime = 'nodejs';

function getIntEnv(name: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;

  if (typeof opts?.min === 'number' && parsed < opts.min) return opts.min;
  if (typeof opts?.max === 'number' && parsed > opts.max) return opts.max;

  return parsed;
}

const MAX_HISTORY_MESSAGES = 8;
const MAX_OUTPUT_TOKENS = 400;
const MAX_REPORT_TOKENS = 800;
const OPENAI_TIMEOUT_MS = getIntEnv('OPENAI_TIMEOUT_MS', 25_000, { min: 5_000, max: 120_000 });
const OPENAI_MAX_RETRIES = getIntEnv('OPENAI_MAX_RETRIES', 0, { min: 0, max: 2 });
const CHAT_CONTEXT_MAX_CHARS = getIntEnv('CHAT_CONTEXT_MAX_CHARS', 2_800, { min: 800, max: 12_000 });
const REPORT_CONTEXT_MAX_CHARS = getIntEnv('REPORT_CONTEXT_MAX_CHARS', 4_000, { min: 1_500, max: 16_000 });
const CONTEXT_MAX_SINGLE_MESSAGE_CHARS = getIntEnv('CONTEXT_MAX_SINGLE_MESSAGE_CHARS', 900, { min: 200, max: 4_000 });
const RAG_DEFAULT_TOP_K = 2;
const RAG_REDUCED_TOP_K = 1;
const RAG_REDUCE_CONTEXT_THRESHOLD_CHARS = getIntEnv('RAG_REDUCE_CONTEXT_THRESHOLD_CHARS', 2_400, {
  min: 800,
  max: 10_000,
});

export interface ChatRequest {
  messages: Message[];
  mode?: 'chat' | 'profile' | 'profile_other' | 'generate_report' | 'generate_report_other' | 'generate_recap';
  scenario?: string | null;
  session_id?: string | null;
}

export interface ChatResponse {
  message: string;
  suggestions: string[];
  isCrisis?: boolean;
  isReport?: boolean;
  scenario?: string | null;
  promptVersion?: string;
}

/**
 * 智能截断：始终保留前 2 条消息（用户自我介绍），再保留最近的消息
 */
function smartTruncate(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;

  // 保留前 2 条（通常是欢迎+用户第一句话，包含关键身份信息）
  const head = messages.slice(0, 2);
  // 保留最近的消息
  const tail = messages.slice(-(maxMessages - 2));

  return [...head, ...tail];
}

function clipContent(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 60) return text.slice(0, maxChars);

  // 同时保留开头和结尾，减少关键信息被截断的概率
  const headLen = Math.max(30, Math.floor(maxChars * 0.65));
  const tailLen = Math.max(20, maxChars - headLen - 11);
  return `${text.slice(0, headLen)}\n...[省略]...\n${text.slice(-tailLen)}`;
}

function getMessagesCharCount(messages: Message[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function buildContextMessages(messages: Message[], opts?: { maxChars?: number }): Message[] {
  const maxChars = opts?.maxChars ?? CHAT_CONTEXT_MAX_CHARS;
  const byCount = smartTruncate(messages, MAX_HISTORY_MESSAGES);
  const normalized = byCount.map((message) => ({
    ...message,
    content: clipContent(message.content, CONTEXT_MAX_SINGLE_MESSAGE_CHARS),
  }));

  if (getMessagesCharCount(normalized) <= maxChars) return normalized;

  const head = normalized.slice(0, Math.min(2, normalized.length));
  const tail = normalized.slice(head.length);
  const headChars = getMessagesCharCount(head);
  const budgetForTail = Math.max(0, maxChars - headChars);

  const keptTail: Message[] = [];
  let used = 0;
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const msg = tail[i];
    const msgLen = msg.content.length;
    if (used + msgLen > budgetForTail) continue;
    keptTail.unshift(msg);
    used += msgLen;
  }

  return [...head, ...keptTail];
}

function getRagTopK(contextChars: number): number {
  return contextChars >= RAG_REDUCE_CONTEXT_THRESHOLD_CHARS ? RAG_REDUCED_TOP_K : RAG_DEFAULT_TOP_K;
}

/**
 * 清理 AI 回复中的结构化标记（GLM 等模型会加【共情】【理解】等）
 */
function cleanAIResponse(text: string): string {
  return text
    .replace(/【(共情|理解|倾听|回应|分析|总结|引导|支持|鼓励|观察|提问|反馈|过渡)】/g, '')
    .replace(/^\s*\n/gm, '\n') // 清理多余空行
    .trim();
}

/**
 * 从 AI 回复中解析建议标签
 */
function parseSuggestions(text: string): { message: string; suggestions: string[] } {
  // 先清理结构化标记
  const cleaned = cleanAIResponse(text).replace(/\r\n/g, '\n');
  const lines = cleaned.split('\n');
  const suggestionLineIndex = lines.findIndex(line =>
    /^(【?\s*建议\s*】?|建议[:：])/.test(line.trim())
  );

  if (suggestionLineIndex < 0) {
    return { message: cleaned, suggestions: [] };
  }

  const message = lines.slice(0, suggestionLineIndex).join('\n').trimEnd();
  const suggestionBlock = lines
    .slice(suggestionLineIndex)
    .join('\n')
    .replace(/^(建议\s*[:：]\s*|【?\s*建议\s*】?\s*)/, '')
    .replace(/[｜¦]/g, '|');

  const seen = new Set<string>();
  const suggestions = suggestionBlock
    .split(/[|\n]/)
    .map(s => s.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(s => s.length > 0 && s.length <= 20)
    .filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });

  return { message, suggestions };
}

const PLAN_DAYS = 7;

type PlanQuery =
  | { kind: 'all' }
  | { kind: 'day'; day_index: number }
  | { kind: 'relative'; offset: 0 | 1 | 2 };

// UUID v4 格式 + 兼容旧格式 session-{timestamp}-{hex}
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_SESSION_RE = /^session-\d{13,}-[0-9a-f]{6,13}$/;

function parseSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const sessionId = value.trim();
  if (!sessionId || sessionId.length > 128) return null;
  if (!UUID_V4_RE.test(sessionId) && !LEGACY_SESSION_RE.test(sessionId)) return null;
  return sessionId;
}

function hasRecentPlanContext(messages: Message[]): boolean {
  return messages
    .slice(-6)
    .some((message) => /(7天|七天|计划|任务|Day\s*[1-7]\/7)/i.test(message.content));
}

function parsePlanQuery(text: string, hasContext: boolean): PlanQuery | null {
  const input = text.trim();
  if (!input) return null;

  if (
    /(全部|所有|完整).*(计划|任务)/.test(input)
    || /(7天|七天).*(计划|任务)/.test(input)
    || /(all).*(plan|task)/i.test(input)
  ) {
    return { kind: 'all' };
  }

  const englishDayMatch = input.match(/day\s*([1-9]\d*)/i);
  if (englishDayMatch) {
    const day = Number(englishDayMatch[1]);
    if (Number.isInteger(day)) return { kind: 'day', day_index: day };
  }

  const digitDayMatch = input.match(/第\s*(\d+)\s*天/);
  if (digitDayMatch) {
    const day = Number(digitDayMatch[1]);
    if (Number.isInteger(day)) return { kind: 'day', day_index: day };
  }

  const chineseDayMatch = input.match(/第\s*([一二三四五六七])\s*天/);
  if (chineseDayMatch) {
    const map: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7,
    };
    const day = map[chineseDayMatch[1]];
    if (day) return { kind: 'day', day_index: day };
  }

  const hasPlanWords = /(计划|任务|安排)/.test(input);
  if ((hasPlanWords || hasContext) && /今天/.test(input)) return { kind: 'relative', offset: 0 };
  if ((hasPlanWords || hasContext) && /明天/.test(input)) return { kind: 'relative', offset: 1 };
  if ((hasPlanWords || hasContext) && /后天/.test(input)) return { kind: 'relative', offset: 2 };

  return null;
}

function computeTodayIndexFromPlans(plans: Array<Pick<ActionPlanRow, 'created_at' | 'day_index'>>): number {
  if (plans.length === 0) return 1;
  const sorted = [...plans].sort((a, b) => a.day_index - b.day_index);
  const dayOne = sorted.find((item) => item.day_index === 1) || sorted[0];
  if (!dayOne.created_at) return 1;
  const startAt = Date.parse(dayOne.created_at);
  if (Number.isNaN(startAt)) return 1;
  const elapsedDays = Math.floor((Date.now() - startAt) / 86_400_000);
  return Math.max(1, Math.min(PLAN_DAYS, elapsedDays + 1));
}

function resolveDayIndex(query: PlanQuery, todayIndex: number): number | null {
  if (query.kind === 'day') return query.day_index;
  if (query.kind === 'relative') return Math.max(1, Math.min(PLAN_DAYS, todayIndex + query.offset));
  return null;
}

function getPlanStatusLabel(status: ActionPlanStatus): string {
  if (status === 'done') return '✅ 已完成';
  if (status === 'skipped') return '⏭ 已跳过';
  return '🕒 待完成';
}

async function buildPlanQueryAnswer(input: {
  messages: Message[];
  content: string;
  sessionId: string | null;
}): Promise<ChatResponse | null> {
  const query = parsePlanQuery(input.content, hasRecentPlanContext(input.messages));
  if (!query) return null;

  if (!input.sessionId) {
    return {
      message: pickOne([
        '我想读取你的 7 天计划，但当前会话还没同步好。你可以先刷新页面，再问我一次。',
        '会话还没同步好，刷新一下页面再问我就行。',
        '哎，计划服务暂时没连上。刷新一下页面试试？',
        '当前会话还没准备好，刷新一下再来问我。',
        '我这边还没读到你的计划，先刷新页面，然后再问我。',
      ]),
      suggestions: pickN(['今天任务是什么？', '把7天计划全部发我', '刷新后再问一次', '先聊点别的'], 2),
      isCrisis: false,
    };
  }

  try {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase
      .from('action_plans')
      .select('session_id,day_index,task_text,status,created_at')
      .eq('session_id', input.sessionId)
      .order('day_index', { ascending: true })
      .limit(PLAN_DAYS);

    if (error) {
      return {
        message: pickOne([
          '我读取计划时遇到一点网络波动，你可以稍后再问一次。',
          '网络有点不稳，计划没读出来，你稍等一下再问我。',
          '计划服务抖了一下，你可以先看上面的今日任务卡片，或者稍后再试。',
          '刚刚没连上，你等几秒再问我一次就好。',
          '读计划的时候断了一下，稍后再试试。',
        ]),
        suggestions: pickN(['再试一次', '今天任务是什么？', '先聊别的', '上面有今日任务'], 2),
        isCrisis: false,
      };
    }

    const plans = ((data ?? []) as ActionPlanRow[])
      .sort((a, b) => a.day_index - b.day_index);

    if (plans.length === 0) {
      return {
        message: pickOne([
          '你还没有生成 7 天计划。先点上面的「✨ 生成7天计划」，我就能按天回答你。',
          '计划还没生成呢，先点一下上面的「✨ 生成7天计划」。',
          '我这里没看到你的计划，先生成一份吧，点上面那个按钮就行。',
          '还没有计划哦，先生成一个我才能帮你跟进。',
          '7 天计划还是空的，先点上面的按钮生成一份，我来帮你安排。',
        ]),
        suggestions: pickN(['我先说下最近卡点', '给我一个3步小行动', '先帮我生成计划', '我不知道从哪开始'], 2),
        isCrisis: false,
      };
    }

    const todayIndex = computeTodayIndexFromPlans(plans);
    if (query.kind === 'all') {
      const lines = plans.map((plan) => (
        `Day ${plan.day_index}/7：${plan.task_text}（${getPlanStatusLabel(plan.status)}）`
      ));
      const intro = pickOne([
        `这是你当前的 7 天微行动计划（今天是 Day ${todayIndex}/7）：`,
        `给你整理好了，今天是 Day ${todayIndex}/7：`,
        `全部 7 天在这，你现在走到 Day ${todayIndex} 了：`,
        `好，全部列出来了（今天 Day ${todayIndex}/7）：`,
        `7 天计划如下，你目前在 Day ${todayIndex}：`,
      ]);
      return {
        message: `${intro}\n${lines.join('\n')}`,
        suggestions: pickN(['今天这个任务怎么拆', '明天任务是什么？', '哪天最难', '我想重新生成'], 2),
        isCrisis: false,
      };
    }

    const dayIndex = resolveDayIndex(query, todayIndex);
    if (!dayIndex || dayIndex < 1 || dayIndex > PLAN_DAYS) {
      return {
        message: pickOne([
          '我这套计划只有 1-7 天，你可以问我「第2天计划」或「全部计划」。',
          '超出范围了哈，计划只有 7 天，问我具体哪天就行。',
          '1 到 7 天都可以问，你想看第几天的？',
          '没有这一天的计划哦，试试问我「第3天任务」或者「全部计划」。',
          '这个超出 7 天范围了，你可以问第 1-7 天中的任意一天。',
        ]),
        suggestions: pickN(['第2天计划是什么？', '把7天计划全部发我', '今天的呢', '最后一天任务'], 2),
        isCrisis: false,
      };
    }

    const plan = plans.find((item) => item.day_index === dayIndex);
    if (!plan) {
      return {
        message: pickOne([
          `我没找到 Day ${dayIndex}/7 的任务，可以先点「♻️ 重新生成7天」再问我。`,
          `Day ${dayIndex} 好像还没生成，你先重新生成一次 7 天计划试试。`,
          `这一天的任务不存在，可能需要重新生成一份完整的 7 天计划。`,
          `没有 Day ${dayIndex} 的任务记录，试试重新生成？`,
          `Day ${dayIndex} 是空的，点一下重新生成 7 天就有了。`,
        ]),
        suggestions: pickN(['把7天计划全部发我', '今天任务是什么？', '重新生成7天', '算了先聊别的'], 2),
        isCrisis: false,
      };
    }

    const taskIntro = pickOne([
      `Day ${plan.day_index}/7：${plan.task_text}\n状态：${getPlanStatusLabel(plan.status)}`,
      `第 ${plan.day_index} 天的任务是：${plan.task_text}（${getPlanStatusLabel(plan.status)}）`,
      `Day ${plan.day_index}：${plan.task_text}\n目前${getPlanStatusLabel(plan.status)}`,
    ]);
    const taskOffer = pickOne([
      '如果你愿意，我可以把这个任务再拆成 2-3 步给你。',
      '需要我帮你把这个拆得更细吗？',
      '想让我帮你拆解一下这个任务吗？',
      '我可以帮你把这个变成 2-3 个小步骤。',
      '要不要我帮你把这条任务拆成更具体的动作？',
    ]);
    return {
      message: `${taskIntro}\n${taskOffer}`,
      suggestions: pickN(['把这个任务拆成3步', '明天任务是什么？', '这个我已经做了', '换一个任务'], 2),
      isCrisis: false,
    };
  } catch {
    return {
      message: pickOne([
        '我刚刚没连上计划服务，稍后再问我一次就好。',
        '计划服务暂时抽风了，你等一下再问我。',
        '没读到计划，可能网络有点问题，稍后再试试。',
        '连接断了一下，你等几秒再问我就行。',
        '出了点小状况，稍等再问我计划的事。',
      ]),
      suggestions: pickN(['再试一次', '今天任务是什么？', '先聊别的', '算了不看计划了'], 2),
      isCrisis: false,
    };
  }
}

/**
 * 根据 AI 回复内容生成兜底建议（AI 没返回【建议】时使用）
 * 核心：基于 AI 刚问了什么来生成回答选项，不是基于用户说了什么
 */
const FALLBACK_SUGGESTION_POOLS: Record<string, string[]> = {
  detail: [
    '其实是一件小事但一直放不下',
    '说来话长不知道从哪开始',
    '就是一种说不清的烦躁',
    '跟身边的人有关',
    '是一件事引发的连锁反应',
    '积攒了很久突然爆发的',
    '说出来怕你觉得矫情',
    '其实我自己也没完全想清楚',
  ],
  background: [
    '大二，学的计算机',
    '大三了正在纠结考研',
    '已经工作了一年多',
    '研一，刚换了个方向',
    '大四，秋招结束了但不满意',
    '大一新生什么都不懂',
    '毕业一年了在小公司',
    '在读博但有点后悔',
  ],
  feeling: [
    '就是很累但又停不下来',
    '有点焦虑说不上来为什么',
    '其实已经好一点了就是想聊聊',
    '心里堵得慌又不知道跟谁说',
    '白天还好晚上就emo了',
    '感觉一直在赶路但不知道要去哪',
    '说不上多难受就是不太开心',
    '有时候突然就不想努力了',
  ],
  opinion: [
    '我觉得你说得有道理',
    '但我的情况可能不太一样',
    '我还是有点拿不准',
    '说实话我也是这么想的',
    '道理我都懂就是做不到',
    '你说的我之前没想过',
    '我需要再想想',
    '嗯确实，但还是有点怕',
  ],
};

function fallbackSuggestions(aiMessage: string): string[] {
  const ai = aiMessage.toLowerCase();

  if (ai.includes('具体') || ai.includes('说说') || ai.includes('什么事')) {
    return pickN(FALLBACK_SUGGESTION_POOLS.detail, 3);
  }
  if (ai.includes('大几') || ai.includes('专业') || ai.includes('在读')) {
    return pickN(FALLBACK_SUGGESTION_POOLS.background, 3);
  }
  if (ai.includes('什么感觉') || ai.includes('心情') || ai.includes('怎么样')) {
    return pickN(FALLBACK_SUGGESTION_POOLS.feeling, 3);
  }
  if (ai.includes('怎么看') || ai.includes('你觉得')) {
    return pickN(FALLBACK_SUGGESTION_POOLS.opinion, 3);
  }

  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableOpenAIError(error: unknown): boolean {
  const e = error as { status?: number; code?: string; name?: string };
  if (e?.name === 'AbortError') return true;
  if (typeof e?.status === 'number') return e.status === 429 || e.status >= 500;
  if (typeof e?.code !== 'string') return false;
  return ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(e.code);
}

type CompletionPayload = Parameters<typeof openai.chat.completions.create>[0];
type NonStreamCompletion = OpenAI.Chat.Completions.ChatCompletion;

interface StreamingCompletionResult {
  stream: Parameters<typeof openaiStreamToNDJSON>[0];
  model: string;
}

function buildModelCandidates(primaryModel: string): string[] {
  const candidates = [primaryModel];
  if (FALLBACK_MODEL && FALLBACK_MODEL !== primaryModel) {
    candidates.push(FALLBACK_MODEL);
  }
  return candidates;
}

function normalizeOpenAIError(error: unknown): Error & { code?: string; status?: number } {
  const e = error as { name?: string; code?: string; status?: number; message?: string };
  if (e?.name === 'AbortError') {
    const timeoutError = new Error('AI request timed out') as Error & { code?: string };
    timeoutError.code = 'AI_TIMEOUT';
    return timeoutError;
  }
  if (error instanceof Error) {
    return error as Error & { code?: string; status?: number };
  }
  const unknownError = new Error(e?.message || 'Unknown OpenAI error') as Error & {
    code?: string;
    status?: number;
  };
  unknownError.code = e?.code;
  unknownError.status = e?.status;
  return unknownError;
}

async function createNonStreamCompletion(
  payload: CompletionPayload,
  requestId: string
): Promise<NonStreamCompletion> {
  const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model : CHAT_MODEL;
  const modelCandidates = buildModelCandidates(model);
  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex++) {
    const candidate = modelCandidates[modelIndex];
    for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('timeout'), OPENAI_TIMEOUT_MS);

      try {
        console.info(`[${requestId}] LLM request start`, { model: candidate, attempt, stream: false });
        const completion = await openai.chat.completions.create(
          { ...payload, model: candidate, stream: false } as CompletionPayload,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        console.info(`[${requestId}] LLM request done`, { model: candidate, attempt, stream: false });
        return completion as NonStreamCompletion;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        const shouldRetry = attempt < OPENAI_MAX_RETRIES && isRetryableOpenAIError(error);
        if (!shouldRetry) break;
        await sleep(250 * (attempt + 1));
      }
    }

    const canUseFallback = modelIndex < modelCandidates.length - 1 && isRetryableOpenAIError(lastError);
    if (canUseFallback) {
      console.warn(`[${requestId}] switching fallback model`, {
        from: candidate,
        to: modelCandidates[modelIndex + 1],
      });
      continue;
    }
    break;
  }

  throw normalizeOpenAIError(lastError ?? new Error('Unknown OpenAI error'));
}

async function createStreamingCompletion(
  payload: CompletionPayload,
  requestId: string
): Promise<StreamingCompletionResult> {
  const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model : CHAT_MODEL;
  const modelCandidates = buildModelCandidates(model);
  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex++) {
    const candidate = modelCandidates[modelIndex];
    for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('timeout'), OPENAI_TIMEOUT_MS);

      try {
        console.info(`[${requestId}] LLM stream start`, { model: candidate, attempt });
        const stream = await openai.chat.completions.create(
          { ...payload, model: candidate, stream: true } as CompletionPayload,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        console.info(`[${requestId}] LLM stream connected`, { model: candidate, attempt });
        return {
          stream: stream as Parameters<typeof openaiStreamToNDJSON>[0],
          model: candidate,
        };
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        const shouldRetry = attempt < OPENAI_MAX_RETRIES && isRetryableOpenAIError(error);
        if (!shouldRetry) break;
        await sleep(250 * (attempt + 1));
      }
    }

    const canUseFallback = modelIndex < modelCandidates.length - 1 && isRetryableOpenAIError(lastError);
    if (canUseFallback) {
      console.warn(`[${requestId}] switching fallback model`, {
        from: candidate,
        to: modelCandidates[modelIndex + 1],
      });
      continue;
    }
    break;
  }

  throw normalizeOpenAIError(lastError ?? new Error('Unknown OpenAI error'));
}

async function collectStreamingText(
  stream: StreamingCompletionResult['stream']
): Promise<string> {
  let accumulated = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) accumulated += delta;
  }
  return accumulated.trim();
}

const CRISIS_SUGGESTIONS = [
  '我现在需要有人陪',
  '可以告诉我更多求助方式吗',
  '我想聊点别的',
];

// 画像模式 prompt
const PROFILE_SYSTEM_PROMPT = `你现在进入"画像分析师"模式。通过轻松的对话了解用户，每次只问一个问题。

## 你要了解的维度（自然展开，不要一次全问）

1. **基本情况**：在读/已毕业？什么专业？大几？
2. **当前状态**：最近在忙什么？心情怎么样？
3. **优势与兴趣**：觉得自己擅长什么？对什么感兴趣？
4. **困扰与焦虑**：最近最烦的事情是什么？
5. **目标与方向**：有没有想做的事？
6. **行动力**：想到就做，还是想很多但不太动？
7. **社交风格**：喜欢独处还是和朋友一起？

## 风格
- 每次只问 1 个问题
- 语气轻松，像朋友在微信聊天（"哈哈确实""能理解""嗐"）
- 用"我"自称，不要频繁说"小舟"
- 偶尔自嘲

## 建议的铁律
每条建议必须是「用户的真实回答」，不是指令。用户点击后会直接发送给你，所以必须有信息量。
- ❌ "先描述一个具体场景" ← 这是指令，你收到后还是不知道内容
- ✅ "我对 AI 方向挺感兴趣的" ← 这是真实回答，你能继续往下聊

## 格式
每次回复最后一行附带建议：
【建议】建议1 | 建议2 | 结束画像，看看分析`;

// "读人"模式 prompt
const PROFILE_OTHER_SYSTEM_PROMPT = `你现在进入"读人"模式。用户想了解/分析身边的一个人。你的任务是通过提问帮用户描述清楚那个人。

## 你要了解的维度

1. **关系**：那个人是用户的什么人？（同学/室友/同事/领导/朋友/家人/暧昧对象）
2. **基本信息**：大概多大？做什么的？
3. **性格特征**：平时是什么样的人？外向还是内向？
4. **关键事件**：发生了什么事让用户想分析 ta？
5. **相处困惑**：用户在和 ta 相处中遇到什么问题？
6. **用户的期望**：用户希望和 ta 达成什么关系/结果？

## 风格
- 每次只问 1 个问题
- 语气像朋友在八卦聊天，但带分析
- 可以边问边给小观察："听起来 ta 可能是那种..."
- 用"我"自称

## 建议的铁律
每条建议必须是「用户的真实回答」，不是指令。
- ❌ "先描述一个具体场景" ← 指令，没信息
- ✅ "ta 总是不打招呼就用我的东西" ← 真实描述，有信息
- ❌ "回忆最近一次困惑的互动" ← 指令
- ✅ "上次 ta 当着别人面说我的方案有问题" ← 有具体事件

## 格式
每次回复最后一行附带建议：
【建议】建议1 | 建议2 | 结束画像，看看分析`;

// "读人"报告 prompt
const REPORT_OTHER_SYSTEM_PROMPT = `根据对话内容分析用户描述的那个人，生成一份"读人报告"。用"我"自称，语气口语化。

## 最重要的规则：信息不够就不要硬写！

在生成报告前，先判断用户是否提供了足够的具体信息：
- 用户是否描述了 ta 的**具体行为**（不只是"让我头疼"）？
- 用户是否提供了**至少 1-2 个具体事例**？
- 你能否从对话中提取出有依据的判断？

**如果信息严重不足**（用户只说了关系和笼统感受，没有具体行为/事例），你必须这样回复：

"我觉得现在的信息还不太够生成一份靠谱的报告。

我目前只知道：
- （列出你知道的 1-2 点）

要画出一个人的画像，我至少需要知道：
- ta 做过什么让你印象深刻的事？
- ta 平时说话是什么风格？
- 有没有一件具体的事让你对 ta 产生了现在的看法？

我们继续聊聊？聊得越具体，报告越准 😊"

然后不要生成报告格式的内容。

**只有在信息充足时**，才用以下格式：

### 🔍 ta 的画像

**一句话概括**：（基于真实信息的概括）

### 📊 性格分析

| 维度 | 分析 |
|---|---|
| 🎭 性格类型 | （必须有依据，没依据就写"信息不足"） |
| 💬 沟通风格 | （同上） |
| ⚡ 行为模式 | （同上） |
| 🎯 核心需求 | （同上） |
| ⚠️ 雷区 | （同上） |

### 🤝 相处建议

（3-4 条具体策略，必须基于用户描述的情况）

### 💡 一句话

（犀利但有依据的洞察）

---
核心原则：**有几分证据说几分话**。宁可报告短一点、留白多一点，也不要编造。`;

// 自我报告 prompt
const REPORT_SYSTEM_PROMPT = `根据对话内容生成一份用户画像报告。用"我"自称，语气口语化，可以直接一点。

## 格式

### 🎯 你的画像

**一句话概括**：（用一句生动的话描述这个人）

### 📊 维度分析

| 维度 | 分析 |
|---|---|
| 🎓 当前阶段 | （在读/毕业，专业方向） |
| 💪 核心优势 | （2-3个突出特点） |
| 🔥 兴趣方向 | （对什么感兴趣） |
| 😰 主要困扰 | （当前面临的挑战） |
| 🎯 目标清晰度 | ⭐⭐⭐☆☆（1-5星） |
| ⚡ 行动力 | ⭐⭐⭐☆☆（1-5星） |
| 🤝 社交偏好 | （内向/外向/灵活型） |

### 💡 我的建议

（2-3 条具体可行的建议，口语化，可以直接一点）

### 🌟 一句话

（真诚的、个性化的鼓励，不要鸡汤）

---
## 最重要的规则：信息不够就不要硬写！

在生成前先判断：用户是否回答了至少 3 个维度的具体内容？
- 如果是 → 正常生成报告
- 如果不是 → 回复"我觉得现在聊的还不太够，要不要再多说几句？我们可以继续聊聊你的 [缺失的维度]"，然后不要输出报告格式

核心原则：**有几分信息说几分话**，没聊到的就写"暂未了解"，绝不编造。`;

// ===== Handler Context =====
interface HandlerContext {
  requestId: string;
  messages: Message[];
  lastUserMessage: Message;
  mode: ChatRequest['mode'];
  scenario: string | null;
  sessionId: string | null;
}

// ===== Mode Handlers =====

async function handleRecap(ctx: HandlerContext): Promise<Response> {
  const { requestId, messages } = ctx;
  if (messages.length < 4) {
    return NextResponse.json(
      buildRecapFailureResponse('INSUFFICIENT_CONTEXT', '对话轮次太少，先多聊几句再生成复盘卡吧')
    );
  }

  const result = await generateRecapFromMessages(messages, {
    invokeAI: async ({ systemPrompt, conversation }) => {
      const llmStartedAt = Date.now();
      const { stream, model } = await createStreamingCompletion({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversation },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }, requestId);
      const text = await collectStreamingText(stream);
      console.info(`[${requestId}] LLM stream done`, {
        mode: 'generate_recap',
        model,
        ms: Date.now() - llmStartedAt,
        chars: text.length,
      });
      return text;
    },
  });

  return NextResponse.json(
    buildRecapSuccessResponse(result.recap, result.message)
  );
}

async function handleGenerateReportOther(ctx: HandlerContext): Promise<Response> {
  const { requestId, messages, lastUserMessage, scenario } = ctx;
  const scenarioStartedAt = Date.now();
  const scenarioPrompt = scenario ? `\n\n${buildScenarioSystemPrompt(scenario)}` : '';
  const contextMessages = buildContextMessages(messages, { maxChars: REPORT_CONTEXT_MAX_CHARS });
  const contextChars = getMessagesCharCount(contextMessages);
  const ragTopK = getRagTopK(contextChars);
  const ragStartedAt = Date.now();
  const reportOtherResults = scenario
    ? retrieve(lastUserMessage.content, ragTopK, { mode: 'generate_report_other', scenario })
    : [];
  console.info(`[${requestId}] RAG done`, {
    mode: 'generate_report_other',
    ms: Date.now() - ragStartedAt,
    hits: reportOtherResults.length,
    ragTopK,
    contextChars,
  });
  const scenarioEvidence = scenario ? formatEvidence(reportOtherResults) : '';
  const payload: CompletionPayload = {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: REPORT_OTHER_SYSTEM_PROMPT + scenarioPrompt + scenarioEvidence },
      ...contextMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: '请根据我们刚才的对话，分析一下这个人，生成读人报告。' },
    ],
    temperature: 0.5,
    max_tokens: MAX_REPORT_TOKENS,
  };
  const llmStartedAt = Date.now();
  const { stream, model } = await createStreamingCompletion(payload, requestId);
  const streamResponse = openaiStreamToNDJSON(
    stream,
    (fullText) => {
      const report = fullText.trim() || '抱歉，分析暂时生成不了 😵 稍后再试试。';
      console.info(`[${requestId}] LLM stream done`, {
        mode: 'generate_report_other',
        model,
        ms: Date.now() - llmStartedAt,
        chars: report.length,
      });
      if (scenario) {
        const parsed = parseScenarioModelOutput(report, scenario);
        const scenarioMessage = formatScenarioScript(parsed.script);
        trackScenarioResponseGenerated(scenario, {
          success: true,
          latency_ms: Date.now() - scenarioStartedAt,
          error_type: parsed.usedFallback ? 'ai_format_error' : 'none',
        });
        return {
          message: scenarioMessage,
          suggestions: [],
          isCrisis: false,
          isReport: true,
          scenario,
        };
      }
      return { message: report, suggestions: [], isCrisis: false, isReport: true };
    },
    requestId
  );
  return ndjsonResponse(streamResponse);
}

async function handleGenerateReport(ctx: HandlerContext): Promise<Response> {
  const { requestId, messages, lastUserMessage } = ctx;
  const contextMessages = buildContextMessages(messages, { maxChars: REPORT_CONTEXT_MAX_CHARS });
  const contextChars = getMessagesCharCount(contextMessages);
  const ragTopK = getRagTopK(contextChars);
  const ragStartedAt = Date.now();
  const reportResults = retrieve(lastUserMessage.content, ragTopK, { mode: 'generate_report' });
  console.info(`[${requestId}] RAG done`, {
    mode: 'generate_report',
    ms: Date.now() - ragStartedAt,
    hits: reportResults.length,
    ragTopK,
    contextChars,
  });
  const reportEvidence = formatEvidence(reportResults);
  const payload: CompletionPayload = {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: REPORT_SYSTEM_PROMPT + reportEvidence },
      ...contextMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: '请根据我们刚才的对话，生成我的画像分析报告。' },
    ],
    temperature: 0.5,
    max_tokens: MAX_REPORT_TOKENS,
  };
  const llmStartedAt = Date.now();
  const { stream, model } = await createStreamingCompletion(payload, requestId);
  const streamResponse = openaiStreamToNDJSON(
    stream,
    (fullText) => {
      const report = fullText.trim() || '抱歉，画像暂时生成不了 😵 稍后再试试。';
      console.info(`[${requestId}] LLM stream done`, {
        mode: 'generate_report',
        model,
        ms: Date.now() - llmStartedAt,
        chars: report.length,
      });
      return { message: report, suggestions: [], isCrisis: false, isReport: true };
    },
    requestId
  );
  return ndjsonResponse(streamResponse);
}

async function handleProfileOther(ctx: HandlerContext): Promise<Response> {
  const { requestId, messages, lastUserMessage, scenario } = ctx;
  const scenarioStartedAt = Date.now();
  const scenarioPrompt = scenario ? `\n\n${buildScenarioSystemPrompt(scenario)}` : '';
  const contextMessages = buildContextMessages(messages);
  const contextChars = getMessagesCharCount(contextMessages);
  const ragTopK = getRagTopK(contextChars);
  const ragStartedAt = Date.now();
  const otherResults = scenario
    ? retrieve(lastUserMessage.content, ragTopK, { mode: 'profile_other', scenario })
    : [];
  console.info(`[${requestId}] RAG done`, {
    mode: 'profile_other',
    ms: Date.now() - ragStartedAt,
    hits: otherResults.length,
    ragTopK,
    contextChars,
  });
  const otherEvidence = scenario ? formatEvidence(otherResults) : '';
  const payload: CompletionPayload = {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: PROFILE_OTHER_SYSTEM_PROMPT + scenarioPrompt + otherEvidence },
      ...contextMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
    temperature: 0.65,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  const llmStartedAt = Date.now();
  const { stream, model } = await createStreamingCompletion(payload, requestId);
  const streamResponse = openaiStreamToNDJSON(
    stream,
    (fullText) => {
      const rawMessage = fullText.trim() || '抱歉，我现在脑子转不动了 😵 稍后再试试。';
      console.info(`[${requestId}] LLM stream done`, {
        mode: 'profile_other',
        model,
        ms: Date.now() - llmStartedAt,
        chars: rawMessage.length,
      });
      const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
      if (scenario) {
        trackScenarioResponseGenerated(scenario, {
          success: true,
          latency_ms: Date.now() - scenarioStartedAt,
          error_type: 'none',
        });
      }
      return {
        message: assistantMessage,
        suggestions: suggestions.length > 0 ? suggestions : [],
        isCrisis: false,
        scenario,
      };
    },
    requestId
  );
  return ndjsonResponse(streamResponse);
}

async function handleProfile(ctx: HandlerContext): Promise<Response> {
  const { requestId, messages } = ctx;
  const contextMessages = buildContextMessages(messages);
  const payload: CompletionPayload = {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: PROFILE_SYSTEM_PROMPT },
      ...contextMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
    temperature: 0.65,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  const llmStartedAt = Date.now();
  const { stream, model } = await createStreamingCompletion(payload, requestId);
  const streamResponse = openaiStreamToNDJSON(
    stream,
    (fullText) => {
      const rawMessage = fullText.trim() || '抱歉，我现在脑子转不动了 😵 稍后再试试。';
      console.info(`[${requestId}] LLM stream done`, {
        mode: 'profile',
        model,
        ms: Date.now() - llmStartedAt,
        chars: rawMessage.length,
      });
      const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
      return {
        message: assistantMessage,
        suggestions: suggestions.length > 0 ? suggestions : [],
        isCrisis: false,
      };
    },
    requestId
  );
  return ndjsonResponse(streamResponse);
}

async function handleChat(ctx: HandlerContext): Promise<Response> {
  const { requestId, messages, lastUserMessage } = ctx;
  const contextMessages = buildContextMessages(messages);
  const contextChars = getMessagesCharCount(contextMessages);
  const ragTopK = getRagTopK(contextChars);
  const ragStartedAt = Date.now();
  const retrievalResults = retrieve(lastUserMessage.content, ragTopK);
  console.info(`[${requestId}] RAG done`, {
    mode: 'chat',
    ms: Date.now() - ragStartedAt,
    hits: retrievalResults.length,
    ragTopK,
    contextChars,
  });
  const evidence = formatEvidence(retrievalResults);
  const systemPrompt = getSystemPrompt() + evidence;

  const payload: CompletionPayload = {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
    temperature: 0.75,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  const llmStartedAt = Date.now();
  const { stream, model } = await createStreamingCompletion(payload, requestId);
  const streamResponse = openaiStreamToNDJSON(
    stream,
    (fullText) => {
      const rawMessage = fullText.trim() || '抱歉，我现在脑子转不动了 😵 稍后再试试。';
      console.info(`[${requestId}] LLM stream done`, {
        mode: 'chat',
        model,
        ms: Date.now() - llmStartedAt,
        chars: rawMessage.length,
      });
      const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
      const finalSuggestions = suggestions.length > 0
        ? suggestions
        : fallbackSuggestions(assistantMessage);
      return {
        message: assistantMessage,
        suggestions: finalSuggestions,
        isCrisis: false,
        promptVersion: getPromptVersion(),
      };
    },
    requestId
  );
  return ndjsonResponse(streamResponse);
}

// ===== POST Handler (thin dispatcher) =====

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const requestStartedAt = Date.now();
  try {
    // 限流检查：每分钟 15 次
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(`chat:${clientIP}`, { windowMs: 60_000, maxRequests: 15 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '请求太频繁了，休息几秒再来' },
        { status: 429 }
      );
    }

    const body = await request.json() as ChatRequest;
    const { messages, mode = 'chat', scenario: rawScenario = null, session_id: rawSessionId = null } = body;
    const scenario = normalizeScenario(rawScenario);
    const sessionId = parseSessionId(rawSessionId);
    console.info(`[${requestId}] POST /api/chat`, {
      mode,
      scenario,
      msgCount: Array.isArray(messages) ? messages.length : 0,
    });

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages 数组不能为空' },
        { status: 400 }
      );
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find(m => m.role === 'user');

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: '没有找到用户消息' },
        { status: 400 }
      );
    }

    // ===== 安全检查（所有模式都必须经过） =====
    const moderationResult = checkModeration(lastUserMessage.content);

    if (moderationResult.isCrisis) {
      console.log('[CRISIS DETECTED]', {
        crisisKeywordsFound: moderationResult.crisisKeywordsFound,
        mode,
      });

      return NextResponse.json({
        message: CRISIS_RESPONSE,
        suggestions: CRISIS_SUGGESTIONS,
        isCrisis: true,
      });
    }

    // ===== 模式分发 =====
    const ctx: HandlerContext = { requestId, messages, lastUserMessage, mode, scenario, sessionId };

    if (mode === 'generate_recap') {
      return handleRecap(ctx);
    }

    if (mode === 'chat' || mode === 'profile' || mode === 'profile_other') {
      const planAnswer = await buildPlanQueryAnswer({
        messages,
        content: lastUserMessage.content,
        sessionId,
      });
      if (planAnswer) {
        return NextResponse.json(planAnswer);
      }
    }

    if (mode === 'generate_report_other') {
      return handleGenerateReportOther(ctx);
    }

    if (mode === 'generate_report') {
      return handleGenerateReport(ctx);
    }

    if (mode === 'profile_other') {
      return handleProfileOther(ctx);
    }

    if (mode === 'profile') {
      return handleProfile(ctx);
    }

    return handleChat(ctx);

  } catch (error) {
    if (mode === 'chat' || mode === 'profile' || mode === 'profile_other') {
      const planAnswer = await buildPlanQueryAnswer({
        messages,
        content: lastUserMessage.content,
        sessionId,
      });
      if (planAnswer) {
        return NextResponse.json(planAnswer);
      }
    }

    // ===== 生成"读人"报告 =====
    if (mode === 'generate_report_other') {
      const scenarioStartedAt = Date.now();
      const scenarioPrompt = scenario ? `\n\n${buildScenarioSystemPrompt(scenario)}` : '';
      const contextMessages = buildContextMessages(messages, { maxChars: REPORT_CONTEXT_MAX_CHARS });
      const contextChars = getMessagesCharCount(contextMessages);
      const ragTopK = getRagTopK(contextChars);
      const ragStartedAt = Date.now();
      const reportOtherResults = scenario
        ? retrieve(lastUserMessage.content, ragTopK, {
            mode: 'generate_report_other',
            scenario,
          })
        : [];
      console.info(`[${requestId}] RAG done`, {
        mode: 'generate_report_other',
        ms: Date.now() - ragStartedAt,
        hits: reportOtherResults.length,
        ragTopK,
        contextChars,
      });
      const scenarioEvidence = scenario ? formatEvidence(reportOtherResults) : '';
      const payload: CompletionPayload = {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: REPORT_OTHER_SYSTEM_PROMPT + scenarioPrompt + scenarioEvidence },
          ...contextMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: '请根据我们刚才的对话，分析一下这个人，生成读人报告。' },
        ],
        temperature: 0.5,
        max_tokens: MAX_REPORT_TOKENS,
      };
      const llmStartedAt = Date.now();
      const { stream, model } = await createStreamingCompletion(payload, requestId);
      const streamResponse = openaiStreamToNDJSON(
        stream,
        (fullText) => {
          const report = fullText.trim() || '抱歉，暂时无法生成报告。';
          console.info(`[${requestId}] LLM stream done`, {
            mode: 'generate_report_other',
            model,
            ms: Date.now() - llmStartedAt,
            chars: report.length,
          });
          if (scenario) {
            const parsed = parseScenarioModelOutput(report, scenario);
            const scenarioMessage = formatScenarioScript(parsed.script);
            trackScenarioResponseGenerated(scenario, {
              success: true,
              latency_ms: Date.now() - scenarioStartedAt,
              error_type: parsed.usedFallback ? 'ai_format_error' : 'none',
            });
            return {
              message: scenarioMessage,
              suggestions: [],
              isCrisis: false,
              isReport: true,
              scenario,
            };
          }
          return {
            message: report,
            suggestions: [],
            isCrisis: false,
            isReport: true,
          };
        },
        requestId
      );

      return ndjsonResponse(streamResponse);
    }

    // ===== 生成自我画像报告 =====
    if (mode === 'generate_report') {
      const contextMessages = buildContextMessages(messages, { maxChars: REPORT_CONTEXT_MAX_CHARS });
      const contextChars = getMessagesCharCount(contextMessages);
      const ragTopK = getRagTopK(contextChars);
      const ragStartedAt = Date.now();
      const reportResults = retrieve(lastUserMessage.content, ragTopK, { mode: 'generate_report' });
      console.info(`[${requestId}] RAG done`, {
        mode: 'generate_report',
        ms: Date.now() - ragStartedAt,
        hits: reportResults.length,
        ragTopK,
        contextChars,
      });
      const reportEvidence = formatEvidence(reportResults);
      const payload: CompletionPayload = {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: REPORT_SYSTEM_PROMPT + reportEvidence },
          ...contextMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: '请根据我们刚才的对话，生成我的画像分析报告。' },
        ],
        temperature: 0.5,
        max_tokens: MAX_REPORT_TOKENS,
      };
      const llmStartedAt = Date.now();
      const { stream, model } = await createStreamingCompletion(payload, requestId);
      const streamResponse = openaiStreamToNDJSON(
        stream,
        (fullText) => {
          const report = fullText.trim() || '抱歉，暂时无法生成报告。';
          console.info(`[${requestId}] LLM stream done`, {
            mode: 'generate_report',
            model,
            ms: Date.now() - llmStartedAt,
            chars: report.length,
          });
          return {
            message: report,
            suggestions: [],
            isCrisis: false,
            isReport: true,
          };
        },
        requestId
      );

      return ndjsonResponse(streamResponse);
    }

    // ===== "读人"对话模式 =====
    if (mode === 'profile_other') {
      const scenarioStartedAt = Date.now();
      const scenarioPrompt = scenario ? `\n\n${buildScenarioSystemPrompt(scenario)}` : '';
      const contextMessages = buildContextMessages(messages);
      const contextChars = getMessagesCharCount(contextMessages);
      const ragTopK = getRagTopK(contextChars);
      const ragStartedAt = Date.now();
      const profileOtherResults = retrieve(lastUserMessage.content, ragTopK, {
        mode: 'profile_other',
        scenario: scenario ?? undefined,
      });
      console.info(`[${requestId}] RAG done`, {
        mode: 'profile_other',
        ms: Date.now() - ragStartedAt,
        hits: profileOtherResults.length,
        ragTopK,
        contextChars,
      });
      const scenarioEvidence = formatEvidence(profileOtherResults);

      const payload: CompletionPayload = {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: PROFILE_OTHER_SYSTEM_PROMPT + scenarioPrompt + scenarioEvidence },
          ...contextMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        temperature: 0.6,
        max_tokens: MAX_OUTPUT_TOKENS,
      };
      const llmStartedAt = Date.now();
      const { stream, model } = await createStreamingCompletion(payload, requestId);
      const streamResponse = openaiStreamToNDJSON(
        stream,
        (fullText) => {
          const rawMessage = fullText.trim() || '抱歉，我这边卡了一下 😵';
          console.info(`[${requestId}] LLM stream done`, {
            mode: 'profile_other',
            model,
            ms: Date.now() - llmStartedAt,
            chars: rawMessage.length,
          });
          if (scenario) {
            const parsed = parseScenarioModelOutput(rawMessage, scenario);
            const scenarioMessage = formatScenarioScript(parsed.script);
            trackScenarioResponseGenerated(scenario, {
              success: true,
              latency_ms: Date.now() - scenarioStartedAt,
              error_type: parsed.usedFallback ? 'ai_format_error' : 'none',
            });
            return {
              message: scenarioMessage,
              suggestions: [],
              isCrisis: false,
              scenario,
            };
          }
          const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
          return {
            message: assistantMessage,
            // 读人模式兜底：不给无意义的按钮，让用户自己打字
            suggestions: suggestions.length > 0 ? suggestions : [],
            isCrisis: false,
          };
        },
        requestId
      );

      return ndjsonResponse(streamResponse);
    }

    // ===== 自我画像对话模式 =====
    if (mode === 'profile') {
      const contextMessages = buildContextMessages(messages);
      const contextChars = getMessagesCharCount(contextMessages);
      const ragTopK = getRagTopK(contextChars);
      const ragStartedAt = Date.now();
      const profileResults = retrieve(lastUserMessage.content, ragTopK, { mode: 'profile' });
      console.info(`[${requestId}] RAG done`, {
        mode: 'profile',
        ms: Date.now() - ragStartedAt,
        hits: profileResults.length,
        ragTopK,
        contextChars,
      });
      const profileEvidence = formatEvidence(profileResults);

      const payload: CompletionPayload = {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: PROFILE_SYSTEM_PROMPT + profileEvidence },
          ...contextMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        temperature: 0.5,
        max_tokens: MAX_OUTPUT_TOKENS,
      };
      const llmStartedAt = Date.now();
      const { stream, model } = await createStreamingCompletion(payload, requestId);
      const streamResponse = openaiStreamToNDJSON(
        stream,
        (fullText) => {
          const rawMessage = fullText.trim() || '抱歉，我这边卡了一下 😵';
          console.info(`[${requestId}] LLM stream done`, {
            mode: 'profile',
            model,
            ms: Date.now() - llmStartedAt,
            chars: rawMessage.length,
          });
          const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
          return {
            message: assistantMessage,
            // 画像模式兜底：不给无意义的按钮，让用户自己打字
            suggestions: suggestions.length > 0 ? suggestions : [],
            isCrisis: false,
          };
        },
        requestId
      );

      return ndjsonResponse(streamResponse);
    }

    // ===== 普通聊天模式（高温度，更有个性） =====
    const contextMessages = buildContextMessages(messages);
    const contextChars = getMessagesCharCount(contextMessages);
    const ragTopK = getRagTopK(contextChars);
    const ragStartedAt = Date.now();
    const retrievalResults = retrieve(lastUserMessage.content, ragTopK);
    console.info(`[${requestId}] RAG done`, {
      mode: 'chat',
      ms: Date.now() - ragStartedAt,
      hits: retrievalResults.length,
      ragTopK,
      contextChars,
    });
    const evidence = formatEvidence(retrievalResults);
    const systemPrompt = getSystemPrompt() + evidence;

    const payload: CompletionPayload = {
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...contextMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: 0.75,
      max_tokens: MAX_OUTPUT_TOKENS,
    };
    const llmStartedAt = Date.now();
    const { stream, model } = await createStreamingCompletion(payload, requestId);
    const streamResponse = openaiStreamToNDJSON(
      stream,
      (fullText) => {
        const rawMessage = fullText.trim() || '抱歉，我现在脑子转不动了 😵 稍后再试试。';
        console.info(`[${requestId}] LLM stream done`, {
          mode: 'chat',
          model,
          ms: Date.now() - llmStartedAt,
          chars: rawMessage.length,
        });
        const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
        const finalSuggestions = suggestions.length > 0
          ? suggestions
          : fallbackSuggestions(assistantMessage);
        return {
          message: assistantMessage,
          suggestions: finalSuggestions,
          isCrisis: false,
          promptVersion: getPromptVersion(),
        };
      },
      requestId
    );

    return ndjsonResponse(streamResponse);

  } catch (error) {
    console.error(`[${requestId}] [CHAT API ERROR]`, {
      elapsed_ms: Date.now() - requestStartedAt,
      error,
    });
    const e = error as { code?: string; status?: number };

    if (e?.code === 'AI_TIMEOUT') {
      return NextResponse.json(
        { error: '我这边响应超时了，稍后再试试' },
        { status: 504 }
      );
    }

    if (e?.status === 429) {
      return NextResponse.json(
        { error: '请求有点多，稍等几秒再试试' },
        { status: 429 }
      );
    }

    if (typeof e?.status === 'number' && e.status >= 500) {
      return NextResponse.json(
        { error: 'AI 服务暂时不可用，请稍后再试' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: '服务器错误，请稍后再试' },
      { status: 500 }
    );
  }
}
