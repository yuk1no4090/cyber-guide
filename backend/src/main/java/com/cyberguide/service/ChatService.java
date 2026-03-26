package com.cyberguide.service;

import com.cyberguide.ai.AiClient;
import com.cyberguide.event.ChatCompletedEvent;
import com.cyberguide.event.CrisisDetectedEvent;
import com.cyberguide.rag.RagService;
import com.cyberguide.service.pipeline.MessageContext;
import com.cyberguide.service.pipeline.MessagePipeline;
import com.cyberguide.service.strategy.ChatStrategy;
import com.cyberguide.service.strategy.ChatStrategyFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.*;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final int MAX_HISTORY = 8;
    private static final int MAX_OUTPUT_TOKENS = 800;

    private final AiClient aiClient;
    private final RagService ragService;
    private final MessagePipeline pipeline;
    private final ChatStrategyFactory strategyFactory;
    private final ApplicationEventPublisher eventPublisher;

    public ChatService(AiClient aiClient, RagService ragService,
                       MessagePipeline pipeline, ChatStrategyFactory strategyFactory,
                       ApplicationEventPublisher eventPublisher) {
        this.aiClient = aiClient;
        this.ragService = ragService;
        this.pipeline = pipeline;
        this.strategyFactory = strategyFactory;
        this.eventPublisher = eventPublisher;
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

    public record StreamResponse(
        Flux<String> stream,
        List<Map<String, Object>> similarCases,
        List<Map<String, Object>> evidence,
        boolean presetCrisis,
        List<String> presetSuggestions
    ) {}

    /**
     * Non-streaming chat — uses the message pipeline (responsibility chain).
     */
    public ChatResponse chat(ChatRequest request) {
        long start = System.currentTimeMillis();

        // Build pipeline context
        MessageContext ctx = new MessageContext();
        ctx.setSessionId(request.sessionId());
        ctx.setMode(request.mode());
        ctx.setScenario(request.scenario());
        ctx.setUserMessage(getLastUserMessage(request.messages()));
        ctx.setMessages(truncateHistory(request.messages()));

        // Execute pipeline: Redact -> Moderation -> RAG -> AI -> Parse
        pipeline.execute(ctx);

        long elapsed = System.currentTimeMillis() - start;

        // Publish events
        eventPublisher.publishEvent(new ChatCompletedEvent(this, request.sessionId(), request.mode(), elapsed, ctx.isCrisis()));
        if (ctx.isCrisis()) {
            eventPublisher.publishEvent(new CrisisDetectedEvent(this, request.sessionId(), List.of()));
        }

        return new ChatResponse(ctx.getProcessedMessage(), ctx.getSuggestions(), ctx.isCrisis());
    }

    /**
     * Streaming chat — still uses direct AI call (pipeline is for sync path).
     */
    public Flux<String> chatStream(ChatRequest request) {
        return chatStreamWithMeta(request).stream();
    }

    /**
     * Streaming chat with precomputed metadata (similarCases).
     * RAG retrieval runs once and is reused by both system prompt and metadata output.
     */
    public StreamResponse chatStreamWithMeta(ChatRequest request) {
        MessageContext ctx = new MessageContext();
        ctx.setSessionId(request.sessionId());
        ctx.setMode(request.mode());
        ctx.setScenario(request.scenario());
        ctx.setUserMessage(getLastUserMessage(request.messages()));
        ctx.setMessages(truncateHistory(request.messages()));

        // Pipeline front steps: Redact -> Moderation -> RAG (orders <= 30)
        // RagEnrichHandler now stores profile + retrievalResults + metadata in ctx
        pipeline.executeUpTo(ctx, 30);

        if (ctx.isCrisis()) {
            eventPublisher.publishEvent(new CrisisDetectedEvent(this, request.sessionId(), List.of()));
            return new StreamResponse(
                Flux.just(ctx.getProcessedMessage()),
                List.of(),
                List.of(),
                true,
                ctx.getSuggestions() == null ? List.of("我想聊聊", "谢谢关心") : ctx.getSuggestions()
            );
        }

        // Reuse the single-pass RAG results from RagEnrichHandler
        var retrieved = ctx.getRetrievalResults() != null ? ctx.getRetrievalResults() : List.<RagService.RetrievalResult>of();
        var metadata = ctx.getRetrievalMetadata();
        List<Map<String, Object>> similarCases = ragService.buildSimilarCases(retrieved, 3);
        List<Map<String, Object>> evidence = buildEvidenceMeta(
            metadata != null ? metadata.topKResults() : retrieved, 5);

        var strategy = strategyFactory.getStrategy(request.mode());
        String systemPrompt = strategy.buildSystemPrompt(ctx.getEvidence(), request.scenario());

        Flux<String> stream = aiClient.chatStream(ctx.getMessages(), systemPrompt, MAX_OUTPUT_TOKENS);
        return new StreamResponse(stream, similarCases, evidence, false, List.of());
    }

    public ChatStrategy.ChatResult parseChatResult(String mode, String aiResponse) {
        var strategy = strategyFactory.getStrategy(mode);
        return strategy.process(aiResponse);
    }

    public void publishChatCompleted(String sessionId, String mode, long elapsedMs, boolean crisis) {
        eventPublisher.publishEvent(new ChatCompletedEvent(this, sessionId, mode, elapsedMs, crisis));
    }

    private List<Map<String, String>> truncateHistory(List<Map<String, String>> messages) {
        List<Map<String, String>> userMsgs = messages.stream()
            .filter(m -> !"system".equals(m.get("role")))
            .toList();

        if (userMsgs.size() <= MAX_HISTORY) {
            return new ArrayList<>(userMsgs);
        }

        List<Map<String, String>> result = new ArrayList<>();
        result.addAll(userMsgs.subList(0, 2));
        result.addAll(userMsgs.subList(userMsgs.size() - (MAX_HISTORY - 2), userMsgs.size()));
        return result;
    }

    private String getLastUserMessage(List<Map<String, String>> messages) {
        for (int i = messages.size() - 1; i >= 0; i--) {
            if ("user".equals(messages.get(i).get("role"))) {
                return messages.get(i).get("content");
            }
        }
        return "";
    }

    private List<Map<String, Object>> buildEvidenceMeta(List<RagService.RetrievalResult> retrieved, int limit) {
        if (retrieved == null || retrieved.isEmpty()) {
            return List.of();
        }
        return retrieved.stream()
            .limit(Math.max(1, limit))
            .map(r -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("title", r.title());
                item.put("source", r.source());
                item.put("url", r.url());
                item.put("score", r.score());
                item.put("tier", r.relevanceTier());
                item.put("school", r.school());
                item.put("schoolTier", r.schoolTier());
                item.put("gpa", r.gpa());
                item.put("rankPct", r.rankPct());
                item.put("outcome", r.outcome());
                item.put("destSchool", r.destSchool());
                return item;
            })
            .toList();
    }
}
