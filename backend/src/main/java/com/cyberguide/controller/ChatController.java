package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.exception.RateLimitException;
import com.cyberguide.infrastructure.cache.RedisRateLimiter;
import com.cyberguide.security.SecurityUtils;
import com.cyberguide.service.AllowedLinkSanitizer;
import com.cyberguide.service.ChatPersistenceService;
import com.cyberguide.service.ChatService;
import com.cyberguide.service.strategy.ChatStrategy;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.annotation.PostConstruct;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api")
@Tag(name = "Chat", description = "AI chat endpoints")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private static final String DEBUG_LOG_PREFIX = "[DEBUG_CHAT_LOG]";
    private static final Pattern EMAIL_PATTERN = Pattern.compile("([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})");
    private static final Pattern PHONE_PATTERN = Pattern.compile("(?<!\\d)(1[3-9])(\\d{4})(\\d{4})(?!\\d)");
    private static final Pattern ID_CARD_PATTERN = Pattern.compile("(?<![A-Za-z0-9])(\\d{6})(\\d{8})(\\d{4}[0-9Xx])(?![A-Za-z0-9])");
    private static final Pattern JWT_PATTERN = Pattern.compile("eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+");
    private static final Pattern TOKEN_QUERY_PATTERN = Pattern.compile("(token=)[^&\\s]+");
    private static final Pattern API_KEY_PATTERN = Pattern.compile("(?i)(api[_-]?key\\s*[:=]\\s*)([^,\\s]+)");

    private final ChatService chatService;
    private final ChatPersistenceService chatPersistenceService;
    private final ObjectMapper objectMapper;
    private final RedisRateLimiter rateLimiter;
    private final Environment environment;

    @Value("${rate-limit.chat-per-minute:15}")
    private int chatLimitPerMinute;

    @Value("${concurrency.chat.max-inflight:120}")
    private int chatMaxInflight;

    @Value("${concurrency.stream.max-inflight:48}")
    private int streamMaxInflight;

    @Value("${debug.chat-log.enabled:false}")
    private boolean debugChatLogEnabled;

    @Value("${debug.chat-log.max-chars:1200}")
    private int debugChatLogMaxChars;

    @Value("${debug.chat-log.allowed-profiles:local,dev,test}")
    private String debugChatLogAllowedProfiles;

    @Value("${debug.chat-log.session-id:}")
    private String debugChatLogSessionId;

    @Value("${debug.chat-log.sample-rate:1.0}")
    private double debugChatLogSampleRate;

    private volatile Semaphore chatInflightGuard = new Semaphore(120, true);
    private volatile Semaphore streamInflightGuard = new Semaphore(48, true);

    public ChatController(ChatService chatService,
                          ChatPersistenceService chatPersistenceService,
                          ObjectMapper objectMapper,
                          RedisRateLimiter rateLimiter,
                          Environment environment) {
        this.chatService = chatService;
        this.chatPersistenceService = chatPersistenceService;
        this.objectMapper = objectMapper;
        this.rateLimiter = rateLimiter;
        this.environment = environment;
    }

    @PostConstruct
    void initConcurrencyGuards() {
        this.chatInflightGuard = new Semaphore(Math.max(1, chatMaxInflight), true);
        this.streamInflightGuard = new Semaphore(Math.max(1, streamMaxInflight), true);
        log.info("chat concurrency guards initialized: chat={}, stream={}", chatMaxInflight, streamMaxInflight);
        if (debugChatLogEnabled && !isAllowedProfileForDebug()) {
            log.warn("{} debug.chat-log.enabled=true but active profiles are not allowed; debug chat log will stay disabled", DEBUG_LOG_PREFIX);
        }
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
            if (shouldLogDebugChat(body.session_id())) {
                log.info("{} chat request: sessionId={}, mode={}, userMsg={}",
                    DEBUG_LOG_PREFIX,
                    body.session_id(),
                    body.mode(),
                    shortenForLog(lastUserMessage(body.messages())));
            }

            var request = new ChatService.ChatRequest(body.messages(), body.mode(), body.scenario(), body.session_id());
            var result = chatService.chat(request);
            chatPersistenceService.persistConversation(
                body.session_id(),
                SecurityUtils.currentUserId().orElse(null),
                body.mode(),
                parseUuid(body.chat_session_id()),
                body.messages(),
                result.message(),
                result.isCrisis()
            );
            if (shouldLogDebugChat(body.session_id())) {
                log.info("{} chat response: sessionId={}, mode={}, aiMsg={}",
                    DEBUG_LOG_PREFIX,
                    body.session_id(),
                    body.mode(),
                    shortenForLog(result.message()));
            }

            log.info("chat response: sessionId={}, elapsed={}ms", body.session_id(), System.currentTimeMillis() - start);
            return ResponseEntity.ok(result);
        } finally {
            chatInflightGuard.release();
        }
    }

    @PostMapping("/chat/stream")
    @Operation(summary = "Stream a chat response (NDJSON)")
    public ResponseEntity<StreamingResponseBody> chatStream(@RequestBody ChatRequestBody body) {
        long start = System.currentTimeMillis();
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
        if (shouldLogDebugChat(body.session_id())) {
            log.info("{} stream request: sessionId={}, mode={}, userMsg={}",
                DEBUG_LOG_PREFIX,
                body.session_id(),
                body.mode(),
                shortenForLog(lastUserMessage(body.messages())));
        }

        var request = new ChatService.ChatRequest(body.messages(), body.mode(), body.scenario(), body.session_id());
        ChatService.StreamResponse streamResponse = chatService.chatStreamWithMeta(request);
        List<Map<String, Object>> similarCases = streamResponse.similarCases();
        List<Map<String, Object>> evidence = streamResponse.evidence();

        StreamingResponseBody stream = outputStream -> {
            Writer writer = new OutputStreamWriter(outputStream, StandardCharsets.UTF_8);
            StringBuilder fullText = new StringBuilder();
            boolean parsedCrisis = streamResponse.presetCrisis();
            List<String> parsedSuggestions = streamResponse.presetSuggestions();
            boolean streamCompleted = false;
            String finalParsedMessage = null;
            try {
                streamResponse.stream()
                    .doOnNext(token -> {
                        try {
                            fullText.append(token);
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

                String finalMessage = fullText.toString();
                if (!streamResponse.presetCrisis()) {
                    ChatStrategy.ChatResult parsed = chatService.parseChatResult(body.mode(), finalMessage);
                    finalMessage = parsed.message();
                    parsedCrisis = parsed.isCrisis();
                    parsedSuggestions = parsed.suggestions();
                }
                finalMessage = AllowedLinkSanitizer.sanitizeWithEvidenceMaps(finalMessage, evidence, similarCases);
                finalParsedMessage = finalMessage;

                String metaJson = objectMapper.writeValueAsString(Map.of(
                    "t", "meta",
                    "message", finalMessage,
                    "suggestions", parsedSuggestions == null ? List.of() : parsedSuggestions,
                    "isCrisis", parsedCrisis,
                    "similarCases", similarCases,
                    "evidence", evidence
                ));
                writer.write(metaJson + "\n");
                writer.flush();
                streamCompleted = true;
            } catch (Exception e) {
                log.error("stream fatal error: sessionId={}", body.session_id(), e);
            } finally {
                if (streamCompleted && finalParsedMessage != null) {
                    chatPersistenceService.persistConversation(
                            body.session_id(),
                            SecurityUtils.currentUserId().orElse(null),
                            body.mode(),
                            parseUuid(body.chat_session_id()),
                            body.messages(),
                            finalParsedMessage,
                            parsedCrisis,
                            evidence
                    );
                    chatService.publishChatCompleted(
                        body.session_id(),
                        body.mode(),
                        System.currentTimeMillis() - start,
                        parsedCrisis
                    );
                    if (shouldLogDebugChat(body.session_id())) {
                        log.info("{} stream response: sessionId={}, mode={}, aiMsg={}, evidenceCount={}",
                            DEBUG_LOG_PREFIX,
                            body.session_id(),
                            body.mode(),
                            shortenForLog(finalParsedMessage),
                            evidence == null ? 0 : evidence.size());
                    }
                } else if (fullText.length() > 0) {
                    log.warn("stream incomplete, skipping persist: sessionId={}, tokensReceived={}",
                        body.session_id(), fullText.length());
                }
                try { writer.flush(); } catch (Exception ignored) {}
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

    private String lastUserMessage(List<Map<String, String>> messages) {
        if (messages == null || messages.isEmpty()) {
            return "";
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            Map<String, String> message = messages.get(i);
            if ("user".equals(message.get("role"))) {
                return message.getOrDefault("content", "");
            }
        }
        return "";
    }

    private String shortenForLog(String text) {
        if (text == null) {
            return "";
        }
        String masked = maskSensitive(text);
        String normalized = masked.replace('\n', ' ').replace('\r', ' ').trim();
        int max = Math.max(200, debugChatLogMaxChars);
        if (normalized.length() <= max) {
            return normalized;
        }
        return normalized.substring(0, max) + "...(truncated)";
    }

    private String maskSensitive(String text) {
        String masked = text;
        masked = EMAIL_PATTERN.matcher(masked).replaceAll("$1***@$2");
        masked = PHONE_PATTERN.matcher(masked).replaceAll("$1****$3");
        masked = ID_CARD_PATTERN.matcher(masked).replaceAll("$1********$3");
        masked = JWT_PATTERN.matcher(masked).replaceAll("[jwt]");
        masked = TOKEN_QUERY_PATTERN.matcher(masked).replaceAll("$1***");
        masked = API_KEY_PATTERN.matcher(masked).replaceAll("$1***");
        return masked;
    }

    private boolean shouldLogDebugChat(String sessionId) {
        if (!debugChatLogEnabled) {
            return false;
        }
        if (!isAllowedProfileForDebug()) {
            return false;
        }
        if (debugChatLogSessionId != null
                && !debugChatLogSessionId.isBlank()
                && !debugChatLogSessionId.equals(sessionId)) {
            return false;
        }
        double sampleRate = Math.max(0.0d, Math.min(1.0d, debugChatLogSampleRate));
        return ThreadLocalRandom.current().nextDouble() < sampleRate;
    }

    private boolean isAllowedProfileForDebug() {
        String[] activeProfiles = environment.getActiveProfiles();
        if (activeProfiles == null || activeProfiles.length == 0) {
            // Local dev often runs without explicit Spring profile.
            return true;
        }
        List<String> allowed = Arrays.stream(debugChatLogAllowedProfiles.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList();
        for (String profile : activeProfiles) {
            if (allowed.contains(profile)) {
                return true;
            }
        }
        return false;
    }
}
