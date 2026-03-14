package com.cyberguide.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "crawled_articles", indexes = {
    @Index(name = "idx_crawled_source", columnList = "source_name"),
    @Index(name = "idx_crawled_dedupe", columnList = "dedupe_hash", unique = true)
})
public class CrawledArticle {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "source_name", nullable = false, length = 64)
    private String sourceName;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String url;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(name = "content_snippet", columnDefinition = "TEXT")
    private String contentSnippet;

    @Column(length = 32)
    private String category;

    @Column(length = 16)
    private String language = "zh";

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "crawl_time", nullable = false)
    private Instant crawlTime;

    @Column(name = "quality_score")
    private double qualityScore;

    @Column(name = "relevance_tier", length = 16)
    private String relevanceTier = "low";

    @Column(name = "dedupe_hash", nullable = false, length = 64)
    private String dedupeHash;

    @PrePersist
    void onCreate() {
        if (crawlTime == null) crawlTime = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getSourceName() { return sourceName; }
    public void setSourceName(String sourceName) { this.sourceName = sourceName; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getContentSnippet() { return contentSnippet; }
    public void setContentSnippet(String contentSnippet) { this.contentSnippet = contentSnippet; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant publishedAt) { this.publishedAt = publishedAt; }
    public Instant getCrawlTime() { return crawlTime; }
    public void setCrawlTime(Instant crawlTime) { this.crawlTime = crawlTime; }
    public double getQualityScore() { return qualityScore; }
    public void setQualityScore(double qualityScore) { this.qualityScore = qualityScore; }
    public String getRelevanceTier() { return relevanceTier; }
    public void setRelevanceTier(String relevanceTier) { this.relevanceTier = relevanceTier; }
    public String getDedupeHash() { return dedupeHash; }
    public void setDedupeHash(String dedupeHash) { this.dedupeHash = dedupeHash; }
}
