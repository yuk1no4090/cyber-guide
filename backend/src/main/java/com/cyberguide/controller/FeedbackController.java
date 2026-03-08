package com.cyberguide.controller;

import com.cyberguide.service.FeedbackService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
@Tag(name = "Feedback", description = "User feedback endpoints")
public class FeedbackController {

    private static final Set<String> ALLOWED_MODES = Set.of("chat", "profile", "profile_other");
    private final FeedbackService feedbackService;

    public FeedbackController(FeedbackService feedbackService) {
        this.feedbackService = feedbackService;
    }

    public record FeedbackBody(
        List<Map<String, String>> messages,
        int rating,
        String feedback,
        boolean hadCrisis,
        String mode
    ) {}

    @PostMapping("/feedback")
    @Operation(summary = "Submit conversation feedback")
    public ResponseEntity<?> submit(@RequestBody FeedbackBody body) {
        if (body.messages() == null || body.messages().isEmpty()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_REQUEST", "没有对话内容"));
        }
        if (body.rating() < 1 || body.rating() > 10) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_RATING", "评分无效"));
        }
        if (!ALLOWED_MODES.contains(body.mode())) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_MODE", "模式无效"));
        }

        var request = new FeedbackService.FeedbackRequest(
            body.messages(), body.rating(), body.feedback(), body.hadCrisis(), body.mode()
        );
        var quality = feedbackService.submit(request);

        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "quality", Map.of("score", quality.score(), "tier", quality.tier())
        )));
    }
}
