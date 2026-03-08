package com.cyberguide.controller;

import com.cyberguide.model.CrawledArticle;
import com.cyberguide.repository.CrawledArticleRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/crawler")
@Tag(name = "Crawler", description = "Crawler data read endpoints")
public class CrawlerController {

    private static final Logger log = LoggerFactory.getLogger(CrawlerController.class);
    private final CrawledArticleRepository repo;

    public CrawlerController(CrawledArticleRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/articles")
    @Operation(summary = "List crawled articles")
    @Cacheable(value = "articles", key = "#source + ':' + #limit")
    public ResponseEntity<?> listArticles(
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "20") int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 100);
        log.info("crawler articles: source={}, limit={}", source, safeLimit);
        List<CrawledArticle> articles = repo.findArticles(source, PageRequest.of(0, safeLimit));
        return ResponseEntity.ok(ApiResponse.ok(Map.of("articles", articles)));
    }
}
