package com.cyberguide.controller;

import com.cyberguide.security.JwtTokenProvider;
import com.cyberguide.service.FeedbackService;
import com.cyberguide.support.TestSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(FeedbackController.class)
@Import(TestSecurityConfig.class)
class FeedbackControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FeedbackService feedbackService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @WithMockUser
    void submitReturnsQualityResult() throws Exception {
        when(feedbackService.submit(any())).thenReturn(new FeedbackService.QualityResult(82.0, "gold"));

        mockMvc.perform(post("/api/feedback")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "messages":[{"role":"user","content":"谢谢你"}],
                      "rating":5,
                      "feedback":"很有帮助",
                      "hadCrisis":false,
                      "mode":"chat",
                      "session_id":"s-1"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.quality.score").value(82.0))
            .andExpect(jsonPath("$.data.quality.tier").value("gold"));
    }

    @Test
    @WithMockUser
    void submitReturns400WhenRatingInvalid() throws Exception {
        mockMvc.perform(post("/api/feedback")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "messages":[{"role":"user","content":"test"}],
                      "rating":0,
                      "feedback":"bad",
                      "hadCrisis":false,
                      "mode":"chat",
                      "session_id":"s-1"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("INVALID_RATING"));
    }
}
