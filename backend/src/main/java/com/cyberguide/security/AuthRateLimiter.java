package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.infrastructure.cache.RedisRateLimiter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Rate limits for the credential endpoints.
 * <p>
 * Everything here is keyed on the <em>email</em> rather than the client IP, which
 * is a deliberate choice forced by the deployment: nginx and a Next.js rewrite
 * both sit in front of this service, so every request arrives from 127.0.0.1 and
 * the only record of the real client is an {@code X-Forwarded-For} chain whose
 * left-hand entries the client itself can write. An IP-keyed limit would put the
 * whole internet in one bucket while still being bypassable with a forged header.
 * The email is the thing an attacker cannot vary while still attacking a given
 * account, so it is the honest key for a login limit.
 * <p>
 * Registration additionally carries an instance-wide limit, because per-email
 * counting cannot see mass account creation: every attempt uses a fresh address.
 */
@Component
public class AuthRateLimiter {

    private final RedisRateLimiter limiter;

    /** Login attempts allowed per email per window. Generous enough that a human never notices. */
    @Value("${security.rate-limit.login-per-window:10}")
    private int loginPerWindow;

    @Value("${security.rate-limit.login-window-seconds:900}")
    private int loginWindowSeconds;

    @Value("${security.rate-limit.register-per-email-per-hour:5}")
    private int registerPerEmail;

    /** Instance-wide registration ceiling. Sized for a demo site, not a signup funnel. */
    @Value("${security.rate-limit.register-global-per-hour:60}")
    private int registerGlobal;

    public AuthRateLimiter(RedisRateLimiter limiter) {
        this.limiter = limiter;
    }

    /**
     * A deliberate rate limit, not a lockout: the window is short and the budget
     * generous, so an attacker burning a victim's budget costs that victim a wait
     * rather than access. A hard lockout would hand anyone who knows an address a
     * denial-of-service against its owner.
     */
    public void checkLogin(String email) {
        String key = "rate:auth:login:" + normalize(email);
        if (!limiter.isAllowed(key, loginPerWindow, loginWindowSeconds)) {
            throw new BizException(ErrorCode.RATE_LIMITED);
        }
    }

    /** Called after a successful login so a legitimate user never accumulates a block. */
    public void clearLogin(String email) {
        limiter.reset("rate:auth:login:" + normalize(email));
    }

    public void checkRegister(String email) {
        if (!limiter.isAllowed("rate:auth:register:" + normalize(email), registerPerEmail, 3600)) {
            throw new BizException(ErrorCode.RATE_LIMITED);
        }
        if (!limiter.isAllowed("rate:auth:register:global", registerGlobal, 3600)) {
            throw new BizException(ErrorCode.RATE_LIMITED);
        }
    }

    /** Same normalization the persistence layer uses, so the counter and the account agree. */
    private String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
