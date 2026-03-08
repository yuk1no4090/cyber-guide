package com.cyberguide.service.strategy;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Strategy factory — resolves the correct ChatStrategy by mode name.
 * Uses Spring's dependency injection to collect all strategy beans.
 */
@Component
public class ChatStrategyFactory {

    private final Map<String, ChatStrategy> strategyMap;
    private final ChatStrategy defaultStrategy;

    public ChatStrategyFactory(List<ChatStrategy> strategies) {
        this.strategyMap = new java.util.HashMap<>();
        ChatStrategy fallback = null;
        for (ChatStrategy s : strategies) {
            strategyMap.put(s.mode(), s);
            if ("chat".equals(s.mode())) {
                fallback = s;
            }
        }
        this.defaultStrategy = fallback != null ? fallback : strategies.get(0);
    }

    /**
     * Get strategy for the given mode. Falls back to default (chat) if unknown.
     */
    public ChatStrategy getStrategy(String mode) {
        if (mode == null || mode.isBlank()) {
            return defaultStrategy;
        }
        return strategyMap.getOrDefault(mode, defaultStrategy);
    }
}
