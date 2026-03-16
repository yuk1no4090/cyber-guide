package com.cyberguide.controller;

import com.cyberguide.model.PlanDay;
import com.cyberguide.security.JwtTokenProvider;
import com.cyberguide.service.PlanService;
import com.cyberguide.support.TestSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PlanController.class)
@Import(TestSecurityConfig.class)
class PlanControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PlanService planService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @WithMockUser
    void fetchReturnsPlans() throws Exception {
        PlanDay day1 = planDay("s-1", 1, "写下本周目标", "todo");
        PlanService.FetchResult result = new PlanService.FetchResult(List.of(day1), 1, day1);
        when(planService.fetch("s-1")).thenReturn(result);

        mockMvc.perform(get("/api/plan/fetch").param("session_id", "s-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.today_index").value(1))
            .andExpect(jsonPath("$.data.plans[0].taskText").value("写下本周目标"));
    }

    @Test
    @WithMockUser
    void generateReturnsNewPlanList() throws Exception {
        PlanDay day1 = planDay("s-1", 1, "完成简历第一版", "todo");
        PlanService.FetchResult generated = new PlanService.FetchResult(List.of(day1), 1, day1);
        when(planService.generate("s-1", "求职方向")).thenReturn(generated);

        mockMvc.perform(post("/api/plan/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "session_id":"s-1",
                      "context":"求职方向"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.plans[0].taskText").value("完成简历第一版"));
    }

    @Test
    @WithMockUser
    void updateStatusReturnsUpdatedPlan() throws Exception {
        PlanDay updated = planDay("s-1", 2, "投递 3 个岗位", "done");
        when(planService.update("s-1", 2, "done")).thenReturn(updated);

        mockMvc.perform(put("/api/plan/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "session_id":"s-1",
                      "day_index":2,
                      "status":"done"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.plan.status").value("done"))
            .andExpect(jsonPath("$.data.plan.dayIndex").value(2));
    }

    @Test
    @WithMockUser
    void updateStatusReturns400ForInvalidStatus() throws Exception {
        mockMvc.perform(put("/api/plan/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "session_id":"s-1",
                      "day_index":2,
                      "status":"invalid_status"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("INVALID_STATUS"));
    }

    private static PlanDay planDay(String sessionId, int dayIndex, String taskText, String status) {
        PlanDay day = new PlanDay();
        day.setSessionId(sessionId);
        day.setDayIndex(dayIndex);
        day.setTaskText(taskText);
        day.setStatus(status);
        return day;
    }
}
