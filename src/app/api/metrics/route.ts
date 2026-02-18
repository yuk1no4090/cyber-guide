import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { SessionMetricsRow } from '@/lib/supabase';
import { redact } from '@/lib/redact';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const ALLOWED_MODES = new Set(['chat', 'profile', 'profile_other']);
const MAX_SUMMARY_LENGTH = 200;
const MAX_SESSION_ID_LENGTH = 128;

interface MetricsRequest {
  session_id?: unknown;
  mode?: unknown;
  conversation_turns?: unknown;
  user_msg_count?: unknown;
  avg_user_msg_length?: unknown;
  had_crisis?: unknown;
  summary?: unknown;
  prompt_version?: unknown;
}

class ValidationError extends Error {}

function validateMetricsBody(body: unknown): SessionMetricsRow {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('请求体格式错误');
  }

  const raw = body as MetricsRequest;

  if (typeof raw.session_id !== 'string' || !raw.session_id.trim() || raw.session_id.trim().length > MAX_SESSION_ID_LENGTH) {
    throw new ValidationError('session_id 无效');
  }

  const mode = typeof raw.mode === 'string' ? raw.mode.trim() : 'chat';
  if (!ALLOWED_MODES.has(mode)) {
    throw new ValidationError('mode 无效');
  }

  const conversationTurns = typeof raw.conversation_turns === 'number' && Number.isInteger(raw.conversation_turns) && raw.conversation_turns >= 0
    ? raw.conversation_turns
    : 0;

  const userMsgCount = typeof raw.user_msg_count === 'number' && Number.isInteger(raw.user_msg_count) && raw.user_msg_count >= 0
    ? raw.user_msg_count
    : 0;

  const avgUserMsgLength = typeof raw.avg_user_msg_length === 'number' && Number.isFinite(raw.avg_user_msg_length) && raw.avg_user_msg_length >= 0
    ? Math.round(raw.avg_user_msg_length * 10) / 10
    : 0;

  const hadCrisis = typeof raw.had_crisis === 'boolean' ? raw.had_crisis : false;

  let summary: string | null = null;
  if (typeof raw.summary === 'string' && raw.summary.trim()) {
    const redacted = redact(raw.summary.trim());
    summary = redacted.length > MAX_SUMMARY_LENGTH ? redacted.slice(0, MAX_SUMMARY_LENGTH) : redacted;
  }

  const promptVersion = typeof raw.prompt_version === 'string' && raw.prompt_version.trim()
    ? raw.prompt_version.trim()
    : null;

  return {
    session_id: raw.session_id.trim(),
    mode,
    conversation_turns: conversationTurns,
    user_msg_count: userMsgCount,
    avg_user_msg_length: avgUserMsgLength,
    had_crisis: hadCrisis,
    summary,
    prompt_version: promptVersion,
  };
}

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(`metrics:${clientIP}`, { windowMs: 60_000, maxRequests: 10 });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: '请求太频繁' }, { status: 429 });
    }

    const body = await request.json() as unknown;
    const row = validateMetricsBody(body);

    const { error } = await supabase.from('session_metrics').insert(row);

    if (error) {
      console.error('[METRICS] Supabase error:', error);
      return NextResponse.json({ error: '保存失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[METRICS ERROR]', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
