package com.cyberguide.interfaces.dto;

import java.util.List;
import java.util.Map;

/**
 * Request/Response DTOs for the REST API layer.
 * These decouple the API contract from domain objects.
 */
public final class ChatDto {

    private ChatDto() {}

    public record ChatRequest(
        List<Map<String, String>> messages,
        String mode,
        String scenario,
        String session_id
    ) {}

    public record ChatResponse(
        String message,
        List<String> suggestions,
        boolean isCrisis
    ) {}
}
