import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface CaseCardRow {
  id?: string;
  created_at?: string;
  redacted_messages: Array<{ role: string; content: string }>;
  conversation_turns: number;
  had_crisis: boolean;
  rating: number;
  feedback: string | null;
  quality_tier: 'gold' | 'silver' | 'bronze' | 'needs_fix' | 'unrated';
  quality_score: number;
  mode: string;
}

export type ActionPlanStatus = 'todo' | 'done' | 'skipped';

export interface ActionPlanRow {
  id?: string;
  session_id: string;
  day_index: number;
  task_text: string;
  status: ActionPlanStatus;
  created_at?: string;
  updated_at?: string;
}

export interface SessionMetricsRow {
  id?: string;
  created_at?: string;
  session_id: string;
  mode: string;
  conversation_turns: number;
  user_msg_count: number;
  avg_user_msg_length: number;
  had_crisis: boolean;
  summary: string | null;
  prompt_version: string | null;
}

/**
 * 计算质量分级
 */
export function calculateQuality(
  rating: number,
  turns: number,
  avgUserMsgLength: number
): { score: number; tier: CaseCardRow['quality_tier'] } {
  // 用户评分权重 50%
  const ratingScore = (rating / 10) * 100;
  // 对话深度权重 30%（8轮以上满分）
  const depthScore = Math.min(turns / 8, 1) * 100;
  // 参与度权重 20%（用户平均消息50字以上满分）
  const engagementScore = Math.min(avgUserMsgLength / 50, 1) * 100;

  const score = ratingScore * 0.5 + depthScore * 0.3 + engagementScore * 0.2;

  let tier: CaseCardRow['quality_tier'];
  if (score >= 75) tier = 'gold';
  else if (score >= 55) tier = 'silver';
  else if (score >= 35) tier = 'bronze';
  else tier = 'needs_fix';

  return { score: Math.round(score * 10) / 10, tier };
}

