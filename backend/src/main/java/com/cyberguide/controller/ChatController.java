package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.exception.RateLimitException;
import com.cyberguide.infrastructure.cache.RedisRateLimiter;
import com.cyberguide.security.SecurityUtils;
import com.cyberguide.service.ChatPersistenceService;
import com.cyberguide.service.ChatService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.annotation.PostConstruct;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Semaphore;

@RestController
@RequestMapping("/api")
@Tag(name = "Chat", description = "AI chat endpoints")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private final ChatService chatService;
    private final ChatPersistenceService chatPersistenceService;
    private final ObjectMapper objectMapper;
    private final RedisRateLimiter rateLimiter;

    @Value("${rate-limit.chat-per-minute:15}")
    private int chatLimitPerMinute;

    @Value("${concurrency.chat.max-inflight:120}")
    private int chatMaxInflight;

    @Value("${concurrency.stream.max-inflight:48}")
    private int streamMaxInflight;

    private volatile Semaphore chatInflightGuard = new Semaphore(120, true);
    private volatile Semaphore streamInflightGuard = new Semaphore(48, true);

    public ChatController(ChatService chatService,
                          ChatPersistenceService chatPersistenceService,
                          ObjectMapper objectMapper,
                          RedisRateLimiter rateLimiter) {
        this.chatService = chatService;
        this.chatPersistenceService = chatPersistenceService;
        this.objectMapper = objectMapper;
        this.rateLimiter = rateLimiter;
    }

    @PostConstruct
    void initConcurrencyGuards() {
        this.chatInflightGuard = new Semaphore(Math.max(1, chatMaxInflight), true);
        this.streamInflightGuard = new Semaphore(Math.max(1, streamMaxInflight), true);
        log.info("chat concurrency guards initialized: chat={}, stream={}", chatMaxInflight, streamMaxInflight);
    }

    public record ChatRequestBody(
        List<Map<String, String>> messages,
        String mode,
        String scenario,
        String session_id,
        String chat_session_id
    ) {}

    @PostMapping("/chat")
    @Operation(summary = "Send a chat message and get AI response")
    public ResponseEntity<?> chat(@RequestBody ChatRequestBody body) {
        long start = System.currentTimeMillis();

        if (body.messages() == null || body.messages().isEmpty()) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "messages 不能为空");
        }
        if (body.session_id() == null || body.session_id().isBlank()) {
            throw new BizException(ErrorCode.INVALID_SESSION_ID);
        }
        if (!chatInflightGuard.tryAcquire()) {
            throw new RateLimitException("服务繁忙：chat 并发已满，请稍后重试");
        }

        try {
            // Distributed rate limiting via Redis
            if (!rateLimiter.allowChat(body.session_id(), chatLimitPerMinute)) {
                throw new RateLimitException();
            }

            log.info("chat request: sessionId={}, mode={}, msgCount={}", body.session_id(), body.mode(), body.messages().size());

            var request = new ChatService.ChatRequest(body.messages(), body.mode(), body.scenario(), body.session_id());
            var result = chatService.chat(request);

            log.info("chat response: sessionId={}, elapsed={}ms", body.session_id(), System.currentTimeMillis() - start);
            return ResponseEntity.ok(result);
        } finally {
            chatInflightGuard.release();
        }
    }

    @PostMapping("/chat/stream")
    @Operation(summary = "Stream a chat response (NDJSON)")
    public ResponseEntity<StreamingResponseBody> chatStream(@RequestBody ChatRequestBody body) {
        if (body.messages() == null || body.messages().isEmpty()) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "messages 不能为空");
        }
        if (body.session_id() == null || body.session_id().isBlank()) {
            throw new BizException(ErrorCode.INVALID_SESSION_ID);
        }
        if (!streamInflightGuard.tryAcquire()) {
            throw new RateLimitException("服务繁忙：stream 并发已满，请稍后重试");
        }

        // Distributed rate limiting via Redis
        if (!rateLimiter.allowChat(body.session_id(), chatLimitPerMinute)) {
            streamInflightGuard.release();
            throw new RateLimitException();
        }

        log.info("stream request: sessionId={}, mode={}", body.session_id(), body.mode());

        var request = new ChatService.ChatRequest(body.messages(), body.mode(), body.scenario(), body.session_id());
        ChatService.StreamResponse streamResponse = chatService.chatStreamWithMeta(request);
        List<Map<String, Object>> similarCases = streamResponse.similarCases();

        StreamingResponseBody stream = outputStream -> {
            Writer writer = new OutputStreamWriter(outputStream, StandardCharsets.UTF_8);
            StringBuilder fullText = new StringBuilder();
            try {
                streamResponse.stream()
                    .doOnNext(token -> {
                        try {
                            fullText.append(token);
                            // Format: {"t":"delta","c":"文本片段"} — matches frontend readNDJSONStream
                            String json = objectMapper.writeValueAsString(Map.of("t", "delta", "c", token));
                            writer.write(json + "\n");
                            writer.flush();
                        } catch (Exception e) {
                            log.error("stream write error: sessionId={}", body.session_id(), e);
                        }
                    })
                    .doOnError(err -> {
                        try {
                            String errJson = objectMapper.writeValueAsString(
                                Map.of("t", "error", "message", "AI 服务异常: " + err.getMessage()));
                            writer.write(errJson + "\n");
                            writer.flush();
                        } catch (Exception e) {
                            log.error("stream error-write failed: sessionId={}", body.session_id(), e);
                        }
                    })
                    .blockLast();

                // Final meta line with full message — frontend uses this for suggestions/crisis
                String metaJson = objectMapper.writeValueAsString(Map.of(
                    "t", "meta",
                    "message", fullText.toString(),
                    "suggestions", List.of("继续聊聊", "换个话题", "帮我分析一下"),
                    "isCrisis", false,
                    "similarCases", similarCases
                ));
                writer.write(metaJson + "\n");
                writer.flush();
            } catch (Exception e) {
                log.error("stream fatal error: sessionId={}", body.session_id(), e);
            } finally {
                if (fullText.length() > 0) {
                    chatPersistenceService.persistConversation(
                            body.session_id(),
                            SecurityUtils.currentUserId().orElse(null),
                            body.mode(),
                            parseUuid(body.chat_session_id()),
                            body.messages(),
                            fullText.toString(),
                            false
                    );
                }
                writer.flush();
                streamInflightGuard.release();
            }
        };

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_NDJSON)
            .header("Cache-Control", "no-cache, no-transform")
            .header("X-Content-Type-Options", "nosniff")
            .body(stream);
    }

    private UUID parseUuid(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
