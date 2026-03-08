package com.cyberguide.infrastructure.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Cache guard — protects against the three classic cache failure modes:
 * <ul>
 *   <li>Cache Penetration: queries for non-existent keys bypass cache and hit DB repeatedly.
 *       Mitigated by caching null markers with short TTL.</li>
 *   <li>Cache Avalanche: many keys expire simultaneously, causing a DB stampede.
 *       Mitigated by adding random jitter (+/- 20%) to TTL.</li>
 *   <li>Cache Breakdown: a single hot key expires while many threads request it.
 *       Mitigated by a local lock so only one thread loads the value.</li>
 * </ul>
 */
@Component
public class CacheGuard {

    private static final Logger log = LoggerFactory.getLogger(CacheGuard.class);

    /** Sentinel value stored in Redis to represent a cached null (penetration guard). */
    private static final String NULL_SENTINEL = "@@NULL@@";

    /** TTL for null sentinels — short, so real data can fill in quickly. */
    private static final Duration NULL_TTL = Duration.ofMinutes(2);

    /** Local locks to prevent cache breakdown (one lock per key prefix). */
    private final ConcurrentHashMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    private final RedisTemplate<String, Object> redisTemplate;

    public CacheGuard(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * Get a value from cache, or load it via the supplier if missing.
     * Applies all three protections: penetration, avalanche, breakdown.
     *
     * @param key      Redis key
     * @param loader   function to load the value on cache miss (may return null)
     * @param baseTtl  base TTL for the cached value (jitter will be applied)
     * @param <T>      value type
     * @return the cached or freshly loaded value, or null if the source returns null
     */
    @SuppressWarnings("unchecked")
    public <T> T getOrLoad(String key, Supplier<T> loader, Duration baseTtl) {
        // 1. Try cache first
        try {
            Object cached = redisTemplate.opsForValue().get(key);
            if (cached != null) {
                if (NULL_SENTINEL.equals(cached)) {
                    log.debug("cache hit (null sentinel): key={}", key);
                    return null;  // penetration guard: we know this key has no data
                }
                log.debug("cache hit: key={}", key);
                return (T) cached;
            }
        } catch (Exception e) {
            log.warn("Redis read failed, falling through to loader: key={}, error={}", key, e.getMessage());
            // Graceful degradation: if Redis is down, just load from source
            return loader.get();
        }

        // 2. Cache miss — acquire lock to prevent breakdown
        ReentrantLock lock = locks.computeIfAbsent(key, k -> new ReentrantLock());
        lock.lock();
        try {
            // Double-check after acquiring lock (another thread may have loaded it)
            try {
                Object doubleCheck = redisTemplate.opsForValue().get(key);
                if (doubleCheck != null) {
                    if (NULL_SENTINEL.equals(doubleCheck)) return null;
                    return (T) doubleCheck;
                }
            } catch (Exception e) {
                // Redis still down, just load
            }

            // 3. Load from source
            T value = loader.get();

            // 4. Write to cache with jittered TTL (avalanche guard)
            try {
                Duration jitteredTtl = addJitter(baseTtl);
                if (value != null) {
                    redisTemplate.opsForValue().set(key, value, jitteredTtl);
                    log.debug("cache set: key={}, ttl={}s", key, jitteredTtl.getSeconds());
                } else {
                    // Penetration guard: cache null sentinel with short TTL
                    redisTemplate.opsForValue().set(key, NULL_SENTINEL, NULL_TTL);
                    log.debug("cache set (null sentinel): key={}, ttl={}s", key, NULL_TTL.getSeconds());
                }
            } catch (Exception e) {
                log.warn("Redis write failed: key={}, error={}", key, e.getMessage());
            }

            return value;
        } finally {
            lock.unlock();
            // Clean up lock if no one else is waiting
            locks.remove(key, lock);
        }
    }

    /**
     * Evict a cache entry.
     */
    public void evict(String key) {
        try {
            redisTemplate.delete(key);
            log.debug("cache evict: key={}", key);
        } catch (Exception e) {
            log.warn("Redis evict failed: key={}, error={}", key, e.getMessage());
        }
    }

    /**
     * Evict all entries matching a key pattern (e.g. "plan:session123:*").
     */
    public void evictByPattern(String pattern) {
        try {
            var keys = redisTemplate.keys(pattern);
            if (keys != null && !keys.isEmpty()) {
                redisTemplate.delete(keys);
                log.debug("cache evict pattern: pattern={}, count={}", pattern, keys.size());
            }
        } catch (Exception e) {
            log.warn("Redis evict pattern failed: pattern={}, error={}", pattern, e.getMessage());
        }
    }

    /**
     * Add +/- 20% random jitter to a TTL to prevent cache avalanche.
     */
    private Duration addJitter(Duration base) {
        long baseMs = base.toMillis();
        long jitter = (long) (baseMs * 0.2);
        long offset = ThreadLocalRandom.current().nextLong(-jitter, jitter + 1);
        return Duration.ofMillis(baseMs + offset);
    }
}
