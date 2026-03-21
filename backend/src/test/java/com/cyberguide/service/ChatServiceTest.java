package com.cyberguide.service;

import com.cyberguide.ai.AiClient;
import com.cyberguide.event.ChatCompletedEvent;
import com.cyberguide.event.CrisisDetectedEvent;
import com.cyberguide.rag.RagService;
import com.cyberguide.service.pipeline.MessageContext;
import com.cyberguide.service.pipeline.MessagePipeline;
import com.cyberguide.service.strategy.ChatStrategy;
import com.cyberguide.service.strategy.ChatStrategyFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private AiClient aiClient;

    @Mock
    private RagService ragService;

    @Mock
    private MessagePipeline pipeline;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ChatStrategy strategy;

    private ChatService chatService;

    @BeforeEach
    void setUp() {
        when(strategy.mode()).thenReturn("chat");
        ChatStrategyFactory strategyFactory = new ChatStrategyFactory(List.of(strategy));
        chatService = new ChatService(aiClient, ragService, pipeline, strategyFactory, eventPublisher);
    }

    @Test
    void chatUsesPipelineAndPublishesCompletionEvent() {
        doAnswer(invocation -> {
            MessageContext ctx = invocation.getArgument(0);
            ctx.setProcessedMessage("pipeline-processed");
            ctx.setSuggestions(List.of("继续聊聊"));
            ctx.setCrisis(false);
            return null;
        }).when(pipeline).execute(any(MessageContext.class));

        ChatService.ChatRequest req = new ChatService.ChatRequest(
            List.of(Map.of("role", "user", "content", "你好")),
            "chat",
            null,
            "s-1"
        );

        ChatService.ChatResponse resp = chatService.chat(req);

        assertEquals("pipeline-processed", resp.message());
        assertEquals(List.of("继续聊聊"), resp.suggestions());
        assertFalse(resp.isCrisis());
        verify(pipeline).execute(any(MessageContext.class));
        verify(eventPublisher).publishEvent(any(ChatCompletedEvent.class));
        verify(eventPublisher, never()).publishEvent(any(CrisisDetectedEvent.class));
    }

    @Test
    void chatPublishesCrisisEventWhenPipelineMarksCrisis() {
        doAnswer(invocation -> {
            MessageContext ctx = invocation.getArgument(0);
            ctx.setProcessedMessage("crisis response");
            ctx.setSuggestions(List.of("联系热线"));
            ctx.setCrisis(true);
            return null;
        }).when(pipeline).execute(any(MessageContext.class));

        ChatService.ChatResponse resp = chatService.chat(new ChatService.ChatRequest(
            List.of(Map.of("role", "user", "content", "我想自杀")),
            "chat",
            null,
            "s-2"
        ));

        assertTrue(resp.isCrisis());
        verify(eventPublisher).publishEvent(any(ChatCompletedEvent.class));
        verify(eventPublisher).publishEvent(any(CrisisDetectedEvent.class));
    }

    @Test
    void chatStreamWithMetaBuildsPromptAndReturnsStream() {
        List<Map<String, String>> messages = List.of(
            Map.of("role", "user", "content", "hello")
        );
        RagService.UserProfile profile = new RagService.UserProfile(
            RagService.UserIntent.UNKNOWN,
            RagService.TargetIntent.UNKNOWN,
            "",
            "",
            "未知",
            "",
            "",
            List.of()
        );
        List<RagService.RetrievalResult> retrieved = List.of(
            new RagService.RetrievalResult(
                "title",
                "content",
                "case:test",
                "https://example.com/case",
                "job",
                "high",
                8.0
            )
        );
        List<Map<String, Object>> similarCases = List.of(
            Map.of("title", "case-1", "url", "https://example.com/case")
        );

        doAnswer(invocation -> {
            MessageContext ctx = invocation.getArgument(0);
            ctx.setUserProfile(profile);
            ctx.setRetrievalResults(retrieved);
            ctx.setRetrievalMetadata(new RagService.RetrievalMetadata("q1", retrieved.size(), retrieved));
            ctx.setEvidence("evidence");
            return null;
        }).when(pipeline).executeUpTo(any(MessageContext.class), eq(30));
        when(ragService.buildSimilarCases(retrieved, 3)).thenReturn(similarCases);
        when(strategy.buildSystemPrompt("evidence", null)).thenReturn("system-prompt");
        when(aiClient.chatStream(any(), eq("system-prompt"), eq(800))).thenReturn(Flux.just("A", "B"));

        ChatService.StreamResponse streamResponse = chatService.chatStreamWithMeta(
            new ChatService.ChatRequest(messages, "chat", null, "s-3")
        );
        List<String> tokens = streamResponse.stream().collectList().block();

        assertEquals(List.of("A", "B"), tokens);
        assertEquals(similarCases, streamResponse.similarCases());
        assertFalse(streamResponse.presetCrisis());
        verify(aiClient).chatStream(any(), eq("system-prompt"), eq(800));
    }

    @Test
    void chatStreamWithMetaDoesNotCallRagDirectly() {
        List<Map<String, String>> messages = List.of(
            Map.of("role", "user", "content", "hello")
        );
        RagService.UserProfile profile = new RagService.UserProfile(
            RagService.UserIntent.UNKNOWN, RagService.TargetIntent.UNKNOWN,
            "", "", "未知", "", "", List.of()
        );
        List<RagService.RetrievalResult> retrieved = List.of(
            new RagService.RetrievalResult("t", "c", "case:x", "https://x.com", "job", "high", 5.0)
        );
        doAnswer(invocation -> {
            MessageContext ctx = invocation.getArgument(0);
            ctx.setUserProfile(profile);
            ctx.setRetrievalResults(retrieved);
            ctx.setRetrievalMetadata(new RagService.RetrievalMetadata("q", 1, retrieved));
            ctx.setEvidence("e");
            return null;
        }).when(pipeline).executeUpTo(any(MessageContext.class), eq(30));
        when(ragService.buildSimilarCases(retrieved, 3)).thenReturn(List.of());
        when(strategy.buildSystemPrompt("e", null)).thenReturn("sp");
        when(aiClient.chatStream(any(), eq("sp"), eq(800))).thenReturn(Flux.just("X"));

        chatService.chatStreamWithMeta(new ChatService.ChatRequest(messages, "chat", null, "s-rag"));

        verify(ragService, never()).inferUserProfile(any(), any());
        verify(ragService, never()).retrieveWithMetadata(any(), any(), any(Integer.class));
    }

    @Test
    void chatStreamWithMetaReturnsCrisisFallbackWithoutAiCall() {
        List<Map<String, String>> messages = List.of(
            Map.of("role", "user", "content", "我想自杀")
        );
        doAnswer(invocation -> {
            MessageContext ctx = invocation.getArgument(0);
            ctx.setCrisis(true);
            ctx.setProcessedMessage(ModerationService.CRISIS_RESPONSE);
            ctx.setSuggestions(List.of("我想聊聊", "谢谢关心"));
            ctx.setAborted(true);
            return null;
        }).when(pipeline).executeUpTo(any(MessageContext.class), eq(30));

        ChatService.StreamResponse response = chatService.chatStreamWithMeta(
            new ChatService.ChatRequest(messages, "chat", null, "s-4")
        );
        List<String> tokens = response.stream().collectList().block();

        assertEquals(1, tokens.size());
        assertEquals(0, response.similarCases().size());
        assertTrue(response.presetCrisis());
        assertEquals(List.of("我想聊聊", "谢谢关心"), response.presetSuggestions());
        verify(aiClient, never()).chatStream(any(), any(), any(Integer.class));
        verify(eventPublisher).publishEvent(any(CrisisDetectedEvent.class));
    }
}
