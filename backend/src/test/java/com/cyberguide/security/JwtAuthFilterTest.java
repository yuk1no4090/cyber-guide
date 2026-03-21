package com.cyberguide.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthFilterTest {

    @Mock
    private JwtTokenProvider tokenProvider;

    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthenticationFilter(tokenProvider);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void setsAnonymousPrincipalWhenAnonymousToken() throws Exception {
        when(tokenProvider.parseIdentity("anon-token"))
            .thenReturn(new JwtTokenProvider.TokenIdentity("s-1", "anonymous", null));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer anon-token");
        MockHttpServletResponse res = new MockHttpServletResponse();
        FilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertNotNull(auth);
        AuthPrincipal principal = (AuthPrincipal) auth.getPrincipal();
        assertEquals("anonymous", principal.type());
        assertEquals("ROLE_ANONYMOUS", auth.getAuthorities().iterator().next().getAuthority());
    }

    @Test
    void setsUserPrincipalWhenUserToken() throws Exception {
        when(tokenProvider.parseIdentity("user-token"))
            .thenReturn(new JwtTokenProvider.TokenIdentity("u-1", "user", "u@test.com"));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer user-token");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertNotNull(auth);
        AuthPrincipal principal = (AuthPrincipal) auth.getPrincipal();
        assertEquals("user", principal.type());
        assertEquals("u@test.com", principal.email());
        assertEquals("ROLE_USER", auth.getAuthorities().iterator().next().getAuthority());
    }

    @Test
    void doesNotSetAuthenticationWhenTokenInvalid() throws Exception {
        when(tokenProvider.parseIdentity("bad-token")).thenReturn(null);

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer bad-token");

        filter.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void doesNotSetAuthenticationWhenHeaderMissing() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();

        filter.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }
}
