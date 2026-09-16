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

    @Test
    void refusesTheSecretCommittedToTheRepository() {
        // That value is public. A deployment still on it has no signing secret at
        // all, so starting up would be worse than not starting.
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> new JwtTokenProvider(JwtTokenProvider.COMMITTED_DEFAULT_SECRET, 86400000L));

        assertTrue(ex.getMessage().contains("JWT_SECRET"));
    }

    @Test
    void refusesAnEmptySecret() {
        assertThrows(IllegalStateException.class, () -> new JwtTokenProvider("", 86400000L));
    }

    @Test
    void refusesAShortSecretInsteadOfPaddingIt() {
        // The old behaviour zero-padded to 32 bytes, producing a key that is mostly
        // null bytes while still reporting as HS256 strength.
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> new JwtTokenProvider("too-short", 86400000L));

        assertTrue(ex.getMessage().contains("bytes"));
    }

    @Test
    void allowsTheCommittedDefaultOnlyUnderADevProfile() {
        JwtTokenProvider dev = new JwtTokenProvider(
                JwtTokenProvider.COMMITTED_DEFAULT_SECRET, 86400000L, "local");

        assertTrue(dev.validateToken(dev.generateAnonymousToken("s-1")));
    }

    @Test
    void anUnprofiledBootIsTreatedAsProduction() {
        assertThrows(IllegalStateException.class,
                () -> new JwtTokenProvider(JwtTokenProvider.COMMITTED_DEFAULT_SECRET, 86400000L, ""));
    }
}
