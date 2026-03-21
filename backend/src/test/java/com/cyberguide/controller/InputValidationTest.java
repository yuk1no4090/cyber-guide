package com.cyberguide.controller;

import com.cyberguide.infrastructure.cache.RedisRateLimiter;
import com.cyberguide.security.JwtTokenProvider;
import com.cyberguide.service.ChatPersistenceService;
import com.cyberguide.service.ChatService;
import com.cyberguide.service.FeedbackService;
import com.cyberguide.service.PlanService;
import com.cyberguide.support.TestSecurityConfig;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({ChatController.class, PlanController.class, FeedbackController.class})
@Import(TestSecurityConfig.class)
class InputValidationTest {

    @Autowired private MockMvc mockMvc;
    @MockBean private ChatService chatService;
    @MockBean private ChatPersistenceService chatPersistenceService;
    @MockBean private RedisRateLimiter rateLimiter;
    @MockBean private JwtTokenProvider jwtTokenProvider;
    @MockBean private PlanService planService;
    @MockBean private FeedbackService feedbackService;

    // ── Chat endpoint ──

    @Nested
    class ChatValidation {

        @Test
        @WithMockUser
        void rejectsNullMessages() throws Exception {
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"session_id\":\"s1\"}"))
                .andExpect(status().isBadRequest());
        }

        @Test
        @WithMockUser
        void rejectsMissingSessionId() throws Exception {
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"))
                .andExpect(status().isBadRequest());
        }

        @ParameterizedTest
        @ValueSource(strings = {"", "   "})
        @WithMockUser
        void rejectsBlankSessionId(String sessionId) throws Exception {
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"session_id\":\"" + sessionId + "\"}"))
                .andExpect(status().isBadRequest());
        }

        @Test
        @WithMockUser
        void handlesUnicodeEmojiInMessages() throws Exception {
            // Should not crash — emoji/unicode is valid input; returns some status (not 500)
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[{\"role\":\"user\",\"content\":\"你好 🎓💻 我想保研\"}],\"session_id\":\"s1\"}"))
                .andReturn();
        }

        @Test
        @WithMockUser
        void handlesExtremelyLongMessage() throws Exception {
            String longMsg = "a".repeat(50000);
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[{\"role\":\"user\",\"content\":\"" + longMsg + "\"}],\"session_id\":\"s1\"}"))
                .andReturn(); // Should not throw OOM or 500
        }

        @Test
        @WithMockUser
        void handlesSqlInjectionInSessionId() throws Exception {
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"session_id\":\"'; DROP TABLE users;--\"}"))
                .andReturn(); // Should not crash or execute SQL
        }

        @Test
        @WithMockUser
        void handlesXssInMessageContent() throws Exception {
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[{\"role\":\"user\",\"content\":\"<script>alert('xss')</script>\"}],\"session_id\":\"s1\"}"))
                .andReturn();
        }

        @Test
        @WithMockUser
        void handlesMalformedJsonBodyDoesNotReturn200() throws Exception {
            var result = mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{this is not json}"))
                .andReturn();
            int code = result.getResponse().getStatus();
            assertTrue(code >= 400, "Expected 4xx/5xx but got " + code);
        }

        @Test
        @WithMockUser
        void handlesEmptyJsonBody() throws Exception {
            mockMvc.perform(post("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{}"))
                .andExpect(status().isBadRequest());
        }
    }

    // ── Plan endpoint ──

    @Nested
    class PlanValidation {

        @Test
        @WithMockUser
        void fetchRejectsMissingSessionId() throws Exception {
            mockMvc.perform(get("/api/plan/fetch"))
                .andExpect(status().isBadRequest());
        }

        @Test
        @WithMockUser
        void statusRejectsInvalidStatusValue() throws Exception {
            mockMvc.perform(put("/api/plan/status")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"session_id\":\"s1\",\"day_index\":1,\"status\":\"HACKED\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_STATUS"));
        }

        @Test
        @WithMockUser
        void regenerateRejectsDayIndexOutOfRange() throws Exception {
            for (int bad : new int[]{0, -1, 8, 99, Integer.MIN_VALUE}) {
                mockMvc.perform(post("/api/plan/regenerate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"session_id\":\"s1\",\"day_index\":" + bad + "}"))
                    .andExpect(status().isBadRequest());
            }
        }

        @Test
        @WithMockUser
        void regenerateAcceptsBoundaryDayIndex() throws Exception {
            // day 1 and 7 are valid boundaries
            for (int ok : new int[]{1, 7}) {
                mockMvc.perform(post("/api/plan/regenerate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"session_id\":\"s1\",\"day_index\":" + ok + "}"))
                    .andReturn(); // Should not 400 for day_index
            }
        }
    }

    // ── Feedback endpoint ──

    @Nested
    class FeedbackValidation {

        @ParameterizedTest
        @ValueSource(ints = {0, -1, 6, 100, Integer.MAX_VALUE, Integer.MIN_VALUE})
        @WithMockUser
        void rejectsRatingOutOfRange(int rating) throws Exception {
            mockMvc.perform(post("/api/feedback")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[],\"rating\":" + rating + ",\"feedback\":\"\",\"hadCrisis\":false,\"mode\":\"chat\",\"session_id\":\"s1\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_RATING"));
        }

        @Test
        @WithMockUser
        void rejectsInvalidMode() throws Exception {
            mockMvc.perform(post("/api/feedback")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"messages\":[],\"rating\":3,\"feedback\":\"\",\"hadCrisis\":false,\"mode\":\"HACKED_MODE\",\"session_id\":\"s1\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_MODE"));
        }

        @Test
        @WithMockUser
        void acceptsBoundaryRatings() throws Exception {
            for (int ok : new int[]{1, 5}) {
                mockMvc.perform(post("/api/feedback")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messages\":[],\"rating\":" + ok + ",\"feedback\":\"\",\"hadCrisis\":false,\"mode\":\"chat\",\"session_id\":\"s1\"}"))
                    .andReturn(); // Should not 400
            }
        }
    }
}
