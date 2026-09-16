package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
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
        lenient().when(redis.opsForValue()).thenReturn(valueOps);
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


    @Test
    void isEnabledMirrorsConfiguration() {
        assertTrue(service.isEnabled());
        ReflectionTestUtils.setField(service, "enabled", false);
        assertFalse(service.isEnabled());
    }

    @Test
    void sendRegisterCodeReportsNotDeliveredUnderDevLogOnly() {
        String email = "devlog@example.com";
        when(valueOps.get("auth:email-code:cooldown:" + email)).thenReturn(null);
        when(valueOps.increment("auth:email-code:send-count:" + email)).thenReturn(1L);

        EmailCodeService.SendCodeResult result = service.sendRegisterCode(email);

        // The code is real and verifiable, but it only reached the server log.
        // Callers must not tell the user to go check their inbox.
        assertFalse(result.delivered());
    }

    @Test
    void sendRegisterCodeReportsNothingHappenedWhenVerificationDisabled() {
        ReflectionTestUtils.setField(service, "enabled", false);

        EmailCodeService.SendCodeResult result = service.sendRegisterCode("off@example.com");

        assertFalse(result.delivered());
        assertEquals(0L, result.ttlSeconds());
        assertEquals(0L, result.cooldownSeconds());
        verifyNoInteractions(valueOps);
    }

    @Test
    void sendRegisterCodeReportsDeliveredWhenSmtpIsConfigured() {
        JavaMailSender sender = mock(JavaMailSender.class);
        EmailCodeService live = new EmailCodeService(redis, Optional.of(sender));
        ReflectionTestUtils.setField(live, "enabled", true);
        ReflectionTestUtils.setField(live, "devLogOnly", false);
        ReflectionTestUtils.setField(live, "hashPepper", "pepper");
        ReflectionTestUtils.setField(live, "mailHost", "smtp.example.com");
        String email = "real@example.com";
        when(valueOps.get("auth:email-code:cooldown:" + email)).thenReturn(null);
        when(valueOps.increment("auth:email-code:send-count:" + email)).thenReturn(1L);

        EmailCodeService.SendCodeResult result = live.sendRegisterCode(email);

        assertTrue(result.delivered());
        verify(sender).send(any(SimpleMailMessage.class));
    }

    @Test
    void sendRegisterCodeFallsBackToLogWhenSmtpHostIsMissing() {
        // Boot auto-configures a JavaMailSender even when spring.mail.host is
        // blank, so the bean exists but cannot reach any server. Registration
        // must stay possible instead of failing with a 500 on every attempt.
        JavaMailSender stub = mock(JavaMailSender.class);
        EmailCodeService halfConfigured = new EmailCodeService(redis, Optional.of(stub));
        ReflectionTestUtils.setField(halfConfigured, "enabled", true);
        ReflectionTestUtils.setField(halfConfigured, "devLogOnly", false);
        ReflectionTestUtils.setField(halfConfigured, "hashPepper", "pepper");
        ReflectionTestUtils.setField(halfConfigured, "mailHost", "");
        String email = "halfconf@example.com";
        when(valueOps.get("auth:email-code:cooldown:" + email)).thenReturn(null);
        when(valueOps.increment("auth:email-code:send-count:" + email)).thenReturn(1L);

        EmailCodeService.SendCodeResult result = halfConfigured.sendRegisterCode(email);

        assertFalse(result.delivered());
        verifyNoInteractions(stub);
    }

    @Test
    void warnOnUndeliverableConfigDoesNotThrow() {
        ReflectionTestUtils.setField(service, "devLogOnly", false);
        ReflectionTestUtils.setField(service, "mailHost", "");
        service.warnOnUndeliverableConfig();
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
