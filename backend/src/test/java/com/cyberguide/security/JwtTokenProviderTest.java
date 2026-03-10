package com.cyberguide.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenProviderTest {

    private JwtTokenProvider provider;

    @BeforeEach
    void setUp() {
        provider = new JwtTokenProvider(
            "test-secret-key-at-least-32-chars!!", 86400000L
        );
    }

    @Test
    void generateAndValidate() {
        String token = provider.generateAnonymousToken("session-123");
        assertNotNull(token);
        assertTrue(provider.validateToken(token));
    }

    @Test
    void extractSessionId() {
        String token = provider.generateAnonymousToken("session-abc");
        assertEquals("session-abc", provider.getSessionId(token));
    }

    @Test
    void invalidTokenReturnsNull() {
        assertNull(provider.getSessionId("garbage.token.here"));
        assertFalse(provider.validateToken("garbage.token.here"));
    }

    @Test
    void expiredTokenIsInvalid() {
        JwtTokenProvider shortLived = new JwtTokenProvider(
            "test-secret-key-at-least-32-chars!!", 1L // 1ms expiration
        );
        String token = shortLived.generateAnonymousToken("session-expired");
        try { Thread.sleep(50); } catch (InterruptedException ignored) {}
        assertNull(shortLived.getSessionId(token));
    }

    @Test
    void differentSessionsProduceDifferentTokens() {
        String t1 = provider.generateAnonymousToken("session-1");
        String t2 = provider.generateAnonymousToken("session-2");
        assertNotEquals(t1, t2);
    }
}
