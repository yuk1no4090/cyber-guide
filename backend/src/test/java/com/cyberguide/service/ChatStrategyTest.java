package com.cyberguide.service;

import com.cyberguide.service.strategy.*;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ChatStrategyTest {

    @Test
    void factoryReturnsDefaultForNull() {
        var factory = new ChatStrategyFactory(List.of(
            new DefaultChatStrategy(),
            new CrisisChatStrategy(),
            new ScenarioChatStrategy()
        ));
        ChatStrategy s = factory.getStrategy(null);
        assertEquals("chat", s.mode());
    }

    @Test
    void factoryReturnsDefaultForUnknown() {
        var factory = new ChatStrategyFactory(List.of(
            new DefaultChatStrategy(),
            new CrisisChatStrategy()
        ));
        ChatStrategy s = factory.getStrategy("nonexistent");
        assertEquals("chat", s.mode());
    }

    @Test
    void factoryReturnsCrisisForCrisisMode() {
        var factory = new ChatStrategyFactory(List.of(
            new DefaultChatStrategy(),
            new CrisisChatStrategy()
        ));
        ChatStrategy s = factory.getStrategy("crisis");
        assertEquals("crisis", s.mode());
    }

    @Test
    void defaultStrategyParsesResponse() {
        var strategy = new DefaultChatStrategy();
        var result = strategy.process("你好，有什么可以帮你的吗？\n💡 聊聊学习\n💡 聊聊工作");
        assertEquals("你好，有什么可以帮你的吗？", result.message());
        assertEquals(2, result.suggestions().size());
        assertFalse(result.isCrisis());
    }

    @Test
    void defaultStrategyFallbackSuggestions() {
        var strategy = new DefaultChatStrategy();
        var result = strategy.process("纯文本回复，没有建议标签");
        assertEquals("纯文本回复，没有建议标签", result.message());
        assertEquals(3, result.suggestions().size()); // default fallback
    }

    @Test
    void crisisStrategyAlwaysMarkedCrisis() {
        var strategy = new CrisisChatStrategy();
        var result = strategy.process("任何内容");
        assertTrue(result.isCrisis());
    }

    @Test
    void scenarioStrategyIncludesScenarioInPrompt() {
        var strategy = new ScenarioChatStrategy();
        String prompt = strategy.buildSystemPrompt("evidence", "面试模拟");
        assertTrue(prompt.contains("面试模拟"));
    }
}
