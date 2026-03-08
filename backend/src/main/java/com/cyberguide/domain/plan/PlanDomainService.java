package com.cyberguide.domain.plan;

import java.util.List;

/**
 * Domain service interface for study plan operations.
 * Defined in the domain layer; implemented in the application layer.
 */
public interface PlanDomainService {

    /**
     * Fetch existing plans for a session.
     */
    PlanFetchResult fetch(String sessionId);

    /**
     * Generate a new 7-day plan.
     */
    PlanFetchResult generate(String sessionId, String context);

    /**
     * Update the status of a specific plan day.
     */
    Object updateStatus(String sessionId, int dayIndex, String status);

    /**
     * Regenerate a single plan day.
     */
    Object regenerateDay(String sessionId, int dayIndex, String context);

    record PlanFetchResult(List<?> plans, int todayIndex, Object todayPlan) {}
}
