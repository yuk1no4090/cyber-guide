package com.cyberguide.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * JWT token provider — generates and validates stateless tokens.
 * Supports both anonymous session tokens and logged-in user tokens.
 */
@Component
public class JwtTokenProvider {

    private static final Logger log = LoggerFactory.getLogger(JwtTokenProvider.class);

    /**
     * The value that ships in application.yml. It is in a public repository, so a
     * deployment still running on it has no signing secret at all: anyone can mint
     * a token for any user. Refusing to start is the only honest response.
     */
    static final String COMMITTED_DEFAULT_SECRET =
            "cyber-guide-default-secret-key-change-in-production-32chars!!";

    private static final int MIN_SECRET_BYTES = 32;

    private final SecretKey key;
    private final long expirationMs;

    /** Test/non-Spring entry point. Applies production strictness, which is what tests should see. */
    public JwtTokenProvider(String secret, long expirationMs) {
        this(secret, expirationMs, "");
    }

    // With two constructors Spring cannot pick one on its own: it looks for a
    // no-arg constructor instead and the context fails to start. Say which.
    @Autowired
    public JwtTokenProvider(
            @Value("${security.jwt.secret:}") String secret,
            @Value("${security.jwt.expiration-ms:86400000}") long expirationMs,
            @Value("${spring.profiles.active:}") String activeProfiles) {

        boolean relaxed = SecurityUtils.isDevLikeProfile(activeProfiles);

        if (secret == null || secret.isBlank() || COMMITTED_DEFAULT_SECRET.equals(secret)) {
            String problem = "JWT_SECRET is unset or still the default committed in application.yml";
            if (!relaxed) {
                throw new IllegalStateException(problem
                        + ". Set JWT_SECRET to a private random value of at least "
                        + MIN_SECRET_BYTES + " bytes before starting outside a dev profile.");
            }
            log.warn("{} -- allowed only because a dev profile is active: {}", problem, activeProfiles);
            secret = COMMITTED_DEFAULT_SECRET;
        }

        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < MIN_SECRET_BYTES) {
            // The old behaviour zero-padded, which turns a short secret into a key
            // that is mostly null bytes while still reporting as HS256 strength.
            if (!relaxed) {
                throw new IllegalStateException("JWT_SECRET is only " + keyBytes.length
                        + " bytes; HS256 needs at least " + MIN_SECRET_BYTES
                        + ". Padding it would fake the key strength, so startup stops here.");
            }
            log.warn("JWT secret is {} bytes, padding to {} -- dev profile only", keyBytes.length, MIN_SECRET_BYTES);
            byte[] padded = new byte[MIN_SECRET_BYTES];
            System.arraycopy(keyBytes, 0, padded, 0, keyBytes.length);
            keyBytes = padded;
        }

        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.expirationMs = expirationMs;
    }


    /**
     * Generate an anonymous session token.
     */
    public String generateAnonymousToken(String sessionId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(sessionId)
                .claim("type", "anonymous")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationMs)))
                .signWith(key)
                .compact();
    }

    public String generateUserToken(String userId, String email) {
        Instant now = Instant.now();
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(userId)
                .claim("type", "user")
                .claim("email", email)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationMs)))
                .signWith(key)
                .compact();
    }

    /**
     * Extract session ID (subject) from token.
     * Returns null if token is invalid or expired.
     */
    public String getSessionId(String token) {
        TokenIdentity identity = parseIdentity(token);
        if (identity == null || !"anonymous".equals(identity.type())) {
            return null;
        }
        return identity.subject();
    }

    public String getUserId(String token) {
        TokenIdentity identity = parseIdentity(token);
        if (identity == null || !"user".equals(identity.type())) {
            return null;
        }
        return identity.subject();
    }

    public TokenIdentity parseIdentity(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            String type = claims.get("type", String.class);
            if (type == null || type.isBlank()) {
                type = "anonymous";
            }
            return new TokenIdentity(
                    claims.getSubject(),
                    type,
                    claims.get("email", String.class)
            );
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Invalid JWT: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Validate a token — returns true if valid and not expired.
     */
    public boolean validateToken(String token) {
        return parseIdentity(token) != null;
    }

    public record TokenIdentity(String subject, String type, String email) {}
}
