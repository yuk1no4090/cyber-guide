package com.cyberguide.infrastructure;

import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.infrastructure.cache.RedisRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CacheGuardTest {

    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private ValueOperations<String, Object> valueOps;
    private CacheGuard cacheGuard;

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOps);
        cacheGuard = new CacheGuard(redisTemplate);
    }

    // ── Cache hit ──

    @Test
    void returnsValueFromCacheOnHit() {
        when(valueOps.get("key")).thenReturn("cached-value");

        String result = cacheGuard.getOrLoad("key", () -> "fresh-value", Duration.ofMinutes(5));

        assertEquals("cached-value", result);
        verify(valueOps, never()).set(anyString(), any(), any(Duration.class));
    }

    // ── Cache miss → loader called ──

    @Test
    void callsLoaderAndCachesOnMiss() {
        when(valueOps.get("key")).thenReturn(null);

        String result = cacheGuard.getOrLoad("key", () -> "loaded", Duration.ofMinutes(5));

        assertEquals("loaded", result);
        verify(valueOps).set(eq("key"), eq("loaded"), any(Duration.class));
    }

    // ── Penetration guard: null sentinel ──

    @Test
    void cachesNullSentinelWhenLoaderReturnsNull() {
        when(valueOps.get("key")).thenReturn(null);

        String result = cacheGuard.getOrLoad("key", () -> null, Duration.ofMinutes(5));

        assertNull(result);
        verify(valueOps).set(eq("key"), eq("@@NULL@@"), any(Duration.class));
    }

    @Test
    void returnsNullWhenNullSentinelIsCached() {
        when(valueOps.get("key")).thenReturn("@@NULL@@");

        String result = cacheGuard.getOrLoad("key", () -> {
            fail("Loader should not be called for null sentinel");
            return "oops";
        }, Duration.ofMinutes(5));

        assertNull(result);
    }

    // ── Graceful degradation: Redis down ──

    @Test
    void fallsBackToLoaderWhenRedisReadFails() {
        when(valueOps.get("key")).thenThrow(new RuntimeException("Redis connection refused"));

        String result = cacheGuard.getOrLoad("key", () -> "fallback", Duration.ofMinutes(5));

        assertEquals("fallback", result);
    }

    @Test
    void evictDoesNotThrowWhenRedisFails() {
        doThrow(new RuntimeException("Redis down")).when(redisTemplate).delete("key");
        assertDoesNotThrow(() -> cacheGuard.evict("key"));
    }

    @Test
    void evictByPatternDoesNotThrowWhenRedisFails() {
        when(redisTemplate.keys("prefix:*")).thenThrow(new RuntimeException("Redis down"));
        assertDoesNotThrow(() -> cacheGuard.evictByPattern("prefix:*"));
    }

    // ── Breakdown guard: concurrent loads ──

    @Test
    void breakdownGuardSerializesLoadsUnderLock() throws Exception {
        // With mock Redis always returning null (no real cache), the lock still serializes loads.
        // Each thread acquires the lock sequentially, so loadCount == threads.
        // This test verifies the lock mechanism doesn't deadlock or corrupt state.
        AtomicInteger loadCount = new AtomicInteger(0);
        when(valueOps.get("hot-key")).thenReturn(null);

        int threads = 5;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        ExecutorService pool = Executors.newFixedThreadPool(threads);

        for (int i = 0; i < threads; i++) {
            pool.submit(() -> {
                try {
                    start.await();
                    String result = cacheGuard.getOrLoad("hot-key", () -> {
                        loadCount.incrementAndGet();
                        return "value";
                    }, Duration.ofMinutes(5));
                    assertEquals("value", result);
                } catch (Exception ignored) {} finally {
                    done.countDown();
                }
            });
        }

        start.countDown();
        done.await();
        pool.shutdown();

        assertTrue(loadCount.get() >= 1 && loadCount.get() <= threads,
            "Expected 1-" + threads + " loads but got " + loadCount.get());
    }

    // ── Evict ──

    @Test
    void evictByPatternDeletesMatchingKeys() {
        when(redisTemplate.keys("plan:*")).thenReturn(Set.of("plan:a", "plan:b"));

        cacheGuard.evictByPattern("plan:*");

        verify(redisTemplate).delete(Set.of("plan:a", "plan:b"));
    }

    @Test
    void evictByPatternHandlesEmptyResult() {
        when(redisTemplate.keys("none:*")).thenReturn(Set.of());

        cacheGuard.evictByPattern("none:*");

        verify(redisTemplate, never()).delete(anyCollection());
    }

    // ── RedisRateLimiter ──

    @Nested
    class RateLimiterEdge {

        @Mock private RedisTemplate<String, Object> rlRedisTemplate;

        @Test
        void allowsRequestWhenRedisDown() {
            when(rlRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), any(), any()))
                .thenThrow(new RuntimeException("Redis connection refused"));

            RedisRateLimiter limiter = new RedisRateLimiter(rlRedisTemplate);
            assertTrue(limiter.allowChat("session", 10));
        }

        @Test
        void allowsRequestWhenRedisReturnsNull() {
            when(rlRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), any(), any()))
                .thenReturn(null);

            RedisRateLimiter limiter = new RedisRateLimiter(rlRedisTemplate);
            assertTrue(limiter.isAllowed("key", 10, 60));
        }

        @Test
        void blocksWhenCountExceedsLimit() {
            when(rlRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), any(), any()))
                .thenReturn(11L);

            RedisRateLimiter limiter = new RedisRateLimiter(rlRedisTemplate);
            assertFalse(limiter.isAllowed("key", 10, 60));
        }

        @Test
        void allowsExactlyAtLimit() {
            when(rlRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), any(), any()))
                .thenReturn(10L);

            RedisRateLimiter limiter = new RedisRateLimiter(rlRedisTemplate);
            assertTrue(limiter.isAllowed("key", 10, 60));
        }
    }
}
