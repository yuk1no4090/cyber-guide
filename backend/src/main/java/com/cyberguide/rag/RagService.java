package com.cyberguide.rag;

import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.model.CareerCase;
import com.cyberguide.model.CrawledArticle;
import com.cyberguide.repository.CareerCaseRepository;
import com.cyberguide.repository.CrawledArticleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * RAG service — retrieves relevant evidence from two sources:
 * 1. In-memory knowledge base (knowledge_base/skills/*.md)
 * 2. Database (career_cases + crawled_articles from crawler)
 *
 * Results are merged, scored, and cached in Redis.
 */
@Service
public class RagService {

    private static final Logger log = LoggerFactory.getLogger(RagService.class);
    private static final Duration RAG_CACHE_TTL = Duration.ofMinutes(30);
    private static final String CACHE_KEY_PREFIX = "rag:evidence:";

    @Value("${rag.knowledge-base-path:../knowledge_base/skills}")
    private String knowledgeBasePath;

    @Value("${rag.max-evidence-chunk-length:480}")
    private int maxEvidenceChunkLength;

    @Value("${rag.default-top-k:2}")
    private int defaultTopK;

    private final List<KnowledgeChunk> chunks = new ArrayList<>();
    private final CacheGuard cacheGuard;
    private final CareerCaseRepository caseRepo;
    private final CrawledArticleRepository articleRepo;

    public RagService(CacheGuard cacheGuard,
                      CareerCaseRepository caseRepo,
                      CrawledArticleRepository articleRepo) {
        this.cacheGuard = cacheGuard;
        this.caseRepo = caseRepo;
        this.articleRepo = articleRepo;
    }

    public record KnowledgeChunk(String content, String source, List<String> keywords) {}
    public record RetrievalResult(String content, String source, double score) implements java.io.Serializable {}

    @PostConstruct
    public void loadKnowledgeBase() {
        Path basePath = Paths.get(knowledgeBasePath);
        if (!Files.isDirectory(basePath)) {
            log.warn("Knowledge base path not found: {}", basePath.toAbsolutePath());
            return;
        }

        try (Stream<Path> files = Files.list(basePath)) {
            files.filter(p -> p.toString().endsWith(".md")).forEach(this::loadFile);
        } catch (IOException e) {
            log.error("Failed to load knowledge base", e);
        }
        log.info("RAG loaded {} chunks from knowledge base", chunks.size());
    }

    private void loadFile(Path file) {
        try {
            String content = Files.readString(file);
            String source = file.getFileName().toString().replace(".md", "");

            Pattern kwPattern = Pattern.compile("\\*\\*关键词\\*\\*:\\s*(.+)");
            Matcher m = kwPattern.matcher(content);
            List<String> keywords = m.find()
                ? Arrays.stream(m.group(1).split("[,，、]")).map(String::trim).map(String::toLowerCase).toList()
                : List.of();

            for (String chunk : chunkText(content, 500)) {
                chunks.add(new KnowledgeChunk(chunk, source, keywords));
            }
        } catch (IOException e) {
            log.error("Failed to read {}", file, e);
        }
    }

    private List<String> chunkText(String text, int chunkSize) {
        List<String> result = new ArrayList<>();
        String[] paragraphs = text.split("\n\n+");
        StringBuilder current = new StringBuilder();

        for (String para : paragraphs) {
            String trimmed = para.trim();
            if (trimmed.isEmpty()) continue;

            if (current.length() + trimmed.length() < chunkSize) {
                if (!current.isEmpty()) current.append("\n\n");
                current.append(trimmed);
            } else {
                if (!current.isEmpty()) result.add(current.toString());
                current = new StringBuilder(trimmed);
            }
        }
        if (!current.isEmpty()) result.add(current.toString());
        return result;
    }

    public List<RetrievalResult> retrieve(String query, int topK) {
        String cacheKey = CACHE_KEY_PREFIX + hashQuery(query) + ":" + topK;

        @SuppressWarnings("unchecked")
        List<RetrievalResult> cached = cacheGuard.getOrLoad(
            cacheKey,
            () -> doRetrieve(query, topK),
            RAG_CACHE_TTL
        );

        return cached != null ? cached : List.of();
    }

    public List<RetrievalResult> retrieve(String query) {
        return retrieve(query, defaultTopK);
    }

    /**
     * Merged retrieval: knowledge base (in-memory) + database (career_cases + crawled_articles).
     */
    private List<RetrievalResult> doRetrieve(String query, int topK) {
        List<RetrievalResult> results = new ArrayList<>();

        // 1. In-memory knowledge base chunks
        results.addAll(retrieveFromKnowledgeBase(query, topK));

        // 2. Career cases from database (AI-extracted structured data)
        results.addAll(retrieveFromCareerCases(query, Math.max(1, topK / 2)));

        // 3. Crawled articles from database
        results.addAll(retrieveFromArticles(query, Math.max(1, topK / 2)));

        // Sort by score descending, take top-K
        results.sort(Comparator.comparingDouble(RetrievalResult::score).reversed());
        return results.stream().limit(topK + 2).toList();
    }

    private List<RetrievalResult> retrieveFromKnowledgeBase(String query, int topK) {
        if (chunks.isEmpty()) return List.of();

        String queryLower = query.toLowerCase();
        record Scored(KnowledgeChunk chunk, double score) {}

        return chunks.stream().map(chunk -> {
            double score = 0;
            for (String kw : chunk.keywords()) {
                if (queryLower.contains(kw)) score += 3;
            }
            String contentLower = chunk.content().toLowerCase();
            for (int i = 0; i < queryLower.length() - 1; i++) {
                String bigram = queryLower.substring(i, i + 2);
                if (contentLower.contains(bigram)) score += 1;
            }
            return new Scored(chunk, score);
        }).filter(s -> s.score > 0)
          .sorted(Comparator.comparingDouble(Scored::score).reversed())
          .limit(topK)
          .map(s -> new RetrievalResult(
              truncate(s.chunk.content(), maxEvidenceChunkLength),
              "kb:" + s.chunk.source(),
              s.score
          )).toList();
    }

    /**
     * Search career_cases by keyword matching on title + background + tags.
     */
    private List<RetrievalResult> retrieveFromCareerCases(String query, int limit) {
        try {
            List<CareerCase> cases = caseRepo.findCases(null, PageRequest.of(0, 20));
            if (cases.isEmpty()) return List.of();

            String queryLower = query.toLowerCase();
            return cases.stream()
                .map(c -> {
                    String searchable = ((c.getTitle() != null ? c.getTitle() : "") + " " +
                        (c.getBackground() != null ? c.getBackground() : "") + " " +
                        (c.getResult() != null ? c.getResult() : "") + " " +
                        (c.getTags() != null ? c.getTags() : "")).toLowerCase();
                    double score = 0;
                    for (int i = 0; i < queryLower.length() - 1; i++) {
                        if (searchable.contains(queryLower.substring(i, i + 2))) score += 1;
                    }
                    return new Object[]{c, score};
                })
                .filter(pair -> ((double) pair[1]) > 2)
                .sorted((a, b) -> Double.compare((double) b[1], (double) a[1]))
                .limit(limit)
                .map(pair -> {
                    CareerCase c = (CareerCase) pair[0];
                    String evidence = formatCaseEvidence(c);
                    return new RetrievalResult(truncate(evidence, maxEvidenceChunkLength),
                        "case:" + c.getSource(), (double) pair[1]);
                }).toList();
        } catch (Exception e) {
            log.warn("Career case retrieval failed: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Search crawled_articles by keyword matching on title + summary.
     */
    private List<RetrievalResult> retrieveFromArticles(String query, int limit) {
        try {
            List<CrawledArticle> articles = articleRepo.findArticles(null, PageRequest.of(0, 20));
            if (articles.isEmpty()) return List.of();

            String queryLower = query.toLowerCase();
            return articles.stream()
                .map(a -> {
                    String searchable = ((a.getTitle() != null ? a.getTitle() : "") + " " +
                        (a.getSummary() != null ? a.getSummary() : "")).toLowerCase();
                    double score = 0;
                    for (int i = 0; i < queryLower.length() - 1; i++) {
                        if (searchable.contains(queryLower.substring(i, i + 2))) score += 1;
                    }
                    return new Object[]{a, score};
                })
                .filter(pair -> ((double) pair[1]) > 2)
                .sorted((a, b) -> Double.compare((double) b[1], (double) a[1]))
                .limit(limit)
                .map(pair -> {
                    CrawledArticle a = (CrawledArticle) pair[0];
                    String content = a.getSummary() != null ? a.getSummary() : a.getTitle();
                    return new RetrievalResult(truncate(content, maxEvidenceChunkLength),
                        "article:" + a.getSourceName(), (double) pair[1]);
                }).toList();
        } catch (Exception e) {
            log.warn("Article retrieval failed: {}", e.getMessage());
            return List.of();
        }
    }

    private String formatCaseEvidence(CareerCase c) {
        StringBuilder sb = new StringBuilder();
        sb.append("【真实案例】").append(c.getTitle()).append("\n");
        if (c.getBackground() != null && !c.getBackground().isBlank()) {
            sb.append("背景：").append(c.getBackground()).append("\n");
        }
        if (c.getResult() != null && !c.getResult().isBlank()) {
            sb.append("结果：").append(c.getResult()).append("\n");
        }
        if (c.getTags() != null && !c.getTags().isBlank()) {
            sb.append("标签：").append(c.getTags());
        }
        return sb.toString();
    }

    public String formatEvidence(List<RetrievalResult> results) {
        if (results.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("\n---\n# KNOWLEDGE BASE EVIDENCE\n\n");
        for (int i = 0; i < results.size(); i++) {
            RetrievalResult r = results.get(i);
            sb.append("[EVIDENCE ").append(i + 1).append("] (来源: ").append(r.source()).append(")\n");
            sb.append(r.content()).append("\n\n");
        }
        sb.append("# END OF EVIDENCE\n---\n");
        return sb.toString();
    }

    private String truncate(String text, int maxLen) {
        if (text.length() <= maxLen) return text;
        return text.substring(0, maxLen) + "...";
    }

    private String hashQuery(String query) {
        int hash = query.hashCode();
        return Integer.toHexString(hash);
    }
}
