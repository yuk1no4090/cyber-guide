package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.exception.RateLimitException;
import com.cyberguide.infrastructure.cache.RedisRateLimiter;
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

import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@Tag(name = "Chat", description = "AI chat endpoints")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private final ChatService chatService;
    private final ObjectMapper objectMapper;
    private final RedisRateLimiter rateLimiter;

    @Value("${rate-limit.chat-per-minute:15}")
    private int chatLimitPerMinute;

    public ChatController(ChatService chatService, ObjectMapper objectMapper, RedisRateLimiter rateLimiter) {
        this.chatService = chatService;
        this.objectMapper = objectMapper;
        this.rateLimiter = rateLimiter;
    }

    public record ChatRequestBody(
        List<Map<String, String>> messages,
        String mode,
        String scenario,
        String session_id
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

        // Distributed rate limiting via Redis
        if (!rateLimiter.allowChat(body.session_id(), chatLimitPerMinute)) {
            throw new RateLimitException();
        }

        log.info("chat request: sessionId={}, mode={}, msgCount={}", body.session_id(), body.mode(), body.messages().size());

        var request = new ChatService.ChatRequest(body.messages(), body.mode(), body.scenario(), body.session_id());
        var result = chatService.chat(request);

        log.info("chat response: sessionId={}, elapsed={}ms", body.session_id(), System.currentTimeMillis() - start);
        return ResponseEntity.ok(result);
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

        // Distributed rate limiting via Redis
        if (!rateLimiter.allowChat(body.session_id(), chatLimitPerMinute)) {
            throw new RateLimitException();
        }

        log.info("stream request: sessionId={}, mode={}", body.session_id(), body.mode());

        var request = new ChatService.ChatRequest(body.messages(), body.mode(), body.scenario(), body.session_id());

        StreamingResponseBody stream = outputStream -> {
            Writer writer = new OutputStreamWriter(outputStream, StandardCharsets.UTF_8);
            StringBuilder fullText = new StringBuilder();
            try {
                chatService.chatStream(request)
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
                    "isCrisis", false
                ));
                writer.write(metaJson + "\n");
                writer.flush();
            } catch (Exception e) {
                log.error("stream fatal error: sessionId={}", body.session_id(), e);
            } finally {
                writer.flush();
            }
        };

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_NDJSON)
            .header("Cache-Control", "no-cache, no-transform")
            .header("X-Content-Type-Options", "nosniff")
            .body(stream);
    }
}
