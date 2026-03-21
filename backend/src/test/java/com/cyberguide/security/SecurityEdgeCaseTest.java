package com.cyberguide.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class SecurityEdgeCaseTest {

    private static final String SECRET = "test-secret-key-for-unit-tests-minimum-32-chars!!";
    private static final long EXPIRATION_MS = 3600000;
    private final JwtTokenProvider provider = new JwtTokenProvider(SECRET, EXPIRATION_MS);

    // ── Token generation ──

    @Test
    void anonymousTokenContainsCorrectClaims() {
        String token = provider.generateAnonymousToken("sess-1");
        JwtTokenProvider.TokenIdentity id = provider.parseIdentity(token);

        assertNotNull(id);
        assertEquals("sess-1", id.subject());
        assertEquals("anonymous", id.type());
        assertNull(id.email());
    }

    @Test
    void userTokenContainsEmailClaim() {
        String token = provider.generateUserToken("uid-1", "user@test.com");
        JwtTokenProvider.TokenIdentity id = provider.parseIdentity(token);

        assertNotNull(id);
        assertEquals("uid-1", id.subject());
        assertEquals("user", id.type());
        assertEquals("user@test.com", id.email());
    }

    // ── Expired token ──

    @Test
    void expiredTokenReturnsNull() {
        JwtTokenProvider shortLived = new JwtTokenProvider(SECRET, 1);
        String token = shortLived.generateAnonymousToken("expired");
        try { Thread.sleep(50); } catch (InterruptedException ignored) {}

        assertNull(shortLived.parseIdentity(token));
        assertFalse(shortLived.validateToken(token));
        assertNull(shortLived.getSessionId(token));
    }

    // ── Tampered / malformed tokens ──

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
        "not.a.jwt",
        "eyJhbGciOiJIUzI1NiJ9.tampered.signature",
        "Bearer eyJhbGciOiJIUzI1NiJ9",
        "null",
        " ",
        "eyJhbGciOiJIUzI1NiJ9.e30.   ",
        "a]]]b{{{c",
    })
    void malformedTokensReturnNull(String badToken) {
        assertNull(provider.parseIdentity(badToken));
        assertFalse(provider.validateToken(badToken == null ? "" : badToken));
    }

    @Test
    void tokenSignedWithDifferentSecretIsRejected() {
        JwtTokenProvider other = new JwtTokenProvider("different-secret-key-at-least-32-chars-long!!", EXPIRATION_MS);
        String foreignToken = other.generateAnonymousToken("hacker");

        assertNull(provider.parseIdentity(foreignToken));
    }

    @Test
    void tokenWithModifiedPayloadIsRejected() {
        String token = provider.generateAnonymousToken("legit");
        String[] parts = token.split("\\.");
        assertEquals(3, parts.length);

        // Flip a character in the payload
        char[] payload = parts[1].toCharArray();
        payload[0] = (payload[0] == 'a') ? 'b' : 'a';
        String tampered = parts[0] + "." + new String(payload) + "." + parts[2];

        assertNull(provider.parseIdentity(tampered));
    }

    // ── Type confusion ──

    @Test
    void getSessionIdRejectsUserTokens() {
        String userToken = provider.generateUserToken("uid", "e@e.com");
        assertNull(provider.getSessionId(userToken));
    }

    @Test
    void getUserIdRejectsAnonymousTokens() {
        String anonToken = provider.generateAnonymousToken("sess");
        assertNull(provider.getUserId(anonToken));
    }

    // ── Token with missing "type" claim ──

    @Test
    void tokenWithNoTypeClaimDefaultsToAnonymous() {
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        String token = Jwts.builder()
                .subject("no-type")
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusMillis(EXPIRATION_MS)))
                .signWith(key)
                .compact();

        JwtTokenProvider.TokenIdentity id = provider.parseIdentity(token);
        assertNotNull(id);
        assertEquals("anonymous", id.type());
    }

    // ── AuthPrincipal edge cases ──

    @Test
    void authPrincipalRoleChecks() {
        var anon = new AuthPrincipal("s1", "anonymous", null);
        assertTrue(anon.isAnonymous());
        assertFalse(anon.isUser());

        var user = new AuthPrincipal("u1", "user", "a@b.com");
        assertTrue(user.isUser());
        assertFalse(user.isAnonymous());

        var unknown = new AuthPrincipal("x", "admin", null);
        assertFalse(unknown.isUser());
        assertFalse(unknown.isAnonymous());
    }
}
