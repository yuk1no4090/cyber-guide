package com.cyberguide.domain.chat;

import java.util.List;
import java.util.Map;

/**
 * Chat session aggregate — encapsulates the state and behavior of a single chat session.
 * In DDD terms, this is the aggregate root for the Chat bounded context.
 */
public class ChatSession {

    private final String sessionId;
    private final List<Map<String, String>> messages;
    private final String mode;
    private final String scenario;
    private boolean crisis;

    public ChatSession(String sessionId, List<Map<String, String>> messages, String mode, String scenario) {
        this.sessionId = sessionId;
        this.messages = messages;
        this.mode = mode;
        this.scenario = scenario;
    }

    public String getSessionId() { return sessionId; }
    public List<Map<String, String>> getMessages() { return messages; }
    public String getMode() { return mode; }
    public String getScenario() { return scenario; }
    public boolean isCrisis() { return crisis; }
    public void markCrisis() { this.crisis = true; }

    /**
     * Extract the last user message from the conversation history.
     */
    public String lastUserMessage() {
        for (int i = messages.size() - 1; i >= 0; i--) {
            if ("user".equals(messages.get(i).get("role"))) {
                return messages.get(i).get("content");
            }
        }
        return "";
    }

    /**
     * Truncate history to keep only the most recent messages (sliding window).
     */
    public List<Map<String, String>> truncatedHistory(int maxHistory) {
        var userMsgs = messages.stream()
                .filter(m -> !"system".equals(m.get("role")))
                .toList();

        if (userMsgs.size() <= maxHistory) {
            return new java.util.ArrayList<>(userMsgs);
        }

        var result = new java.util.ArrayList<Map<String, String>>();
        result.addAll(userMsgs.subList(0, 2));
        result.addAll(userMsgs.subList(userMsgs.size() - (maxHistory - 2), userMsgs.size()));
        return result;
    }
}
