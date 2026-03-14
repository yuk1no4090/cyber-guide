package com.cyberguide.infrastructure.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Distributed rate limiter backed by Redis.
 * Uses a Lua script for atomic INCR + EXPIRE (sliding window counter).
 * <p>
 * Advantages over Resilience4j's in-memory RateLimiter:
 * - Shared across multiple backend instances
 * - Survives restarts (persisted in Redis)
 * - Consistent counting in a distributed deployment
 */
@Component
public class RedisRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisRateLimiter.class);

    /**
     * Lua script: atomically increment a counter and set expiry if new.
     * Returns the current count after increment.
     * This is atomic — no race conditions between INCR and EXPIRE.
     */
    private static final String RATE_LIMIT_SCRIPT = """
            local key = KEYS[1]
            local limit = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])
            local current = redis.call('INCR', key)
            if current == 1 then
                redis.call('EXPIRE', key, window)
            end
            return current
            """;

    private final RedisTemplate<String, Object> redisTemplate;
    private final DefaultRedisScript<Long> script;

    public RedisRateLimiter(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.script = new DefaultRedisScript<>(RATE_LIMIT_SCRIPT, Long.class);
    }

    /**
     * Check if a request is allowed under the rate limit.
     *
     * @param key       rate limit key (e.g. "rate:chat:session123")
     * @param limit     max requests allowed in the window
     * @param windowSec window duration in seconds
     * @return true if allowed, false if rate limited
     */
    public boolean isAllowed(String key, int limit, int windowSec) {
        try {
            Long count = redisTemplate.execute(script, List.of(key), (long) limit, (long) windowSec);
            if (count == null) return true; // Redis error, fail open
            boolean allowed = count <= limit;
            if (!allowed) {
                log.warn("rate limited: key={}, count={}, limit={}", key, count, limit);
            }
            return allowed;
        } catch (Exception e) {
            log.warn("Redis rate limiter failed, allowing request: key={}, error={}", key, e.getMessage());
            return true; // Graceful degradation: if Redis is down, allow the request
        }
    }

    /**
     * Convenience method for chat rate limiting.
     * Key format: rate:chat:{sessionId}
     */
    public boolean allowChat(String sessionId, int limitPerMinute) {
        return isAllowed("rate:chat:" + sessionId, limitPerMinute, 60);
    }
}
