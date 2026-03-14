package com.cyberguide.security;

import com.cyberguide.repository.ChatSessionRepository;
import com.cyberguide.repository.FeedbackRepository;
import com.cyberguide.repository.PlanDayRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
public class AuthUpgradeService {

    private final PlanDayRepository planDayRepository;
    private final FeedbackRepository feedbackRepository;
    private final ChatSessionRepository chatSessionRepository;

    public AuthUpgradeService(PlanDayRepository planDayRepository,
                              FeedbackRepository feedbackRepository,
                              ChatSessionRepository chatSessionRepository) {
        this.planDayRepository = planDayRepository;
        this.feedbackRepository = feedbackRepository;
        this.chatSessionRepository = chatSessionRepository;
    }

    @Transactional
    public Map<String, Integer> upgradeSessionData(String sessionId, UUID userId) {
        int planUpdated = planDayRepository.bindSessionToUser(sessionId, userId);
        int feedbackUpdated = feedbackRepository.bindSessionToUser(sessionId, userId);
        int sessionUpdated = chatSessionRepository.bindAnonymousSessionsToUser(sessionId, userId);
        return Map.of(
                "plans", planUpdated,
                "feedback", feedbackUpdated,
                "sessions", sessionUpdated
        );
    }
}
