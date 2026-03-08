package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.service.PlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

@RestController
@RequestMapping("/api/plan")
@Tag(name = "Plan", description = "7-day action plan endpoints")
public class PlanController {

    private static final Logger log = LoggerFactory.getLogger(PlanController.class);
    private static final Set<String> VALID_STATUSES = Set.of("todo", "done", "skipped");
    private final PlanService planService;

    public PlanController(PlanService planService) {
        this.planService = planService;
    }

    @GetMapping("/fetch")
    @Operation(summary = "Fetch plans for a session")
    public ResponseEntity<?> fetch(@RequestParam String session_id) {
        if (session_id == null || session_id.isBlank()) {
            throw new BizException(ErrorCode.INVALID_SESSION_ID);
        }
        log.info("plan fetch: sessionId={}", session_id);
        var result = planService.fetch(session_id);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("plans", result.plans(), "today_index", result.todayIndex())));
    }

    @PostMapping("/generate")
    @Operation(summary = "Generate a 7-day plan")
    public ResponseEntity<?> generate(@RequestBody Map<String, String> body) {
        String sessionId = body.get("session_id");
        String context = body.getOrDefault("context", "");
        if (sessionId == null || sessionId.isBlank()) {
            throw new BizException(ErrorCode.INVALID_SESSION_ID);
        }
        log.info("plan generate: sessionId={}", sessionId);
        var result = planService.generate(sessionId, context);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("plans", result.plans())));
    }

    @PutMapping("/status")
    @Operation(summary = "Update a plan day status")
    public ResponseEntity<?> updateStatus(@RequestBody StatusBody body) {
        if (body.session_id() == null || body.session_id().isBlank()) {
            throw new BizException(ErrorCode.INVALID_SESSION_ID);
        }
        if (!VALID_STATUSES.contains(body.status())) {
            throw new BizException(ErrorCode.INVALID_STATUS, "status 必须是 todo/done/skipped 之一");
        }
        log.info("plan status update: sessionId={}, day={}, status={}", body.session_id(), body.day_index(), body.status());
        try {
            var plan = planService.update(body.session_id(), body.day_index(), body.status());
            return ResponseEntity.ok(ApiResponse.ok(Map.of("plan", plan)));
        } catch (NoSuchElementException e) {
            throw new BizException(ErrorCode.RESOURCE_NOT_FOUND, "未找到对应的计划");
        }
    }

    @PostMapping("/regenerate")
    @Operation(summary = "Regenerate a single plan day")
    public ResponseEntity<?> regenerate(@RequestBody RegenerateBody body) {
        if (body.session_id() == null || body.session_id().isBlank()) {
            throw new BizException(ErrorCode.INVALID_SESSION_ID);
        }
        if (body.day_index() < 1 || body.day_index() > 7) {
            throw new BizException(ErrorCode.INVALID_DAY_INDEX);
        }
        log.info("plan regenerate: sessionId={}, day={}", body.session_id(), body.day_index());
        var plan = planService.regenerateDay(body.session_id(), body.day_index(), body.context());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("plan", plan)));
    }

    public record StatusBody(String session_id, int day_index, String status) {}
    public record RegenerateBody(String session_id, int day_index, String context) {}
}
