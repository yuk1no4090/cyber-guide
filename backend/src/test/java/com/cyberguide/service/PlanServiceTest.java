package com.cyberguide.service;

import com.cyberguide.ai.AiClient;
import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.model.PlanDay;
import com.cyberguide.repository.PlanDayRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlanServiceTest {

    @Mock
    private PlanDayRepository repo;

    @Mock
    private AiClient aiClient;

    @Mock
    private CacheGuard cacheGuard;

    private PlanService planService;

    @BeforeEach
    void setUp() {
        planService = new PlanService(repo, aiClient, cacheGuard);
    }

    @Test
    void generateFallsBackWhenAiFailsAndEvictsCache() {
        when(aiClient.chat(anyList(), anyString(), anyInt()))
            .thenThrow(new RuntimeException("ai down"));
        when(repo.findBySessionIdAndDayIndex(anyString(), anyInt())).thenReturn(Optional.empty());
        doAnswer(invocation -> invocation.getArgument(0)).when(repo).save(any(PlanDay.class));

        PlanService.FetchResult result = planService.generate("session-x", "context");

        assertEquals(7, result.plans().size());
        assertEquals(1, result.todayIndex());
        assertTrue(result.plans().stream().allMatch(p -> p.getTaskText() != null && !p.getTaskText().isBlank()));

        verify(repo, times(7)).save(any(PlanDay.class));
        verify(cacheGuard).evict("plan:session:session-x");
    }

    @Test
    void updateChangesStatusAndEvictsCache() {
        PlanDay existing = new PlanDay();
        existing.setSessionId("session-y");
        existing.setDayIndex(2);
        existing.setTaskText("投递 3 个岗位");
        existing.setStatus("todo");

        when(repo.findBySessionIdAndDayIndex("session-y", 2)).thenReturn(Optional.of(existing));
        when(repo.save(existing)).thenReturn(existing);

        PlanDay updated = planService.update("session-y", 2, "done");

        assertEquals("done", updated.getStatus());
        verify(cacheGuard).evict("plan:session:session-y");
    }

    @Test
    void regenerateDayFallsBackWhenAiOutputEmptyAndEvictsCache() {
        when(aiClient.chat(anyList(), anyString(), anyInt())).thenReturn("{\"tasks\":[]}");
        when(repo.findBySessionIdAndDayIndex("session-z", 3)).thenReturn(Optional.empty());
        doAnswer(invocation -> invocation.getArgument(0)).when(repo).save(any(PlanDay.class));

        PlanDay day = planService.regenerateDay("session-z", 3, "context");

        assertEquals(3, day.getDayIndex());
        assertEquals("todo", day.getStatus());
        assertTrue(day.getTaskText() != null && !day.getTaskText().isBlank());
        verify(cacheGuard).evict("plan:session:session-z");
    }
}
