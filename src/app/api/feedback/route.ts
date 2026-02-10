import { NextRequest, NextResponse } from 'next/server';
import { supabase, calculateQuality, CaseCardRow } from '@/lib/supabase';
import { redact } from '@/lib/redact';

export const runtime = 'nodejs';

interface FeedbackRequest {
  messages: Array<{ role: string; content: string }>;
  rating: number;
  feedback: string | null;
  hadCrisis: boolean;
  mode: string;
}

const ALLOWED_MODES = new Set(['chat', 'profile', 'profile_other']);
const MAX_MESSAGES = 120;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_FEEDBACK_LENGTH = 1_000;

class ValidationError extends Error {}

function validateFeedbackBody(body: unknown): FeedbackRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('请求体格式错误');
  }

  const raw = body as Partial<FeedbackRequest>;
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    throw new ValidationError('没有对话内容');
  }
  if (raw.messages.length > MAX_MESSAGES) {
    throw new ValidationError('对话内容过长');
  }

  const messages = raw.messages.map((m) => {
    if (!m || typeof m !== 'object') {
      throw new ValidationError('消息格式错误');
    }
    if (typeof m.role !== 'string' || typeof m.content !== 'string') {
      throw new ValidationError('消息字段错误');
    }
    const role = m.role.trim();
    const content = m.content.trim();
    if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError('消息内容无效');
    }
    return { role, content };
  });

  if (typeof raw.rating !== 'number' || !Number.isInteger(raw.rating) || raw.rating < 1 || raw.rating > 10) {
    throw new ValidationError('评分无效');
  }

  const feedback = raw.feedback == null ? null : String(raw.feedback).trim();
  if (feedback && feedback.length > MAX_FEEDBACK_LENGTH) {
    throw new ValidationError('反馈内容过长');
  }

  if (typeof raw.hadCrisis !== 'boolean') {
    throw new ValidationError('危机标记无效');
  }

  const mode = typeof raw.mode === 'string' ? raw.mode.trim() : '';
  if (!ALLOWED_MODES.has(mode)) {
    throw new ValidationError('模式无效');
  }

  return {
    messages,
    rating: raw.rating,
    feedback,
    hadCrisis: raw.hadCrisis,
    mode,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as unknown;
    const { messages, rating, feedback, hadCrisis, mode } = validateFeedbackBody(body);

    // 脱敏消息（只保留 user 和 assistant）
    const redactedMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: redact(m.content),
      }));

    // 计算指标
    const userMessages = messages.filter(m => m.role === 'user');
    const turns = Math.floor(redactedMessages.length / 2);
    const avgUserMsgLength = userMessages.length > 0
      ? userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length
      : 0;

    // 计算质量分级
    const { score, tier } = calculateQuality(rating, turns, avgUserMsgLength);

    // 写入 Supabase
    const row: Partial<CaseCardRow> = {
      redacted_messages: redactedMessages,
      conversation_turns: turns,
      had_crisis: hadCrisis,
      rating,
      feedback: feedback ? redact(feedback) : null,
      quality_tier: tier,
      quality_score: score,
      mode,
    };

    const { error } = await supabase.from('case_cards').insert(row);

    if (error) {
      console.error('[FEEDBACK] Supabase error:', error);
      return NextResponse.json({ error: '保存失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      quality: { score, tier },
    });

  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[FEEDBACK ERROR]', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

