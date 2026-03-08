package com.cyberguide.controller;

import com.cyberguide.model.CrawledArticle;
import com.cyberguide.repository.CrawledArticleRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/crawler")
@Tag(name = "Crawler", description = "Crawler data read endpoints")
public class CrawlerController {

    private final CrawledArticleRepository repo;

    public CrawlerController(CrawledArticleRepository repo) {
        this.repo = repo;
    }

    @GetMapping("/articles")
    @Operation(summary = "List crawled articles")
    public ResponseEntity<?> listArticles(
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "20") int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 100);
        List<CrawledArticle> articles = repo.findArticles(source, PageRequest.of(0, safeLimit));
        return ResponseEntity.ok(ApiResponse.ok(Map.of("articles", articles)));
    }
}
