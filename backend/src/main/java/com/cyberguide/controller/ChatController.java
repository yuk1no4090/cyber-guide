package com.cyberguide.controller;

import com.cyberguide.service.ChatService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    public record ChatRequestBody(
        List<Map<String, String>> messages,
        String mode,
        String scenario,
        String session_id
    ) {}

    @PostMapping("/chat")
    @Operation(summary = "Chat with AI (JSON response)")
    public ResponseEntity<?> chat(@RequestBody ChatRequestBody body) {
        if (body.messages() == null || body.messages().isEmpty()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_REQUEST", "messages is required"));
        }

        var request = new ChatService.ChatRequest(
            body.messages(), body.mode(), body.scenario(), body.session_id()
        );

        var result = chatService.chat(request);
        return ResponseEntity.ok(Map.of(
            "message", result.message(),
            "suggestions", result.suggestions(),
            "isCrisis", result.isCrisis()
        ));
    }

    @PostMapping(value = "/chat/stream", produces = MediaType.APPLICATION_NDJSON_VALUE)
    @Operation(summary = "Chat with AI (NDJSON streaming)")
    public ResponseEntity<StreamingResponseBody> chatStream(@RequestBody ChatRequestBody body) {
        if (body.messages() == null || body.messages().isEmpty()) {
            StreamingResponseBody errorBody = out -> {
                Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
                w.write("{\"t\":\"error\",\"message\":\"messages is required\"}\n");
                w.flush();
            };
            return ResponseEntity.badRequest()
                .contentType(MediaType.APPLICATION_NDJSON)
                .body(errorBody);
        }

        var request = new ChatService.ChatRequest(
            body.messages(), body.mode(), body.scenario(), body.session_id()
        );

        StreamingResponseBody stream = outputStream -> {
            Writer writer = new OutputStreamWriter(outputStream, StandardCharsets.UTF_8);
            StringBuilder accumulated = new StringBuilder();

            chatService.chatStream(request)
                .doOnNext(delta -> {
                    try {
                        accumulated.append(delta);
                        String escaped = delta.replace("\\", "\\\\").replace("\"", "\\\"")
                                              .replace("\n", "\\n");
                        writer.write("{\"t\":\"delta\",\"c\":\"" + escaped + "\"}\n");
                        writer.flush();
                    } catch (Exception ignored) {}
                })
                .doOnComplete(() -> {
                    try {
                        String msg = accumulated.toString().replace("\\", "\\\\")
                                                .replace("\"", "\\\"").replace("\n", "\\n");
                        writer.write("{\"t\":\"meta\",\"message\":\"" + msg +
                                     "\",\"suggestions\":[\"继续聊聊\",\"换个话题\"]}\n");
                        writer.flush();
                    } catch (Exception ignored) {}
                })
                .doOnError(err -> {
                    try {
                        writer.write("{\"t\":\"error\",\"message\":\"" +
                                     err.getMessage().replace("\"", "'") + "\"}\n");
                        writer.flush();
                    } catch (Exception ignored) {}
                })
                .blockLast();
        };

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_NDJSON)
            .header("Cache-Control", "no-cache, no-transform")
            .header("X-Content-Type-Options", "nosniff")
            .body(stream);
    }
}
