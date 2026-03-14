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
    private static final String PROFILE_DATA_PREFIX = "[PROFILE_DATA]";
    private static final Pattern SCHOOL_PATTERN = Pattern.compile("([\\u4e00-\\u9fa5A-Za-z]{2,20}(大学|学院))");
    private static final Pattern GPA_PATTERN = Pattern.compile("(GPA|gpa|绩点)\\s*[:：]?\\s*([0-9](?:\\.[0-9]{1,2})?)");
    private static final Pattern STAGE_PATTERN = Pattern.compile("(大一|大二|大三|大四|研一|研二|已工作)");

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
    public record RetrievalResult(
        String title,
        String content,
        String source,
        String url,
        String category,
        String relevanceTier,
        double score
    ) implements java.io.Serializable {}
    public enum UserIntent { POSTGRAD, JOB, UNKNOWN }
    public enum TargetIntent { KAOYAN, BAOYAN, JOB, UNKNOWN }
    public record UserProfile(
        UserIntent intent,
        TargetIntent targetIntent,
        String stage,
        String school,
        String gpa,
        String highlights,
        List<String> keywords
    )
        implements java.io.Serializable {}

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
     * Profile-aware retrieval: infers user intent/background from conversation and uses it for ranking.
     */
    public List<RetrievalResult> retrieve(String query, List<Map<String, String>> messages) {
        UserProfile profile = inferUserProfile(messages, query);
        return retrieve(query, profile, defaultTopK);
    }

    public List<RetrievalResult> retrieve(String query, UserProfile profile, int topK) {
        UserProfile safeProfile = profile != null
            ? profile
            : new UserProfile(UserIntent.UNKNOWN, TargetIntent.UNKNOWN, "", "", "", "", List.of());
        String cacheKey = CACHE_KEY_PREFIX + hashQuery(
            query + "|" + safeProfile.intent() + "|" + safeProfile.targetIntent() + "|" + safeProfile.stage() + "|" + safeProfile.school()
        ) + ":" + topK;

        @SuppressWarnings("unchecked")
        List<RetrievalResult> cached = cacheGuard.getOrLoad(
            cacheKey,
            () -> doRetrieve(query, safeProfile, topK),
            RAG_CACHE_TTL
        );
        return cached != null ? cached : List.of();
    }

    /**
     * Merged retrieval: knowledge base (in-memory) + database (career_cases + crawled_articles).
     */
    private List<RetrievalResult> doRetrieve(String query, int topK) {
        return doRetrieve(query, new UserProfile(UserIntent.UNKNOWN, TargetIntent.UNKNOWN, "", "", "", "", List.of()), topK);
    }

    private List<RetrievalResult> doRetrieve(String query, UserProfile profile, int topK) {
        List<RetrievalResult> results = new ArrayList<>();
        String expandedQuery = expandQuery(query, profile);

        // 1. In-memory knowledge base chunks
        results.addAll(retrieveFromKnowledgeBase(expandedQuery, Math.max(topK, 3)));

        // 2. Career cases from database (AI-extracted structured data)
        results.addAll(retrieveFromCareerCases(expandedQuery, profile, 50));

        // 3. Crawled articles from database
        results.addAll(retrieveFromArticles(expandedQuery, profile, 50));

        // Sort by score descending, take top-K
        results.sort(Comparator.comparingDouble(RetrievalResult::score).reversed());
        return results.stream().limit(Math.max(1, topK)).toList();
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
              "知识库片段",
              truncate(s.chunk.content(), maxEvidenceChunkLength),
              "kb:" + s.chunk.source(),
              null,
              "kb",
              "medium",
              s.score
          )).toList();
    }

    /**
     * Search career_cases by keyword matching on title + background + tags.
     */
    private List<RetrievalResult> retrieveFromCareerCases(String query, UserProfile profile, int limit) {
        try {
            List<CareerCase> cases = caseRepo.findCases(null, PageRequest.of(0, Math.max(limit, 50)));
            if (cases.isEmpty()) return List.of();

            String queryLower = query.toLowerCase();
            Set<String> allowedCategories = resolveAllowedCategories(profile);
            boolean useHardCategoryFilter = shouldUseHardCategoryFilter(profile);
            return cases.stream()
                .filter(c -> !useHardCategoryFilter || allowedCategories.contains(normalizeCategory(c.getCategory())))
                .map(c -> {
                    String searchable = ((c.getTitle() != null ? c.getTitle() : "") + " " +
                        (c.getBackground() != null ? c.getBackground() : "") + " " +
                        (c.getResult() != null ? c.getResult() : "") + " " +
                        (c.getTags() != null ? c.getTags() : "")).toLowerCase();
                    double score = 0;
                    score += intentBoost(c.getCategory(), profile.intent());
                    score += targetIntentBoost(c.getCategory(), profile.targetIntent());
                    for (int i = 0; i < queryLower.length() - 1; i++) {
                        if (searchable.contains(queryLower.substring(i, i + 2))) score += 1;
                    }
                    score += schoolBonus(profile, searchable);
                    score += keywordBonus(profile, searchable);
                    score += Math.min(c.getQualityScore() / 8.0, 10.0);
                    return new Object[]{c, score};
                })
                .filter(pair -> ((double) pair[1]) > 2)
                .sorted((a, b) -> Double.compare((double) b[1], (double) a[1]))
                .limit(limit)
                .map(pair -> {
                    CareerCase c = (CareerCase) pair[0];
                    String evidence = formatCaseEvidence(c);
                    String category = normalizeCategory(c.getCategory());
                    return new RetrievalResult(
                        c.getTitle(),
                        truncate(evidence, maxEvidenceChunkLength),
                        "case:" + c.getSource(),
                        c.getUrl(),
                        category,
                        computeCaseTier(category, c.getQualityScore()),
                        (double) pair[1]
                    );
                }).toList();
        } catch (Exception e) {
            log.warn("Career case retrieval failed: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Search crawled_articles by keyword matching on title + summary.
     */
    private List<RetrievalResult> retrieveFromArticles(String query, UserProfile profile, int limit) {
        try {
            List<CrawledArticle> articles = articleRepo.findArticles(null, PageRequest.of(0, Math.max(limit, 50)));
            if (articles.isEmpty()) return List.of();

            String queryLower = query.toLowerCase();
            Set<String> allowedCategories = resolveAllowedCategories(profile);
            boolean useHardCategoryFilter = shouldUseHardCategoryFilter(profile);
            return articles.stream()
                .filter(a -> !useHardCategoryFilter || allowedCategories.contains(normalizeCategory(a.getCategory())))
                .map(a -> {
                    String searchable = ((a.getTitle() != null ? a.getTitle() : "") + " " +
                        (a.getSummary() != null ? a.getSummary() : "") + " " +
                        (a.getContentSnippet() != null ? a.getContentSnippet() : "")).toLowerCase();
                    double score = 0;
                    score += intentBoost(a.getCategory(), profile.intent());
                    score += targetIntentBoost(a.getCategory(), profile.targetIntent());
                    for (int i = 0; i < queryLower.length() - 1; i++) {
                        if (searchable.contains(queryLower.substring(i, i + 2))) score += 1;
                    }
                    score += schoolBonus(profile, searchable);
                    score += keywordBonus(profile, searchable);
                    score += Math.min(a.getQualityScore() / 10.0, 8.0);
                    score += relevanceTierBonus(a.getRelevanceTier());
                    return new Object[]{a, score};
                })
                .filter(pair -> ((double) pair[1]) > 2)
                .sorted((a, b) -> Double.compare((double) b[1], (double) a[1]))
                .limit(limit)
                .map(pair -> {
                    CrawledArticle a = (CrawledArticle) pair[0];
                    String content = a.getSummary() != null ? a.getSummary() : a.getTitle();
                    return new RetrievalResult(
                        a.getTitle(),
                        truncate(content, maxEvidenceChunkLength),
                        "article:" + a.getSourceName(),
                        a.getUrl(),
                        normalizeCategory(a.getCategory()),
                        normalizeTier(a.getRelevanceTier()),
                        (double) pair[1]
                    );
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
        return formatEvidence(results, null);
    }

    public String formatEvidence(List<RetrievalResult> results, UserProfile profile) {
        if (results.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("\n---\n# KNOWLEDGE BASE EVIDENCE\n\n");
        if (profile != null) {
            sb.append("[USER CONTEXT]\n");
            sb.append("INTENT=").append(profile.intent()).append("\n");
            sb.append("TARGET_INTENT=").append(profile.targetIntent()).append("\n");
            if (profile.stage() != null && !profile.stage().isBlank()) {
                sb.append("阶段=").append(profile.stage()).append("\n");
            }
            if (profile.school() != null && !profile.school().isBlank()) {
                sb.append("学校=").append(profile.school()).append("\n");
            }
            if (profile.gpa() != null && !profile.gpa().isBlank()) {
                sb.append("GPA/绩点=").append(profile.gpa()).append("\n");
            }
            if (profile.highlights() != null && !profile.highlights().isBlank()) {
                sb.append("背景要点=").append(profile.highlights()).append("\n");
            }
            sb.append("回答要求：");
            if (profile.intent() == UserIntent.POSTGRAD) {
                sb.append("优先给出升学/保研/考研建议，并结合相近背景案例。");
            } else if (profile.intent() == UserIntent.JOB) {
                sb.append("优先给出就业/实习建议，并结合岗位与项目经历。");
            } else {
                sb.append("在升学与就业两条路都给出可执行建议。");
            }
            sb.append("\n\n");
        }
        for (int i = 0; i < results.size(); i++) {
            RetrievalResult r = results.get(i);
            sb.append("[EVIDENCE ").append(i + 1).append("] (来源: ").append(r.source()).append(")\n");
            sb.append(r.content()).append("\n\n");
            if (r.url() != null && !r.url().isBlank()) {
                sb.append("原文链接：[").append(r.url()).append("](").append(r.url()).append(")\n\n");
            }
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

    public UserProfile inferUserProfile(List<Map<String, String>> messages, String latestQuery) {
        Map<String, String> structuredProfile = extractStructuredProfileData(messages);
        if (!structuredProfile.isEmpty()) {
            return buildProfileFromStructuredData(structuredProfile, latestQuery);
        }

        String context = buildRecentUserContext(messages, latestQuery);
        String lower = context.toLowerCase();

        int postgradHits = countHits(lower, List.of("考研", "保研", "推免", "夏令营", "读研", "研究生", "复试", "调剂"));
        int jobHits = countHits(lower, List.of("实习", "找工作", "秋招", "春招", "校招", "简历", "面试", "offer", "求职", "就业"));
        UserIntent intent = postgradHits > jobHits ? UserIntent.POSTGRAD
            : (jobHits > postgradHits ? UserIntent.JOB : UserIntent.UNKNOWN);
        TargetIntent targetIntent = inferTargetIntent(lower);

        Matcher schoolMatcher = SCHOOL_PATTERN.matcher(context);
        String school = schoolMatcher.find() ? schoolMatcher.group(1) : "";

        Matcher gpaMatcher = GPA_PATTERN.matcher(context);
        String gpa = gpaMatcher.find() ? gpaMatcher.group(2) : "";
        Matcher stageMatcher = STAGE_PATTERN.matcher(context);
        String stage = stageMatcher.find() ? stageMatcher.group(1) : "";

        List<String> highlights = new ArrayList<>();
        if (containsAny(context, List.of("实习", "intern"))) highlights.add("有实习经历");
        if (containsAny(context, List.of("论文", "科研", "项目"))) highlights.add("有科研/项目经历");
        if (containsAny(context, List.of("学生会", "社团", "志愿", "竞赛"))) highlights.add("有校内活动/竞赛经历");
        String profileHighlights = String.join("，", highlights);

        List<String> keywords = new ArrayList<>();
        if (!school.isBlank()) keywords.add(school);
        if (!stage.isBlank()) keywords.add(stage);
        if (intent == UserIntent.POSTGRAD) keywords.addAll(List.of("考研", "保研", "上岸经验"));
        if (intent == UserIntent.JOB) keywords.addAll(List.of("实习", "校招", "面试经验"));
        if (targetIntent == TargetIntent.BAOYAN) keywords.add("保研");
        if (targetIntent == TargetIntent.KAOYAN) keywords.add("考研");
        if (targetIntent == TargetIntent.JOB) keywords.add("就业");
        if (containsAny(context, List.of("计算机", "cs", "软件", "人工智能", "电子", "通信"))) {
            keywords.add("计算机");
        }

        return new UserProfile(intent, targetIntent, stage, school, gpa, profileHighlights, keywords.stream().distinct().toList());
    }

    private Map<String, String> extractStructuredProfileData(List<Map<String, String>> messages) {
        if (messages == null || messages.isEmpty()) {
            return Map.of();
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            Map<String, String> m = messages.get(i);
            if (!"user".equals(m.get("role"))) continue;
            String content = m.get("content");
            if (content == null) continue;
            String trimmed = content.trim();
            if (!trimmed.startsWith(PROFILE_DATA_PREFIX)) continue;

            String payload = trimmed.substring(PROFILE_DATA_PREFIX.length()).trim();
            if (payload.isBlank()) return Map.of();

            Map<String, String> result = new HashMap<>();
            for (String segment : payload.split("\\|")) {
                int idx = segment.indexOf('=');
                if (idx <= 0 || idx >= segment.length() - 1) continue;
                String key = segment.substring(0, idx).trim().toLowerCase();
                String value = segment.substring(idx + 1).trim();
                if (!key.isBlank() && !value.isBlank()) {
                    result.put(key, value);
                }
            }
            return result;
        }
        return Map.of();
    }

    private UserProfile buildProfileFromStructuredData(Map<String, String> data, String latestQuery) {
        String intentRaw = data.getOrDefault("intent", "");
        TargetIntent targetIntent = mapTargetIntent(intentRaw);
        UserIntent intent = mapUserIntent(targetIntent, intentRaw);

        String school = data.getOrDefault("school", "");
        String gpa = data.getOrDefault("gpa", "");
        String stage = data.getOrDefault("stage", "");

        List<String> highlights = new ArrayList<>();
        appendHighlight(highlights, data.get("internship"), "实习经历");
        appendHighlight(highlights, data.get("research"), "科研/项目");
        appendHighlight(highlights, data.get("competition"), "竞赛/活动");
        String profileHighlights = String.join("；", highlights);

        List<String> keywords = new ArrayList<>();
        if (!school.isBlank()) keywords.add(school);
        if (!stage.isBlank()) keywords.add(stage);
        if (!gpa.isBlank()) keywords.add("GPA " + gpa);
        if (targetIntent == TargetIntent.BAOYAN) keywords.addAll(List.of("保研", "推免", "夏令营"));
        if (targetIntent == TargetIntent.KAOYAN) keywords.addAll(List.of("考研", "复试", "备考"));
        if (targetIntent == TargetIntent.JOB) keywords.addAll(List.of("就业", "实习", "校招"));
        if (latestQuery != null && !latestQuery.isBlank()) {
            keywords.addAll(List.of(latestQuery.split("\\s+")));
        }
        return new UserProfile(intent, targetIntent, stage, school, gpa, profileHighlights, keywords.stream().filter(s -> s != null && !s.isBlank()).distinct().toList());
    }

    private TargetIntent inferTargetIntent(String lowerText) {
        if (containsAny(lowerText, List.of("保研", "推免", "夏令营"))) return TargetIntent.BAOYAN;
        if (containsAny(lowerText, List.of("考研", "复试", "调剂"))) return TargetIntent.KAOYAN;
        if (containsAny(lowerText, List.of("就业", "实习", "秋招", "校招", "面试", "求职"))) return TargetIntent.JOB;
        return TargetIntent.UNKNOWN;
    }

    private TargetIntent mapTargetIntent(String intentRaw) {
        String normalized = intentRaw == null ? "" : intentRaw.trim().toLowerCase();
        if (normalized.contains("保研") || normalized.contains("推免")) return TargetIntent.BAOYAN;
        if (normalized.contains("考研")) return TargetIntent.KAOYAN;
        if (normalized.contains("就业") || normalized.contains("实习") || normalized.contains("工作")) return TargetIntent.JOB;
        return TargetIntent.UNKNOWN;
    }

    private UserIntent mapUserIntent(TargetIntent targetIntent, String rawIntent) {
        if (targetIntent == TargetIntent.BAOYAN || targetIntent == TargetIntent.KAOYAN) {
            return UserIntent.POSTGRAD;
        }
        if (targetIntent == TargetIntent.JOB) {
            return UserIntent.JOB;
        }
        String normalized = rawIntent == null ? "" : rawIntent.trim();
        if (normalized.contains("还没想好")) return UserIntent.UNKNOWN;
        return UserIntent.UNKNOWN;
    }

    private void appendHighlight(List<String> highlights, String value, String label) {
        if (value != null && !value.isBlank()) {
            highlights.add(label + "：" + value);
        }
    }

    private String buildRecentUserContext(List<Map<String, String>> messages, String latestQuery) {
        StringBuilder sb = new StringBuilder();
        if (messages != null && !messages.isEmpty()) {
            int count = 0;
            for (int i = messages.size() - 1; i >= 0 && count < 6; i--) {
                Map<String, String> m = messages.get(i);
                if (!"user".equals(m.get("role"))) continue;
                String content = m.get("content");
                if (content == null || content.isBlank()) continue;
                sb.append(content).append("\n");
                count++;
            }
        }
        if (latestQuery != null && !latestQuery.isBlank()) {
            sb.append(latestQuery);
        }
        return sb.toString();
    }

    private String expandQuery(String query, UserProfile profile) {
        StringBuilder sb = new StringBuilder(query == null ? "" : query);
        if (profile != null) {
            if (profile.targetIntent() == TargetIntent.BAOYAN) sb.append(" 保研 推免");
            if (profile.targetIntent() == TargetIntent.KAOYAN) sb.append(" 考研 复试 调剂");
            if (profile.targetIntent() == TargetIntent.JOB) sb.append(" 实习 校招 面试");
            if (profile.stage() != null && !profile.stage().isBlank() && !sb.toString().contains(profile.stage())) {
                sb.append(" ").append(profile.stage());
            }
        }
        if (profile != null && profile.keywords() != null) {
            for (String kw : profile.keywords()) {
                if (kw != null && !kw.isBlank() && !sb.toString().contains(kw)) {
                    sb.append(" ").append(kw);
                }
            }
        }
        return sb.toString().trim();
    }

    private double intentBoost(String category, UserIntent intent) {
        String c = normalizeCategory(category);
        if (intent == UserIntent.POSTGRAD && (c.contains("kaoyan") || c.contains("baoyan"))) return 3.0;
        if (intent == UserIntent.JOB && c.contains("job")) return 3.0;
        return 0.0;
    }

    private double targetIntentBoost(String category, TargetIntent targetIntent) {
        String c = normalizeCategory(category);
        if (targetIntent == TargetIntent.KAOYAN && c.contains("kaoyan")) return 4.0;
        if (targetIntent == TargetIntent.BAOYAN && c.contains("baoyan")) return 4.0;
        if (targetIntent == TargetIntent.JOB && c.contains("job")) return 4.0;
        return 0.0;
    }

    private boolean shouldUseHardCategoryFilter(UserProfile profile) {
        return profile != null && (profile.intent() != UserIntent.UNKNOWN || profile.targetIntent() != TargetIntent.UNKNOWN);
    }

    private Set<String> resolveAllowedCategories(UserProfile profile) {
        if (profile == null) return Set.of();
        if (profile.targetIntent() == TargetIntent.BAOYAN) return Set.of("baoyan");
        if (profile.targetIntent() == TargetIntent.KAOYAN) return Set.of("kaoyan");
        if (profile.targetIntent() == TargetIntent.JOB) return Set.of("job");
        if (profile.intent() == UserIntent.POSTGRAD) return Set.of("baoyan", "kaoyan");
        if (profile.intent() == UserIntent.JOB) return Set.of("job");
        return Set.of();
    }

    private String normalizeCategory(String category) {
        return category == null ? "" : category.trim().toLowerCase();
    }

    private String normalizeTier(String tier) {
        if (tier == null || tier.isBlank()) return "low";
        return tier.trim().toLowerCase();
    }

    private String computeCaseTier(String category, double qualityScore) {
        String c = normalizeCategory(category);
        if ((c.equals("baoyan") || c.equals("kaoyan") || c.equals("job")) && qualityScore >= 20) return "high";
        if (qualityScore >= 10) return "medium";
        return "low";
    }

    private double relevanceTierBonus(String tier) {
        String t = normalizeTier(tier);
        if ("high".equals(t)) return 4.0;
        if ("medium".equals(t)) return 1.5;
        return 0.0;
    }

    private double schoolBonus(UserProfile profile, String searchable) {
        if (profile == null || profile.school() == null || profile.school().isBlank()) {
            return 0.0;
        }
        return searchable.contains(profile.school().toLowerCase()) ? 5.0 : 0.0;
    }

    private double keywordBonus(UserProfile profile, String searchable) {
        if (profile == null || profile.keywords() == null || profile.keywords().isEmpty()) {
            return 0.0;
        }
        double bonus = 0.0;
        for (String kw : profile.keywords()) {
            if (kw == null || kw.isBlank()) continue;
            if (searchable.contains(kw.toLowerCase())) {
                bonus += 1.0;
            }
            if (bonus >= 5.0) break;
        }
        return bonus;
    }

    public List<Map<String, Object>> buildSimilarCases(List<RetrievalResult> results, int limit) {
        if (results == null || results.isEmpty()) return List.of();
        return results.stream()
            .filter(r -> r.url() != null && !r.url().isBlank())
            .filter(r -> r.source() != null && (r.source().startsWith("case:") || r.source().startsWith("article:")))
            .limit(Math.max(1, limit))
            .map(r -> {
                String snippet = r.content() == null ? "" : r.content().replace("\n", " ");
                if (snippet.length() > 120) {
                    snippet = snippet.substring(0, 120) + "...";
                }
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("title", (r.title() == null || r.title().isBlank()) ? "相似案例" : r.title());
                m.put("url", r.url());
                m.put("snippet", snippet);
                m.put("source", r.source());
                m.put("category", r.category());
                return m;
            })
            .toList();
    }

    private int countHits(String text, List<String> words) {
        int score = 0;
        for (String w : words) {
            if (text.contains(w.toLowerCase())) score++;
        }
        return score;
    }

    private boolean containsAny(String text, List<String> words) {
        String lower = text.toLowerCase();
        for (String w : words) {
            if (lower.contains(w.toLowerCase())) return true;
        }
        return false;
    }
}
