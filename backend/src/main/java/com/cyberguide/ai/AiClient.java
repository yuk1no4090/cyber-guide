package com.cyberguide.ai;

import com.cyberguide.config.AiProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.List;
import java.util.Map;

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
                .defaultHeader("Content-Type", "application/json")
                .build();
    }

    /**
     * Non-streaming chat completion. Returns the assistant message content.
     */
    public String chatCompletion(List<Map<String, String>> messages, double temperature, int maxTokens) {
        String model = props.getModel();
        ObjectNode body = buildRequestBody(messages, model, temperature, maxTokens, false);

        try {
            String response = webClient.post()
                    .uri("/chat/completions")
                    .bodyValue(body.toString())
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofMillis(props.getTimeoutMs()))
                    .block();

            JsonNode root = mapper.readTree(response);
            return root.path("choices").path(0).path("message").path("content").asText("");
        } catch (Exception e) {
            log.error("AI completion failed: {}", e.getMessage());
            // Try fallback model
            if (props.getFallbackModel() != null && !props.getFallbackModel().isBlank()) {
                return chatCompletionWithModel(messages, props.getFallbackModel(), temperature, maxTokens);
            }
            throw new RuntimeException("AI service unavailable", e);
        }
    }

    private String chatCompletionWithModel(List<Map<String, String>> messages, String model,
                                           double temperature, int maxTokens) {
        ObjectNode body = buildRequestBody(messages, model, temperature, maxTokens, false);
        try {
            String response = webClient.post()
                    .uri("/chat/completions")
                    .bodyValue(body.toString())
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofMillis(props.getTimeoutMs()))
                    .block();
            JsonNode root = mapper.readTree(response);
            return root.path("choices").path(0).path("message").path("content").asText("");
        } catch (Exception e) {
            throw new RuntimeException("AI fallback also failed", e);
        }
    }

    /**
     * Streaming chat completion. Returns a Flux of content deltas.
     */
    public Flux<String> chatCompletionStream(List<Map<String, String>> messages,
                                              double temperature, int maxTokens) {
        ObjectNode body = buildRequestBody(messages, props.getModel(), temperature, maxTokens, true);

        return webClient.post()
                .uri("/chat/completions")
                .bodyValue(body.toString())
                .accept(MediaType.TEXT_EVENT_STREAM)
                .retrieve()
                .bodyToFlux(String.class)
                .timeout(Duration.ofMillis(props.getTimeoutMs()))
                .filter(line -> !line.isBlank() && !line.equals("[DONE]"))
                .map(line -> {
                    try {
                        String data = line.startsWith("data: ") ? line.substring(6) : line;
                        if (data.equals("[DONE]")) return "";
                        JsonNode node = mapper.readTree(data);
                        return node.path("choices").path(0).path("delta").path("content").asText("");
                    } catch (Exception e) {
                        return "";
                    }
                })
                .filter(s -> !s.isEmpty());
    }

    private ObjectNode buildRequestBody(List<Map<String, String>> messages, String model,
                                         double temperature, int maxTokens, boolean stream) {
        ObjectNode body = mapper.createObjectNode();
        body.put("model", model);
        body.put("temperature", temperature);
        body.put("max_tokens", maxTokens);
        body.put("stream", stream);

        ArrayNode msgArray = body.putArray("messages");
        for (Map<String, String> msg : messages) {
            ObjectNode m = msgArray.addObject();
            m.put("role", msg.get("role"));
            m.put("content", msg.get("content"));
        }
        return body;
    }
}
