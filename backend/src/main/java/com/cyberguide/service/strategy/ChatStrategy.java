package com.cyberguide.service.strategy;

import java.util.List;
import java.util.Map;

/**
 * Strategy interface for different chat modes.
 * Each mode (chat, plan, crisis, scenario) has its own strategy implementation.
 */
public interface ChatStrategy {

    /**
     * The mode identifier this strategy handles (e.g. "chat", "plan", "scenario").
     */
    String mode();

    /**
     * Build the system prompt for this chat mode.
     */
    String buildSystemPrompt(String evidence, String scenario);

    /**
     * Post-process the AI response (e.g. parse suggestions, detect crisis).
     */
    ChatResult process(String aiResponse);

    /**
     * Result of a chat strategy processing.
     */
    record ChatResult(String message, List<String> suggestions, boolean isCrisis) {}
}
