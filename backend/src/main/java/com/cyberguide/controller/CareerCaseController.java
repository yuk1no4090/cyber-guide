package com.cyberguide.controller;

import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.model.CareerCase;
import com.cyberguide.model.CrawledArticle;
import com.cyberguide.repository.CareerCaseRepository;
import com.cyberguide.repository.CrawledArticleRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/cases")
@Tag(name = "Career Cases", description = "Real career experience cases for reference")
public class CareerCaseController {

    private static final Logger log = LoggerFactory.getLogger(CareerCaseController.class);
    private static final Duration CACHE_TTL = Duration.ofMinutes(30);
    private static final Set<String> VALID_CATEGORIES = Set.of("baoyan", "kaoyan", "liuxue", "job");

    private final CareerCaseRepository repo;
    private final CrawledArticleRepository articleRepo;
    private final CacheGuard cacheGuard;

    public CareerCaseController(CareerCaseRepository repo, CrawledArticleRepository articleRepo, CacheGuard cacheGuard) {
        this.repo = repo;
        this.articleRepo = articleRepo;
        this.cacheGuard = cacheGuard;
    }

    @GetMapping
    @Operation(summary = "List career cases, optionally filtered by category")
    public ResponseEntity<?> listCases(
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "false") boolean extractedOnly) {
        if (category != null && !VALID_CATEGORIES.contains(category)) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_CATEGORY", "category 必须是 baoyan/kaoyan/liuxue/job 之一"));
        }

        int safeLimit = Math.min(Math.max(1, limit), 50);
        String cacheKey = "cases:" + category + ":" + safeLimit + ":" + extractedOnly;

        List<CareerCase> cases = cacheGuard.getOrLoad(
            cacheKey,
            () -> {
                log.info("cases cache miss: category={}, limit={}, extracted={}", category, safeLimit, extractedOnly);
                if (extractedOnly) {
                    return repo.findExtractedCases(category, PageRequest.of(0, safeLimit));
                }
                return repo.findCases(category, PageRequest.of(0, safeLimit));
            },
            CACHE_TTL
        );

        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "cases", cases != null ? cases : List.of(),
            "total", cases != null ? cases.size() : 0
        )));
    }

    @GetMapping("/categories")
    @Operation(summary = "List available case categories with counts")
    public ResponseEntity<?> categories() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "categories", List.of(
                Map.of("id", "baoyan", "label", "保研"),
                Map.of("id", "kaoyan", "label", "考研"),
                Map.of("id", "liuxue", "label", "留学"),
                Map.of("id", "job", "label", "求职")
            )
        )));
    }
}
