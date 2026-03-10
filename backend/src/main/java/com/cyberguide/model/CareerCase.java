package com.cyberguide.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "career_cases", indexes = {
    @Index(name = "idx_cases_category", columnList = "category"),
    @Index(name = "idx_cases_quality", columnList = "quality_score")
})
public class CareerCase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 64)
    private String source;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String url;

    @Column(nullable = false, length = 512)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(nullable = false, length = 32)
    private String category;

    @Column(columnDefinition = "TEXT")
    private String background;

    @Column(columnDefinition = "TEXT")
    private String result;

    @Column(columnDefinition = "TEXT")
    private String tags;

    @Column(name = "quality_score")
    private double qualityScore;

    @Column(name = "dedupe_hash", nullable = false, unique = true, length = 64)
    private String dedupeHash;

    @Column(name = "crawl_time", nullable = false)
    private Instant crawlTime;

    @Column(name = "extracted_at")
    private Instant extractedAt;

    @PrePersist
    void onCreate() {
        if (crawlTime == null) crawlTime = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getBackground() { return background; }
    public void setBackground(String background) { this.background = background; }
    public String getResult() { return result; }
    public void setResult(String result) { this.result = result; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
    public double getQualityScore() { return qualityScore; }
    public void setQualityScore(double qualityScore) { this.qualityScore = qualityScore; }
    public String getDedupeHash() { return dedupeHash; }
    public void setDedupeHash(String dedupeHash) { this.dedupeHash = dedupeHash; }
    public Instant getCrawlTime() { return crawlTime; }
    public void setCrawlTime(Instant crawlTime) { this.crawlTime = crawlTime; }
    public Instant getExtractedAt() { return extractedAt; }
    public void setExtractedAt(Instant extractedAt) { this.extractedAt = extractedAt; }
}
