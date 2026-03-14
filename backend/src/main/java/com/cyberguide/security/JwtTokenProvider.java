package com.cyberguide.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private final SecretKey key;
    private final long expirationMs;

    public JwtTokenProvider(
            @Value("${security.jwt.secret:cyber-guide-default-secret-key-change-in-production-32chars!!}") String secret,
            @Value("${security.jwt.expiration-ms:86400000}") long expirationMs) {
        // Ensure key is at least 256 bits for HS256
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            byte[] padded = new byte[32];
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
