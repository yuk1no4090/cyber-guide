package com.cyberguide.interfaces.dto;

/**
 * Request/Response DTOs for plan endpoints.
 */
public final class PlanDto {

    private PlanDto() {}

    public record StatusRequest(String session_id, int day_index, String status) {}
    public record RegenerateRequest(String session_id, int day_index, String context) {}
}
