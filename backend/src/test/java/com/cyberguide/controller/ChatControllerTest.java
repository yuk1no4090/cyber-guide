package com.cyberguide.controller;

import com.cyberguide.infrastructure.cache.RedisRateLimiter;
import com.cyberguide.security.JwtTokenProvider;
import com.cyberguide.service.ChatPersistenceService;
import com.cyberguide.service.ChatService;
import com.cyberguide.support.TestSecurityConfig;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ChatController.class)
@Import(TestSecurityConfig.class)
class ChatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ChatService chatService;

    @MockBean
    private ChatPersistenceService chatPersistenceService;

    @MockBean
    private RedisRateLimiter rateLimiter;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @WithMockUser
    void chatReturns200WhenRequestIsValid() throws Exception {
        when(rateLimiter.allowChat("s-1", 15)).thenReturn(true);
        when(chatService.chat(ArgumentMatchers.any()))
            .thenReturn(new ChatService.ChatResponse("你好，我在。", List.of("继续聊聊"), false));

        mockMvc.perform(post("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "messages":[{"role":"user","content":"你好"}],
                      "mode":"chat",
                      "session_id":"s-1"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("你好，我在。"))
            .andExpect(jsonPath("$.isCrisis").value(false));

        verify(chatService).chat(ArgumentMatchers.any());
    }

    @Test
    @WithMockUser
    void chatReturns400WhenMessagesEmpty() throws Exception {
        mockMvc.perform(post("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "messages":[],
                      "session_id":"s-1"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));

        verifyNoInteractions(rateLimiter);
    }

    @Test
    void chatReturns403WhenNoJwtOrUserContext() throws Exception {
        mockMvc.perform(post("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "messages":[{"role":"user","content":"hello"}],
                      "session_id":"s-1"
                    }
                    """))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser
    void chatReturns429WhenRateLimited() throws Exception {
        when(rateLimiter.allowChat("s-1", 15)).thenReturn(false);

        mockMvc.perform(post("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "messages":[{"role":"user","content":"你好"}],
                      "session_id":"s-1"
                    }
                    """))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }
}
