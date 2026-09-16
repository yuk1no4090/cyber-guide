package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.infrastructure.cache.RedisRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthRateLimiterTest {

    @Mock
    private RedisRateLimiter limiter;

    private AuthRateLimiter authRateLimiter;

    @BeforeEach
    void setUp() {
        authRateLimiter = new AuthRateLimiter(limiter);
        ReflectionTestUtils.setField(authRateLimiter, "loginPerWindow", 10);
        ReflectionTestUtils.setField(authRateLimiter, "loginWindowSeconds", 900);
        ReflectionTestUtils.setField(authRateLimiter, "registerPerEmail", 5);
        ReflectionTestUtils.setField(authRateLimiter, "registerGlobal", 60);
    }

    @Test
    void loginIsKeyedOnTheNormalizedEmail() {
        when(limiter.isAllowed("rate:auth:login:user@example.com", 10, 900)).thenReturn(true);

        // Case and surrounding whitespace must not open a second bucket, or the
        // limit is bypassed by typing the same address differently.
        authRateLimiter.checkLogin("  User@Example.COM  ");

        verify(limiter).isAllowed("rate:auth:login:user@example.com", 10, 900);
    }

    @Test
    void loginOverTheLimitIsRejectedAsRateLimited() {
        when(limiter.isAllowed(eq("rate:auth:login:a@example.com"), anyInt(), anyInt())).thenReturn(false);

        BizException ex = assertThrows(BizException.class, () -> authRateLimiter.checkLogin("a@example.com"));

        assertEquals(ErrorCode.RATE_LIMITED, ex.getErrorCode());
    }

    @Test
    void successfulLoginClearsTheCounter() {
        authRateLimiter.clearLogin("A@Example.com");

        // Without this a person signing in normally would accumulate their way
        // into a block they did nothing to deserve.
        verify(limiter).reset("rate:auth:login:a@example.com");
    }

    @Test
    void registerChecksBothTheEmailBudgetAndTheInstanceCeiling() {
        when(limiter.isAllowed("rate:auth:register:new@example.com", 5, 3600)).thenReturn(true);
        when(limiter.isAllowed("rate:auth:register:global", 60, 3600)).thenReturn(true);

        assertDoesNotThrow(() -> authRateLimiter.checkRegister("new@example.com"));

        verify(limiter).isAllowed("rate:auth:register:new@example.com", 5, 3600);
        verify(limiter).isAllowed("rate:auth:register:global", 60, 3600);
    }

    @Test
    void registerStopsAtTheEmailBudgetBeforeSpendingTheGlobalOne() {
        when(limiter.isAllowed("rate:auth:register:spam@example.com", 5, 3600)).thenReturn(false);
        lenient().when(limiter.isAllowed("rate:auth:register:global", 60, 3600)).thenReturn(true);

        assertThrows(BizException.class, () -> authRateLimiter.checkRegister("spam@example.com"));

        verify(limiter, never()).isAllowed("rate:auth:register:global", 60, 3600);
    }

    @Test
    void registerIsRejectedWhenTheInstanceCeilingIsReached() {
        // Per-email counting cannot see mass account creation: every attempt uses a
        // fresh address, so only the instance-wide counter catches it.
        when(limiter.isAllowed("rate:auth:register:fresh@example.com", 5, 3600)).thenReturn(true);
        when(limiter.isAllowed("rate:auth:register:global", 60, 3600)).thenReturn(false);

        BizException ex = assertThrows(BizException.class, () -> authRateLimiter.checkRegister("fresh@example.com"));

        assertEquals(ErrorCode.RATE_LIMITED, ex.getErrorCode());
    }
}
