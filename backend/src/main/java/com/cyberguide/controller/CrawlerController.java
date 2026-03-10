package com.cyberguide.controller;

import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.model.CrawledArticle;
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

@RestController
@RequestMapping("/api/crawler")
@Tag(name = "Crawler", description = "Crawler data read endpoints")
public class CrawlerController {

    private static final Logger log = LoggerFactory.getLogger(CrawlerController.class);
    private static final Duration ARTICLES_CACHE_TTL = Duration.ofMinutes(60);

    private final CrawledArticleRepository repo;
    private final CacheGuard cacheGuard;

    public CrawlerController(CrawledArticleRepository repo, CacheGuard cacheGuard) {
        this.repo = repo;
        this.cacheGuard = cacheGuard;
    }

    @GetMapping("/articles")
    @Operation(summary = "List crawled articles")
    public ResponseEntity<?> listArticles(
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "20") int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 100);
        String cacheKey = "articles:" + source + ":" + safeLimit;

        List<CrawledArticle> articles = cacheGuard.getOrLoad(
            cacheKey,
            () -> {
                log.info("articles cache miss: source={}, limit={}", source, safeLimit);
                return repo.findArticles(source, PageRequest.of(0, safeLimit));
            },
            ARTICLES_CACHE_TTL
        );

        return ResponseEntity.ok(ApiResponse.ok(Map.of("articles", articles != null ? articles : List.of())));
    }
}
