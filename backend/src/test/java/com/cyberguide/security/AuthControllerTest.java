package com.cyberguide.security;

import com.cyberguide.support.TestSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@Import(TestSecurityConfig.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtTokenProvider tokenProvider;

    @MockBean
    private AuthService authService;

    @MockBean
    private AuthUpgradeService authUpgradeService;

    @MockBean
    private EmailCodeService emailCodeService;

    @Test
    void anonymousIssuesJwtToken() throws Exception {
        when(tokenProvider.generateAnonymousToken("session-test")).thenReturn("jwt-token-value");

        mockMvc.perform(post("/api/auth/anonymous")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "session_id":"session-test"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("jwt-token-value"))
            .andExpect(jsonPath("$.session_id").value("session-test"))
            .andExpect(jsonPath("$.type").value("anonymous"));

        verify(tokenProvider).generateAnonymousToken("session-test");
    }

    @Test
    void anonymousGeneratesSessionIdWhenBodyMissing() throws Exception {
        when(tokenProvider.generateAnonymousToken(anyString())).thenReturn("jwt-generated");

        mockMvc.perform(post("/api/auth/anonymous")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("jwt-generated"))
            .andExpect(jsonPath("$.session_id").isString())
            .andExpect(jsonPath("$.type").value("anonymous"));
    }

    @Test
    void meReturnsAnonymousPrincipalPayload() throws Exception {
        var anonymousAuth = new UsernamePasswordAuthenticationToken(
                new AuthPrincipal("session-1", "anonymous", null),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))
        );

        mockMvc.perform(get("/api/auth/me").with(authentication(anonymousAuth)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isLoggedIn").value(false))
                .andExpect(jsonPath("$.data.type").value("anonymous"))
                .andExpect(jsonPath("$.data.session_id").value("session-1"));
    }

    @Test
    void meReturnsLoggedInUserPayload() throws Exception {
        UUID userId = UUID.randomUUID();
        var userAuth = new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(userId.toString(), "user", "user@test.com"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        AuthService.UserView userView = new AuthService.UserView(
                userId.toString(),
                "user@test.com",
                "Tester",
                null,
                "user"
        );
        when(authService.getUserView(userId)).thenReturn(java.util.Optional.of(userView));

        mockMvc.perform(get("/api/auth/me").with(authentication(userAuth)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isLoggedIn").value(true))
                .andExpect(jsonPath("$.data.type").value("user"))
                .andExpect(jsonPath("$.data.user.email").value("user@test.com"));
    }

    @Test
    void upgradeMigratesAnonymousSessionForLoggedInUser() throws Exception {
        UUID userId = UUID.randomUUID();
        var userAuth = new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(userId.toString(), "user", "user@test.com"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        when(tokenProvider.parseIdentity("anon-jwt"))
                .thenReturn(new JwtTokenProvider.TokenIdentity("session-1", "anonymous", null));
        when(authUpgradeService.upgradeSessionData("session-1", userId))
                .thenReturn(Map.of("plans", 1, "feedback", 2, "sessions", 3));

        mockMvc.perform(post("/api/auth/upgrade")
                        .with(authentication(userAuth))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "session_id":"session-1",
                              "anonymous_token":"anon-jwt"
                            }
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.migrated.plans").value(1))
                .andExpect(jsonPath("$.data.migrated.feedback").value(2))
                .andExpect(jsonPath("$.data.migrated.sessions").value(3));

        verify(authUpgradeService).upgradeSessionData("session-1", userId);
    }

    @Test
    void upgradeRejectsMismatchedSessionIdentity() throws Exception {
        UUID userId = UUID.randomUUID();
        var userAuth = new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(userId.toString(), "user", "user@test.com"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        when(tokenProvider.parseIdentity("anon-jwt"))
                .thenReturn(new JwtTokenProvider.TokenIdentity("other-session", "anonymous", null));

        mockMvc.perform(post("/api/auth/upgrade")
                        .with(authentication(userAuth))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "session_id":"session-1",
                              "anonymous_token":"anon-jwt"
                            }
                            """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void upgradeRejectsMissingAnonymousToken() throws Exception {
        UUID userId = UUID.randomUUID();
        var userAuth = new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(userId.toString(), "user", "user@test.com"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );

        mockMvc.perform(post("/api/auth/upgrade")
                        .with(authentication(userAuth))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "session_id":"session-1",
                              "anonymous_token":""
                            }
                            """))
                .andExpect(status().isUnauthorized());
    }
}
