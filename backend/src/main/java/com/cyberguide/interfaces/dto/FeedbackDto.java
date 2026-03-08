package com.cyberguide.interfaces.dto;

import java.util.List;
import java.util.Map;

/**
 * Request/Response DTOs for feedback endpoints.
 */
public final class FeedbackDto {

    private FeedbackDto() {}

    public record FeedbackRequest(
        List<Map<String, String>> messages,
        int rating,
        String feedback,
        boolean hadCrisis,
        String mode
    ) {}

    public record QualityResponse(double score, String tier) {}
}
