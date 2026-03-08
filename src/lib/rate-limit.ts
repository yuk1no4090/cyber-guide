/**
 * 内存级 IP 限流器
 *
 * ⚠️ 已知局限（PM2 fork 模式 / serverless）：
 *   - 每个进程维护独立的 Map，多进程下实际限额 = maxRequests × 进程数
 *   - 冷启动 / 重启后计数器归零
 *   - 生产环境如需精确限流，应迁移到 Redis（推荐 ioredis + 滑动窗口）
 *     或 Supabase Edge Function rate-limit
 *
 * 当前方案仍能有效防御单进程内的突发刷量，对于小流量站点足够。
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// 定期清理过期条目（防内存泄漏）
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key);
  });
}, 60_000);

export interface RateLimitConfig {
  windowMs: number;   // 时间窗口（毫秒）
  maxRequests: number; // 窗口内最大请求数
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** 预设限流配置 */
export const RATE_LIMITS = {
  /** 主聊天接口：15 req/min */
  chat: { windowMs: 60_000, maxRequests: 15 } as RateLimitConfig,
  /** 反馈提交：5 req/min（一次会话通常只提交一次） */
  feedback: { windowMs: 60_000, maxRequests: 5 } as RateLimitConfig,
  /** 计划生成：5 req/min */
  planGenerate: { windowMs: 60_000, maxRequests: 5 } as RateLimitConfig,
  /** 计划更新/读取：20 req/min */
  planMutate: { windowMs: 60_000, maxRequests: 20 } as RateLimitConfig,
  /** 指标上报：10 req/min */
  metrics: { windowMs: 60_000, maxRequests: 10 } as RateLimitConfig,
} as const;

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { windowMs: 60_000, maxRequests: 15 }
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // 新窗口
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * 从 NextRequest 中提取客户端 IP
 */
export function getClientIP(request: Request): string {
  const forwarded = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const real = request.headers.get('x-real-ip') || '';
  return forwarded || real || 'unknown';
}

