package com.cyberguide.controller;

import com.cyberguide.service.PlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

@RestController
@RequestMapping("/api/plan")
@Tag(name = "Plan", description = "7-day action plan endpoints")
public class PlanController {

    private static final Set<String> VALID_STATUSES = Set.of("todo", "done", "skipped");
    private final PlanService planService;

    public PlanController(PlanService planService) {
        this.planService = planService;
    }

    @GetMapping("/fetch")
    @Operation(summary = "Fetch plans for a session")
    public ResponseEntity<?> fetch(@RequestParam("session_id") String sessionId) {
        if (sessionId == null || sessionId.isBlank() || sessionId.length() > 128) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_SESSION_ID", "session_id 必填且长度不能超过 128"));
        }
        var result = planService.fetch(sessionId);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "plans", result.plans(),
            "today_index", result.todayIndex(),
            "today_plan", result.todayPlan() != null ? result.todayPlan() : Map.of()
        )));
    }

    public record GenerateBody(String session_id, String context) {}

    @PostMapping("/generate")
    @Operation(summary = "Generate 7-day plan")
    public ResponseEntity<?> generate(@RequestBody GenerateBody body) {
        if (body.session_id() == null || body.session_id().isBlank() || body.session_id().length() > 128) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_SESSION_ID", "session_id 必填且长度不能超过 128"));
        }
        var result = planService.generate(body.session_id(), body.context());
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "plans", result.plans(),
            "today_index", result.todayIndex()
        )));
    }

    public record UpdateBody(String session_id, Integer day_index, String status) {}

    @PostMapping("/update")
    @Operation(summary = "Update plan day status")
    public ResponseEntity<?> update(@RequestBody UpdateBody body) {
        if (body.session_id() == null || body.session_id().isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_SESSION_ID", "session_id 必填"));
        }
        if (body.day_index() == null || body.day_index() < 1 || body.day_index() > 7) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_DAY_INDEX", "day_index 必须是 1~7"));
        }
        if (body.status() == null || !VALID_STATUSES.contains(body.status())) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_STATUS", "status 必须是 todo/done/skipped"));
        }
        try {
            var plan = planService.update(body.session_id(), body.day_index(), body.status());
            return ResponseEntity.ok(ApiResponse.ok(Map.of("plan", plan)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(404)
                .body(ApiResponse.fail("PLAN_NOT_FOUND", "未找到对应日期任务"));
        }
    }

    public record RegenerateDayBody(String session_id, Integer day_index, String context) {}

    @PostMapping("/regenerate-day")
    @Operation(summary = "Regenerate a single day task")
    public ResponseEntity<?> regenerateDay(@RequestBody RegenerateDayBody body) {
        if (body.session_id() == null || body.session_id().isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_SESSION_ID", "session_id 必填"));
        }
        if (body.day_index() == null || body.day_index() < 1 || body.day_index() > 7) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_DAY_INDEX", "day_index 必须是 1~7"));
        }
        var plan = planService.regenerateDay(body.session_id(), body.day_index(), body.context());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("plan", plan)));
    }
}
