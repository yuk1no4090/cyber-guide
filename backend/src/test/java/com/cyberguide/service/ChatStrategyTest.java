package com.cyberguide.service;

import com.cyberguide.service.strategy.*;
import com.cyberguide.rag.RagService;
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

    @Test
    void allowedLinkSanitizerRemovesHallucinatedUrls() {
        var results = List.of(new RagService.RetrievalResult(
            "case",
            "content",
            "article:zhihu",
            "https://zhuanlan.zhihu.com/p/123",
            "baoyan",
            "high",
            10.0,
            null,
            null,
            null,
            null,
            null,
            null
        ));
        String raw = "真实：[查看原帖](https://zhuanlan.zhihu.com/p/123)\n假的：[查看原帖](https://www.zhihu.com/question/296733467/answer/123456789)";
        String cleaned = AllowedLinkSanitizer.sanitizeWithRetrievalResults(raw, results);
        assertTrue(cleaned.contains("https://zhuanlan.zhihu.com/p/123"));
        assertFalse(cleaned.contains("296733467"));
        assertTrue(cleaned.contains("假的：查看原帖"));
    }

    @Test
    void defaultStrategyFallsBackWhenAllLinesLookLikeSuggestions() {
        var strategy = new DefaultChatStrategy();
        var result = strategy.process("💡 这其实是一整段回复，只是模型误用了建议符号");
        assertFalse(result.message().isBlank());
        assertTrue(result.message().contains("误用了建议符号"));
    }
}
