import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../src/lib/rate-limit';

describe('checkRateLimit - 限流', () => {
  it('第一次请求应该通过', () => {
    const result = checkRateLimit('test-ip-1', { windowMs: 60_000, maxRequests: 3 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('超过限制应该拒绝', () => {
    const key = 'test-ip-burst-' + Date.now();
    const config = { windowMs: 60_000, maxRequests: 2 };

    checkRateLimit(key, config); // 1
    checkRateLimit(key, config); // 2
    const result = checkRateLimit(key, config); // 3 - 超限

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('不同 key 应该独立计算', () => {
    const config = { windowMs: 60_000, maxRequests: 1 };

    const r1 = checkRateLimit('ip-a-' + Date.now(), config);
    const r2 = checkRateLimit('ip-b-' + Date.now(), config);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});

