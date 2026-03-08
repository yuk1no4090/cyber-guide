package com.cyberguide.service;

import com.cyberguide.ai.AiClient;
import com.cyberguide.rag.RagService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.*;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final int MAX_HISTORY = 8;
    private static final int MAX_OUTPUT_TOKENS = 400;

    private final AiClient aiClient;
    private final RagService ragService;

    public ChatService(AiClient aiClient, RagService ragService) {
        this.aiClient = aiClient;
        this.ragService = ragService;
    }

    public record ChatRequest(
        List<Map<String, String>> messages,
        String mode,
        String scenario,
        String sessionId
    ) {}

    public record ChatResponse(
        String message,
        List<String> suggestions,
        boolean isCrisis
    ) {}

    /**
     * Non-streaming chat.
     */
    public ChatResponse chat(ChatRequest request) {
        // 1. Crisis check
        String lastUserMsg = getLastUserMessage(request.messages());
        var modResult = ModerationService.check(lastUserMsg);
        if (modResult.isCrisis()) {
            return new ChatResponse(ModerationService.CRISIS_RESPONSE, List.of(), true);
        }

        // 2. RAG retrieval
        var evidence = ragService.retrieve(lastUserMsg);
        String evidenceText = ragService.formatEvidence(evidence);

        // 3. Build messages
        List<Map<String, String>> contextMessages = buildContextMessages(request.messages(), evidenceText);

        // 4. AI call
        String response = aiClient.chatCompletion(contextMessages, 0.85, MAX_OUTPUT_TOKENS);

        // 5. Parse suggestions
        var parsed = parseSuggestions(response);
        return new ChatResponse(parsed.message, parsed.suggestions, false);
    }

    /**
     * Streaming chat — returns Flux of content deltas.
     */
    public Flux<String> chatStream(ChatRequest request) {
        String lastUserMsg = getLastUserMessage(request.messages());
        var modResult = ModerationService.check(lastUserMsg);
        if (modResult.isCrisis()) {
            return Flux.just(ModerationService.CRISIS_RESPONSE);
        }

        var evidence = ragService.retrieve(lastUserMsg);
        String evidenceText = ragService.formatEvidence(evidence);
        List<Map<String, String>> contextMessages = buildContextMessages(request.messages(), evidenceText);

        return aiClient.chatCompletionStream(contextMessages, 0.85, MAX_OUTPUT_TOKENS);
    }

    private String getLastUserMessage(List<Map<String, String>> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            if ("user".equals(messages.get(i).get("role"))) {
                return messages.get(i).get("content");
            }
        }
        return "";
    }

    private List<Map<String, String>> buildContextMessages(List<Map<String, String>> messages, String evidence) {
        List<Map<String, String>> result = new ArrayList<>();

        // System prompt with evidence
        String systemPrompt = "你是 Cyber Guide / 小舟，一个陪伴型的 AI 伙伴。" +
            "请保持真诚、平等的态度，像朋友一样聊天。不做心理诊断，不懂的不装懂。" +
            evidence;
        result.add(Map.of("role", "system", "content", systemPrompt));

        // Smart truncate: keep first 2 + last N
        List<Map<String, String>> userMsgs = messages.stream()
            .filter(m -> !"system".equals(m.get("role")))
            .toList();

        if (userMsgs.size() <= MAX_HISTORY) {
            result.addAll(userMsgs);
        } else {
            result.addAll(userMsgs.subList(0, 2));
            result.addAll(userMsgs.subList(userMsgs.size() - (MAX_HISTORY - 2), userMsgs.size()));
        }

        return result;
    }

    private record ParsedResponse(String message, List<String> suggestions) {}

    private ParsedResponse parseSuggestions(String text) {
        // Simple extraction: look for lines starting with suggestion markers
        List<String> suggestions = new ArrayList<>();
        StringBuilder message = new StringBuilder();

        for (String line : text.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("💡") || trimmed.startsWith("- 💡")) {
                suggestions.add(trimmed.replaceFirst("^[-\\s]*💡\\s*", ""));
            } else {
                if (!message.isEmpty()) message.append("\n");
                message.append(line);
            }
        }

        if (suggestions.isEmpty()) {
            suggestions = List.of("继续聊聊", "换个话题", "帮我分析一下");
        }

        return new ParsedResponse(message.toString().trim(), suggestions);
    }
}
