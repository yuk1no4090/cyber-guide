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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as FeedbackRequest;
    const { messages, rating, feedback, hadCrisis, mode } = body;

    // 验证
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '没有对话内容' }, { status: 400 });
    }
    if (!rating || rating < 1 || rating > 10) {
      return NextResponse.json({ error: '评分无效' }, { status: 400 });
    }

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
    console.error('[FEEDBACK ERROR]', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

