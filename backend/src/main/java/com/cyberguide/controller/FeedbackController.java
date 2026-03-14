package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.security.SecurityUtils;
import com.cyberguide.service.FeedbackService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
@Tag(name = "Feedback", description = "User feedback endpoints")
public class FeedbackController {

    private static final Logger log = LoggerFactory.getLogger(FeedbackController.class);
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
        String mode,
        String session_id
    ) {}

    @PostMapping("/feedback")
    @Operation(summary = "Submit session feedback")
    public ResponseEntity<?> submit(@RequestBody FeedbackBody body) {
        if (body.rating() < 1 || body.rating() > 5) {
            throw new BizException(ErrorCode.INVALID_RATING, "rating 必须是 1~5");
        }
        if (body.mode() != null && !body.mode().isEmpty() && !ALLOWED_MODES.contains(body.mode())) {
            throw new BizException(ErrorCode.INVALID_MODE, "mode 必须是 chat/profile/profile_other 之一");
        }

        log.info("feedback submit: rating={}, mode={}, hasCrisis={}", body.rating(), body.mode(), body.hadCrisis());

        var request = new FeedbackService.FeedbackRequest(
            body.messages(),
            body.rating(),
            body.feedback(),
            body.hadCrisis(),
            body.mode(),
            body.session_id() != null ? body.session_id() : SecurityUtils.currentAnonymousSessionId().orElse(null),
            SecurityUtils.currentUserId().orElse(null)
        );
        var quality = feedbackService.submit(request);

        log.info("feedback quality: score={}, tier={}", quality.score(), quality.tier());
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "quality", Map.of("score", quality.score(), "tier", quality.tier())
        )));
    }
}
