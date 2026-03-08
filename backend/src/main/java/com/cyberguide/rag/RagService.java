package com.cyberguide.rag;

import com.cyberguide.infrastructure.cache.CacheGuard;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

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

    public RagService(CacheGuard cacheGuard) {
        this.cacheGuard = cacheGuard;
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

    /**
     * Retrieve relevant knowledge chunks — cached in Redis for 30 minutes.
     * Uses CacheGuard for penetration/avalanche/breakdown protection.
     */
    public List<RetrievalResult> retrieve(String query, int topK) {
        if (chunks.isEmpty()) return List.of();

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
     * Actual retrieval logic — keyword + bigram scoring.
     */
    private List<RetrievalResult> doRetrieve(String query, int topK) {
        String queryLower = query.toLowerCase();

        record Scored(KnowledgeChunk chunk, double score) {}

        List<Scored> scored = chunks.stream().map(chunk -> {
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
          .toList();

        return scored.stream().map(s -> new RetrievalResult(
            truncate(s.chunk.content(), maxEvidenceChunkLength),
            s.chunk.source(),
            s.score
        )).toList();
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

    /**
     * Simple hash for cache key — keeps keys short and safe.
     */
    private String hashQuery(String query) {
        int hash = query.hashCode();
        return Integer.toHexString(hash);
    }
}
