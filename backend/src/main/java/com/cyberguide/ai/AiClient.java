package com.cyberguide.ai;

import com.cyberguide.config.AiProperties;
import com.cyberguide.exception.AiServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * AI client with Resilience4j circuit breaker and retry.
 * <p>
 * Circuit breaker: if AI service fails >50% in a sliding window of 10 calls,
 * the circuit opens for 30s and falls back to a friendly error message.
 * <p>
 * Retry: transient failures are retried up to 2 times with 1s delay.
 */
@Component
public class AiClient {

    private static final Logger log = LoggerFactory.getLogger(AiClient.class);
    private final AiProperties props;
    private final WebClient webClient;
    private final ObjectMapper mapper = new ObjectMapper();

    public AiClient(AiProperties props) {
        this.props = props;
        this.webClient = WebClient.builder()
                .baseUrl(props.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + props.getApiKey())
                .codecs(c -> c.defaultCodecs().maxInMemorySize(512 * 1024))
                .build();
    }

    /**
     * Synchronous chat completion with circuit breaker and retry.
     */
    @CircuitBreaker(name = "aiService", fallbackMethod = "chatFallback")
    @Retry(name = "aiRetry")
    public String chat(List<Map<String, String>> messages, String systemPrompt, int maxTokens) {
        log.info("AI chat: model={}, msgCount={}, maxTokens={}", props.getModel(), messages.size(), maxTokens);
        long start = System.currentTimeMillis();

        ObjectNode body = buildRequestBody(messages, systemPrompt, maxTokens, false);

        try {
            String raw = webClient.post()
                    .uri("/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body.toString())
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofMillis(props.getTimeoutMs()))
                    .block();

            JsonNode root = mapper.readTree(raw);
            String content = root.path("choices").path(0).path("message").path("content").asText("");

            long elapsed = System.currentTimeMillis() - start;
            log.info("AI chat completed: elapsed={}ms, responseLen={}", elapsed, content.length());
            return content;

        } catch (WebClientResponseException e) {
            log.error("AI API error: status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new AiServiceException("AI API returned " + e.getStatusCode(), e);
        } catch (Exception e) {
            log.error("AI chat failed: {}", e.getMessage());
            throw new AiServiceException("AI 调用失败: " + e.getMessage(), e);
        }
    }

    /**
     * Fallback when circuit breaker is open or all retries exhausted.
     */
    @SuppressWarnings("unused")
    private String chatFallback(List<Map<String, String>> messages, String systemPrompt, int maxTokens, Throwable t) {
        log.warn("AI circuit breaker fallback triggered: {}", t.getMessage());

        // Try fallback model if configured
        if (props.getFallbackModel() != null && !props.getFallbackModel().isBlank()) {
            try {
                log.info("Attempting fallback model: {}", props.getFallbackModel());
                return chatWithModel(messages, systemPrompt, maxTokens, props.getFallbackModel());
            } catch (Exception fallbackEx) {
                log.error("Fallback model also failed: {}", fallbackEx.getMessage());
            }
        }

        return "抱歉，AI 服务暂时不可用，请稍后再试。如果你正在经历困难，可以拨打心理援助热线：400-161-9995。";
    }

    /**
     * Chat with a specific model (used for fallback).
     */
    private String chatWithModel(List<Map<String, String>> messages, String systemPrompt, int maxTokens, String model) {
        ObjectNode body = buildRequestBody(messages, systemPrompt, maxTokens, false);
        body.put("model", model);

        String raw = webClient.post()
                .uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofMillis(props.getTimeoutMs()))
                .block();

        try {
            JsonNode root = mapper.readTree(raw);
            return root.path("choices").path(0).path("message").path("content").asText("");
        } catch (Exception e) {
            throw new AiServiceException("Fallback model response parse failed", e);
        }
    }

    /**
     * Streaming chat completion (SSE-style).
     */
    public Flux<String> chatStream(List<Map<String, String>> messages, String systemPrompt, int maxTokens) {
        ObjectNode body = buildRequestBody(messages, systemPrompt, maxTokens, true);

        return webClient.post()
                .uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .retrieve()
                .bodyToFlux(String.class)
                .timeout(Duration.ofMillis(props.getTimeoutMs()))
                .mapNotNull(line -> {
                    try {
                        if (line.startsWith("data: ")) line = line.substring(6);
                        if ("[DONE]".equals(line.trim())) return null;
                        JsonNode node = mapper.readTree(line);
                        return node.path("choices").path(0).path("delta").path("content").asText("");
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(s -> s != null && !s.isEmpty());
    }

    private ObjectNode buildRequestBody(List<Map<String, String>> messages, String systemPrompt, int maxTokens, boolean stream) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", props.getModel());
        body.put("temperature", 0.85);
        body.put("max_tokens", maxTokens);
        body.put("stream", stream);

        ArrayNode msgArray = body.putArray("messages");
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            ObjectNode sys = msgArray.addObject();
            sys.put("role", "system");
            sys.put("content", systemPrompt);
        }
        for (Map<String, String> msg : messages) {
            ObjectNode m = msgArray.addObject();
            m.put("role", msg.get("role"));
            m.put("content", msg.get("content"));
        }
        return body;
    }
}
