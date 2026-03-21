package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmailCodeServiceTest {

    @Mock
    private StringRedisTemplate redis;

    @Mock
    private ValueOperations<String, String> valueOps;

    private EmailCodeService service;

    @BeforeEach
    void setUp() {
        service = new EmailCodeService(redis, Optional.empty());
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "devLogOnly", true);
        ReflectionTestUtils.setField(service, "hashPepper", "pepper");
        when(redis.opsForValue()).thenReturn(valueOps);
    }

    @Test
    void sendRegisterCodeStoresCodeAndCooldown() {
        String email = "a@example.com";
        when(valueOps.get("auth:email-code:cooldown:" + email)).thenReturn(null);
        when(valueOps.increment("auth:email-code:send-count:" + email)).thenReturn(1L);

        EmailCodeService.SendCodeResult result = service.sendRegisterCode(email);

        assertEquals(300L, result.ttlSeconds());
        assertEquals(60L, result.cooldownSeconds());
        verify(valueOps).set(eq("auth:email-code:register:" + email), any(), eq(Duration.ofMinutes(5)));
        verify(valueOps).set(eq("auth:email-code:attempt:" + email), eq("0"), eq(Duration.ofMinutes(5)));
        verify(valueOps).set(eq("auth:email-code:cooldown:" + email), eq("1"), eq(Duration.ofSeconds(60)));
    }

    @Test
    void verifyRegisterCodeClearsKeysWhenCodeCorrect() {
        String email = "ok@example.com";
        String expected = sha256Hex(email + ":123456:pepper");
        when(valueOps.get("auth:email-code:register:" + email)).thenReturn(expected);

        service.verifyRegisterCode(email, "123456");

        verify(redis).delete("auth:email-code:register:" + email);
        verify(redis).delete("auth:email-code:attempt:" + email);
        verify(redis).delete("auth:email-code:cooldown:" + email);
    }

    @Test
    void verifyRegisterCodeThrowsExpiredWhenMissing() {
        String email = "expired@example.com";
        when(valueOps.get("auth:email-code:register:" + email)).thenReturn(null);

        BizException ex = assertThrows(BizException.class, () -> service.verifyRegisterCode(email, "111111"));
        assertEquals(ErrorCode.EMAIL_CODE_EXPIRED, ex.getErrorCode());
    }

    @Test
    void verifyRegisterCodeThrowsExpiredAfterTooManyAttempts() {
        String email = "many@example.com";
        when(valueOps.get("auth:email-code:register:" + email)).thenReturn("hash-not-match");
        when(valueOps.increment("auth:email-code:attempt:" + email)).thenReturn(6L);
        when(redis.getExpire("auth:email-code:register:" + email)).thenReturn(120L);

        BizException ex = assertThrows(BizException.class, () -> service.verifyRegisterCode(email, "000000"));

        assertEquals(ErrorCode.EMAIL_CODE_EXPIRED, ex.getErrorCode());
        verify(redis).expire("auth:email-code:attempt:" + email, Duration.ofSeconds(120));
        verify(redis).delete("auth:email-code:register:" + email);
    }

    @Test
    void sendRegisterCodeThrowsRateLimitedWhenCooldownExists() {
        String email = "cool@example.com";
        when(valueOps.get("auth:email-code:cooldown:" + email)).thenReturn("1");
        when(redis.getExpire("auth:email-code:cooldown:" + email)).thenReturn(45L);

        BizException ex = assertThrows(BizException.class, () -> service.sendRegisterCode(email));

        assertEquals(ErrorCode.RATE_LIMITED, ex.getErrorCode());
        verify(valueOps, never()).increment("auth:email-code:send-count:" + email);
    }

    private String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
