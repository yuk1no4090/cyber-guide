package com.cyberguide.security;

import com.cyberguide.support.TestSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
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
}
