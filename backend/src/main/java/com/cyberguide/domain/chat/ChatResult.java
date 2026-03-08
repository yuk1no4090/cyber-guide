package com.cyberguide.domain.chat;

/**
 * Value object representing the result of a chat interaction.
 * Immutable — created once after AI processing completes.
 */
public record ChatResult(
    String message,
    java.util.List<String> suggestions,
    boolean isCrisis
) {
    public static ChatResult crisis(String message) {
        return new ChatResult(message, java.util.List.of("我想聊聊", "谢谢关心"), true);
    }

    public static ChatResult of(String message, java.util.List<String> suggestions) {
        return new ChatResult(message, suggestions, false);
    }
}
