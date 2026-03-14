package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.Random;

@Service
public class EmailCodeService {

    private static final Logger log = LoggerFactory.getLogger(EmailCodeService.class);
    private static final Duration CODE_TTL = Duration.ofMinutes(5);
    private static final Duration SEND_COOLDOWN = Duration.ofSeconds(60);
    private static final Duration SEND_WINDOW = Duration.ofHours(1);
    private static final int MAX_SEND_PER_HOUR = 10;
    private static final int MAX_VERIFY_ATTEMPTS = 6;

    private final StringRedisTemplate redis;
    private final Optional<JavaMailSender> mailSender;

    @Value("${security.email-code.from:}")
    private String fromEmail;

    @Value("${security.email-code.enabled:true}")
    private boolean enabled;

    @Value("${security.email-code.dev-log-only:true}")
    private boolean devLogOnly;

    @Value("${security.email-code.hash-pepper:cyber-guide-email-code-pepper}")
    private String hashPepper;

    public EmailCodeService(StringRedisTemplate redis, Optional<JavaMailSender> mailSender) {
        this.redis = redis;
        this.mailSender = mailSender;
    }

    public SendCodeResult sendRegisterCode(String email) {
        String normalizedEmail = normalizeEmail(email);
        if (!enabled) {
            log.info("email code disabled, skip send: email={}", normalizedEmail);
            return new SendCodeResult(0, 0);
        }
        ensureCanSend(normalizedEmail);

        String code = String.format("%06d", new Random().nextInt(1_000_000));
        String codeHash = sha256Hex(normalizedEmail + ":" + code + ":" + hashPepper);

        redis.opsForValue().set(codeKey(normalizedEmail), codeHash, CODE_TTL);
        redis.opsForValue().set(attemptKey(normalizedEmail), "0", CODE_TTL);
        redis.opsForValue().set(cooldownKey(normalizedEmail), "1", SEND_COOLDOWN);

        if (!enabled || devLogOnly || mailSender.isEmpty()) {
            log.info("email code (dev mode): email={}, code={}", normalizedEmail, code);
        } else {
            sendEmail(normalizedEmail, code);
        }
        return new SendCodeResult(CODE_TTL.toSeconds(), SEND_COOLDOWN.toSeconds());
    }

    public void verifyRegisterCode(String email, String code) {
        String normalizedEmail = normalizeEmail(email);
        if (!enabled) {
            // When email-code verification is disabled (local/dev), allow direct registration.
            return;
        }
        if (code == null || code.isBlank()) {
            throw new BizException(ErrorCode.EMAIL_CODE_INVALID, "请输入邮箱验证码");
        }
        String expectedHash = redis.opsForValue().get(codeKey(normalizedEmail));
        if (expectedHash == null || expectedHash.isBlank()) {
            throw new BizException(ErrorCode.EMAIL_CODE_EXPIRED);
        }
        String actualHash = sha256Hex(normalizedEmail + ":" + code.trim() + ":" + hashPepper);
        if (!expectedHash.equals(actualHash)) {
            long attempts = redis.opsForValue().increment(attemptKey(normalizedEmail));
            Long ttlSeconds = redis.getExpire(codeKey(normalizedEmail));
            if (ttlSeconds != null && ttlSeconds > 0) {
                redis.expire(attemptKey(normalizedEmail), Duration.ofSeconds(ttlSeconds));
            }
            if (attempts >= MAX_VERIFY_ATTEMPTS) {
                clearCode(normalizedEmail);
                throw new BizException(ErrorCode.EMAIL_CODE_EXPIRED, "验证码尝试次数过多，请重新获取");
            }
            throw new BizException(ErrorCode.EMAIL_CODE_INVALID);
        }
        clearCode(normalizedEmail);
    }

    private void clearCode(String normalizedEmail) {
        redis.delete(codeKey(normalizedEmail));
        redis.delete(attemptKey(normalizedEmail));
        redis.delete(cooldownKey(normalizedEmail));
    }

    private void ensureCanSend(String normalizedEmail) {
        String cooldown = redis.opsForValue().get(cooldownKey(normalizedEmail));
        if (cooldown != null) {
            Long ttl = redis.getExpire(cooldownKey(normalizedEmail));
            long retryAfter = (ttl == null || ttl < 0) ? SEND_COOLDOWN.toSeconds() : ttl;
            throw new BizException(ErrorCode.RATE_LIMITED, "发送过于频繁，请 " + retryAfter + " 秒后再试");
        }
        String countKey = sendCountKey(normalizedEmail);
        Long count = redis.opsForValue().increment(countKey);
        if (count != null && count == 1) {
            redis.expire(countKey, SEND_WINDOW);
        }
        if (count != null && count > MAX_SEND_PER_HOUR) {
            throw new BizException(ErrorCode.RATE_LIMITED, "该邮箱发送过于频繁，请稍后再试");
        }
    }

    private void sendEmail(String email, String code) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            if (fromEmail != null && !fromEmail.isBlank()) {
                message.setFrom(fromEmail);
            }
            message.setTo(email);
            message.setSubject("Cyber Guide 注册验证码");
            message.setText("你的验证码是：" + code + "\n5 分钟内有效。若非本人操作请忽略。");
            mailSender.orElseThrow().send(message);
        } catch (Exception e) {
            log.error("failed to send email code: email={}", email, e);
            throw new BizException(ErrorCode.INTERNAL_ERROR, "验证码发送失败，请稍后重试");
        }
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "email 不能为空");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || !normalized.contains("@")) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "email 格式无效");
        }
        return normalized;
    }

    private String codeKey(String email) {
        return "auth:email-code:register:" + email;
    }

    private String attemptKey(String email) {
        return "auth:email-code:attempt:" + email;
    }

    private String cooldownKey(String email) {
        return "auth:email-code:cooldown:" + email;
    }

    private String sendCountKey(String email) {
        return "auth:email-code:send-count:" + email;
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
        } catch (NoSuchAlgorithmException e) {
            throw new BizException(ErrorCode.INTERNAL_ERROR, "哈希算法不可用");
        }
    }

    public record SendCodeResult(long ttlSeconds, long cooldownSeconds) {}
}
