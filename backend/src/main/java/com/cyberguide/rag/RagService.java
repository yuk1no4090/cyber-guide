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
    private static final Pattern RANK_PATTERN = Pattern.compile("(前\\s*[0-9]{1,2}(?:\\.[0-9])?%?|rank\\s*[:：]?\\s*[0-9]{1,2}(?:\\.[0-9])?%?)");
    private static final Pattern STAGE_PATTERN = Pattern.compile("(大一|大二|大三|大四|研一|研二|已工作)");

    @Value("${rag.knowledge-base-path:../knowledge_base/skills}")
    private String knowledgeBasePath;

    @Value("${rag.max-evidence-chunk-length:480}")
    private int maxEvidenceChunkLength;

    @Value("${rag.default-top-k:2}")
    private int defaultTopK;

    @Value("${rag.university-data-path:../knowledge_base/china_universities.json}")
    private String universityDataPath;

    private final List<KnowledgeChunk> chunks = new ArrayList<>();
    private final Map<String, SchoolInfo> schoolInfoByName = new LinkedHashMap<>();
    private final Map<String, SchoolInfo> schoolInfoByAlias = new LinkedHashMap<>();
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
        double score,
        String school,
        String schoolTier,
        String gpa,
        String rankPct,
        String outcome,
        String destSchool
    ) implements java.io.Serializable {}
    public record RetrievalMetadata(
        String queryHash,
        int totalCandidates,
        List<RetrievalResult> topKResults
    ) implements java.io.Serializable {}
    public record RetrievalBundle(
        List<RetrievalResult> results,
        RetrievalMetadata metadata
    ) implements java.io.Serializable {}
    public enum UserIntent { POSTGRAD, JOB, UNKNOWN }
    public enum TargetIntent { KAOYAN, BAOYAN, STUDY_ABROAD, JOB, UNKNOWN }
    public enum SchoolTier { C9, T985, T211, SYL, YIBEN, ERBEN, UNKNOWN }
    public record SchoolInfo(
        String name,
        String tier,
        Integer rank,
        Integer qsRank,
        String region,
        List<String> aliases
    ) implements java.io.Serializable {}
    public record UserProfile(
        UserIntent intent,
        TargetIntent targetIntent,
        String stage,
        String school,
        String schoolTier,
        String gpa,
        String rankPct,
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

        loadUniversityData();
    }

    @SuppressWarnings("unchecked")
    private void loadUniversityData() {
        Path path = Paths.get(universityDataPath);
        if (!Files.isRegularFile(path)) {
            log.warn("University data file not found: {}", path.toAbsolutePath());
            return;
        }
        try {
            String json = Files.readString(path);
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> data = mapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<>() {});
            schoolInfoByName.clear();
            schoolInfoByAlias.clear();
            loadSchoolObjectList(data, "domestic");
            loadSchoolObjectList(data, "international");

            // Backward compatibility with old tier-array format.
            loadTierList(data, "c9", "C9");
            loadTierList(data, "985", "985");
            loadTierList(data, "211_non985", "211");
            loadTierList(data, "syl_discipline_new", "双一流学科");
            loadTierList(data, "known_strong_shuangfei", "双非强校");
        } catch (Exception e) {
            log.error("Failed to load university tiers", e);
        }
        log.info("Loaded {} school mappings (name={}, alias={})",
            schoolInfoByName.size() + schoolInfoByAlias.size(),
            schoolInfoByName.size(),
            schoolInfoByAlias.size());
    }

    @SuppressWarnings("unchecked")
    private void loadTierList(Map<String, Object> data, String key, String tier) {
        Object val = data.get(key);
        if (val instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof String name) {
                    SchoolInfo info = new SchoolInfo(name, tier, null, null, "CN", List.of());
                    registerSchoolInfo(info);
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void loadSchoolObjectList(Map<String, Object> data, String key) {
        Object val = data.get(key);
        if (!(val instanceof List<?> list)) return;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> row)) continue;
            String name = asString(row.get("name"));
            if (name == null || name.isBlank()) continue;
            String tier = asString(row.get("tier"));
            Integer rank = asInt(row.get("rank"));
            Integer qsRank = asInt(row.get("qs_rank"));
            String region = Optional.ofNullable(asString(row.get("region"))).orElse("CN");
            List<String> aliases = asStringList(row.get("aliases"));
            SchoolInfo info = new SchoolInfo(name, tier, rank, qsRank, region, aliases);
            registerSchoolInfo(info);
        }
    }

    private void registerSchoolInfo(SchoolInfo info) {
        if (info == null || info.name() == null || info.name().isBlank()) return;
        String nameKey = normalizeSchoolKey(info.name());
        schoolInfoByName.putIfAbsent(nameKey, info);
        if (info.aliases() != null) {
            for (String alias : info.aliases()) {
                if (alias == null || alias.isBlank()) continue;
                schoolInfoByAlias.putIfAbsent(normalizeSchoolKey(alias), info);
            }
        }
    }

    private String normalizeSchoolKey(String raw) {
        return raw == null ? "" : raw.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private String asString(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> asStringList(Object v) {
        if (!(v instanceof List<?> list)) return List.of();
        List<String> result = new ArrayList<>();
        for (Object item : list) {
            if (item != null) {
                String s = String.valueOf(item).trim();
                if (!s.isBlank()) result.add(s);
            }
        }
        return result;
    }

    public String resolveSchoolTier(String school) {
        SchoolInfo info = resolveSchool(school);
        return info == null || info.tier() == null || info.tier().isBlank() ? "普通院校" : info.tier();
    }

    public SchoolInfo resolveSchool(String school) {
        if (school == null || school.isBlank()) return null;
        String key = normalizeSchoolKey(school);
        SchoolInfo exact = schoolInfoByName.get(key);
        if (exact != null) return exact;
        SchoolInfo alias = schoolInfoByAlias.get(key);
        if (alias != null) return alias;

        for (Map.Entry<String, SchoolInfo> e : schoolInfoByName.entrySet()) {
            if (key.contains(e.getKey()) || e.getKey().contains(key)) {
                return e.getValue();
            }
        }
        for (Map.Entry<String, SchoolInfo> e : schoolInfoByAlias.entrySet()) {
            if (key.contains(e.getKey()) || e.getKey().contains(key)) {
                return e.getValue();
            }
        }
        return null;
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
            : new UserProfile(UserIntent.UNKNOWN, TargetIntent.UNKNOWN, "", "", "未知", "", "", "", List.of());
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

    public RetrievalBundle retrieveWithMetadata(String query, UserProfile profile, int topK) {
        long start = System.currentTimeMillis();
        UserProfile safeProfile = profile != null
            ? profile
            : new UserProfile(UserIntent.UNKNOWN, TargetIntent.UNKNOWN, "", "", "未知", "", "", "", List.of());
        RetrievalComputation computation = doRetrieveDetailed(query, safeProfile, topK);
        List<RetrievalResult> topResults = computation.topResults();
        RetrievalMetadata metadata = new RetrievalMetadata(
            hashQuery(query + "|" + safeProfile.intent() + "|" + safeProfile.targetIntent() + "|" + safeProfile.stage() + "|" + safeProfile.school()),
            computation.totalCandidates(),
            topResults
        );

        Map<String, Long> sourceDistribution = topResults.stream()
            .collect(java.util.stream.Collectors.groupingBy(
                r -> normalizeSourceType(r.source()),
                java.util.LinkedHashMap::new,
                java.util.stream.Collectors.counting()
            ));
        double topScore = topResults.isEmpty() ? 0.0 : topResults.get(0).score();
        log.info(
            "rag.retrieve queryHash={} intent={} target={} resultCount={} totalCandidates={} topScore={} sourceDistribution={} latencyMs={}",
            metadata.queryHash(),
            safeProfile.intent(),
            safeProfile.targetIntent(),
            topResults.size(),
            metadata.totalCandidates(),
            String.format(Locale.ROOT, "%.2f", topScore),
            sourceDistribution,
            System.currentTimeMillis() - start
        );
        return new RetrievalBundle(topResults, metadata);
    }

    /**
     * Merged retrieval: knowledge base (in-memory) + database (career_cases + crawled_articles).
     */
    private List<RetrievalResult> doRetrieve(String query, int topK) {
        return doRetrieve(query, new UserProfile(UserIntent.UNKNOWN, TargetIntent.UNKNOWN, "", "", "未知", "", "", "", List.of()), topK);
    }

    private List<RetrievalResult> doRetrieve(String query, UserProfile profile, int topK) {
        return doRetrieveDetailed(query, profile, topK).topResults();
    }

    private RetrievalComputation doRetrieveDetailed(String query, UserProfile profile, int topK) {
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
        List<RetrievalResult> topResults = results.stream().limit(Math.max(1, topK)).toList();
        return new RetrievalComputation(topResults, results.size());
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
              s.score,
              null,
              null,
              null,
              null,
              null,
              null
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
                        (double) pair[1],
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
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
                    score += profileSimilarityBonus(profile, a);
                    score += Math.min(a.getQualityScore() / 10.0, 8.0);
                    score += relevanceTierBonus(a.getRelevanceTier());
                    return new Object[]{a, score};
                })
                .filter(pair -> ((double) pair[1]) > 2)
                .sorted((a, b) -> Double.compare((double) b[1], (double) a[1]))
                .limit(limit)
                .map(pair -> {
                    CrawledArticle a = (CrawledArticle) pair[0];
                    String content = a.getContentSnippet() != null && !a.getContentSnippet().isBlank()
                        ? a.getContentSnippet()
                        : (a.getSummary() != null ? a.getSummary() : a.getTitle());
                    return new RetrievalResult(
                        a.getTitle(),
                        truncate(content, maxEvidenceChunkLength),
                        "article:" + a.getSourceName(),
                        a.getUrl(),
                        normalizeCategory(a.getCategory()),
                        normalizeTier(a.getRelevanceTier()),
                        (double) pair[1],
                        a.getExtractedSchool(),
                        a.getExtractedSchoolTier(),
                        a.getExtractedGpa(),
                        a.getExtractedRankPct(),
                        a.getExtractedOutcome(),
                        a.getExtractedDestSchool()
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
                sb.append("学校=").append(profile.school());
                if (profile.schoolTier() != null && !profile.schoolTier().isBlank() && !"未知".equals(profile.schoolTier())) {
                    sb.append("（").append(profile.schoolTier()).append("）");
                }
                sb.append("\n");
            }
            if (profile.gpa() != null && !profile.gpa().isBlank()) {
                sb.append("GPA/绩点=").append(profile.gpa()).append("\n");
            }
            if (profile.rankPct() != null && !profile.rankPct().isBlank()) {
                sb.append("排名信息=").append(profile.rankPct()).append("\n");
            }
            if (profile.highlights() != null && !profile.highlights().isBlank()) {
                sb.append("背景要点=").append(profile.highlights()).append("\n");
            }
            sb.append("回答要求：\n");
            sb.append("1. **\u5fc5\u987b\u5f15\u7528\u5177\u4f53\u6848\u4f8b**\uff1a\u4e0d\u8981\u8bf4\u201c\u4e00\u822c\u6765\u8bf4\u201d\u3001\u201c\u901a\u5e38\u60c5\u51b5\u4e0b\u201d\u8fd9\u79cd\u5957\u8bdd\u3002\u5bf9\u4e8e\u4e0b\u9762\u7684\u6bcf\u6761 EVIDENCE\uff0c\u8bf7\u76f4\u63a5\u544a\u8bc9\u7528\u6237\u201c\u6709\u4e00\u4f4d\u548c\u4f60\u80cc\u666f\u76f8\u4f3c\u7684\u540c\u5b66\uff0cta \u7684\u60c5\u51b5\u662f\u2026\u201d\u5e76\u9644\u4e0a\u539f\u6587\u94fe\u63a5\uff08Markdown \u683c\u5f0f\uff09\u3002\n");
            sb.append("2. **基于学校层次匹配**：用户的学校层次是「").append(
                profile.schoolTier() != null && !"未知".equals(profile.schoolTier()) ? profile.schoolTier() : "待确认"
            ).append("」，请优先引用同层次或相近层次学校的案例。\n");
            if (profile.intent() == UserIntent.POSTGRAD) {
                if (profile.targetIntent() == TargetIntent.STUDY_ABROAD) {
                    sb.append("3. 用户倾向出国留学，请结合相近背景的留学申请案例（GPA、学校层次、申请方向），告诉用户同类同学申请了哪些学校、拿到了什么结果。\n");
                } else {
                    sb.append("3. 用户倾向升学，请结合保研/考研案例，告诉用户同类背景的同学推免或考研去了哪些学校，并给出具体的准备建议。\n");
                }
            } else if (profile.intent() == UserIntent.JOB) {
                sb.append("3. 用户倾向就业，请结合就业/实习案例，告诉用户同类背景的同学去了哪些公司/岗位，薪资水平和面试要点。\n");
            } else {
                sb.append("3. 用户还没想好方向，请分别给出升学和就业两条路的具体案例和数据支撑。\n");
            }
            sb.append("4. 每条建议都必须附上至少一个原文链接，让用户可以自己点击查看完整经验帖。\n\n");
        }
        for (int i = 0; i < results.size(); i++) {
            RetrievalResult r = results.get(i);
            sb.append("[EVIDENCE ").append(i + 1).append("] (来源: ").append(r.source()).append(")\n");
            if (r.school() != null || r.schoolTier() != null || r.gpa() != null || r.rankPct() != null || r.outcome() != null || r.destSchool() != null) {
                sb.append("结构化信息：");
                if (r.school() != null && !r.school().isBlank()) sb.append("学校=").append(r.school()).append("；");
                if (r.schoolTier() != null && !r.schoolTier().isBlank()) sb.append("层次=").append(r.schoolTier()).append("；");
                if (r.gpa() != null && !r.gpa().isBlank()) sb.append("GPA=").append(r.gpa()).append("；");
                if (r.rankPct() != null && !r.rankPct().isBlank()) sb.append("排名=").append(r.rankPct()).append("；");
                if (r.outcome() != null && !r.outcome().isBlank()) sb.append("去向类型=").append(r.outcome()).append("；");
                if (r.destSchool() != null && !r.destSchool().isBlank()) sb.append("去向学校=").append(r.destSchool()).append("；");
                sb.append("\n");
            }
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

    private String normalizeSourceType(String source) {
        if (source == null || source.isBlank()) {
            return "unknown";
        }
        int idx = source.indexOf(':');
        if (idx <= 0) {
            return source.trim().toLowerCase(Locale.ROOT);
        }
        return source.substring(0, idx).trim().toLowerCase(Locale.ROOT);
    }

    public UserProfile inferUserProfile(List<Map<String, String>> messages, String latestQuery) {
        Map<String, String> structuredProfile = extractStructuredProfileData(messages);
        if (!structuredProfile.isEmpty()) {
            return buildProfileFromStructuredData(structuredProfile, latestQuery);
        }

        String context = buildRecentUserContext(messages, latestQuery);
        String lower = context.toLowerCase();

        int postgradHits = countHits(lower, List.of("考研", "保研", "推免", "夏令营", "读研", "研究生", "复试", "调剂",
                "留学", "出国", "申请", "选校", "gre", "toefl", "ielts", "雅思", "托福"));
        int jobHits = countHits(lower, List.of("实习", "找工作", "秋招", "春招", "校招", "简历", "面试", "offer", "求职", "就业"));
        UserIntent intent = postgradHits > jobHits ? UserIntent.POSTGRAD
            : (jobHits > postgradHits ? UserIntent.JOB : UserIntent.UNKNOWN);
        TargetIntent targetIntent = inferTargetIntent(lower);

        Matcher schoolMatcher = SCHOOL_PATTERN.matcher(context);
        String school = schoolMatcher.find() ? schoolMatcher.group(1) : "";

        Matcher gpaMatcher = GPA_PATTERN.matcher(context);
        String gpa = gpaMatcher.find() ? gpaMatcher.group(2) : "";
        Matcher rankMatcher = RANK_PATTERN.matcher(context);
        String rankPct = rankMatcher.find() ? rankMatcher.group(1).replace("rank", "").trim() : "";
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
        if (targetIntent == TargetIntent.STUDY_ABROAD) keywords.addAll(List.of("留学", "申请", "选校"));
        if (targetIntent == TargetIntent.JOB) keywords.add("就业");
        if (containsAny(context, List.of("计算机", "cs", "软件", "人工智能", "电子", "通信"))) {
            keywords.add("计算机");
        }

        String tier = resolveSchoolTier(school);
        return new UserProfile(intent, targetIntent, stage, school, tier, gpa, rankPct, profileHighlights, keywords.stream().distinct().toList());
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
        String rankPct = data.getOrDefault("rank", data.getOrDefault("rank_pct", ""));
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
        if (targetIntent == TargetIntent.STUDY_ABROAD) keywords.addAll(List.of("留学", "申请", "选校", "出国"));
        if (targetIntent == TargetIntent.JOB) keywords.addAll(List.of("就业", "实习", "校招"));
        if (latestQuery != null && !latestQuery.isBlank()) {
            keywords.addAll(List.of(latestQuery.split("\\s+")));
        }
        String tier = resolveSchoolTier(school);
        return new UserProfile(intent, targetIntent, stage, school, tier, gpa, rankPct, profileHighlights, keywords.stream().filter(s -> s != null && !s.isBlank()).distinct().toList());
    }

    private TargetIntent inferTargetIntent(String lowerText) {
        if (containsAny(lowerText, List.of("保研", "推免", "夏令营"))) return TargetIntent.BAOYAN;
        if (containsAny(lowerText, List.of("考研", "复试", "调剂"))) return TargetIntent.KAOYAN;
        if (containsAny(lowerText, List.of("留学", "出国", "申请", "选校", "gre", "toefl", "ielts", "雅思", "托福"))) return TargetIntent.STUDY_ABROAD;
        if (containsAny(lowerText, List.of("就业", "实习", "秋招", "校招", "面试", "求职"))) return TargetIntent.JOB;
        return TargetIntent.UNKNOWN;
    }

    private TargetIntent mapTargetIntent(String intentRaw) {
        String normalized = intentRaw == null ? "" : intentRaw.trim().toLowerCase();
        if (normalized.contains("保研") || normalized.contains("推免")) return TargetIntent.BAOYAN;
        if (normalized.contains("考研")) return TargetIntent.KAOYAN;
        if (normalized.contains("留学") || normalized.contains("出国")) return TargetIntent.STUDY_ABROAD;
        if (normalized.contains("就业") || normalized.contains("实习") || normalized.contains("工作")) return TargetIntent.JOB;
        return TargetIntent.UNKNOWN;
    }

    private UserIntent mapUserIntent(TargetIntent targetIntent, String rawIntent) {
        if (targetIntent == TargetIntent.BAOYAN || targetIntent == TargetIntent.KAOYAN
                || targetIntent == TargetIntent.STUDY_ABROAD) {
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
        if (intent == UserIntent.POSTGRAD && (c.contains("kaoyan") || c.contains("baoyan") || c.contains("study_abroad"))) return 3.0;
        if (intent == UserIntent.JOB && c.contains("job")) return 3.0;
        return 0.0;
    }

    private double targetIntentBoost(String category, TargetIntent targetIntent) {
        String c = normalizeCategory(category);
        if (targetIntent == TargetIntent.KAOYAN && c.contains("kaoyan")) return 4.0;
        if (targetIntent == TargetIntent.BAOYAN && c.contains("baoyan")) return 4.0;
        if (targetIntent == TargetIntent.STUDY_ABROAD && c.contains("study_abroad")) return 4.0;
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
        if (profile.targetIntent() == TargetIntent.STUDY_ABROAD) return Set.of("study_abroad");
        if (profile.targetIntent() == TargetIntent.JOB) return Set.of("job");
        if (profile.intent() == UserIntent.POSTGRAD) return Set.of("baoyan", "kaoyan", "study_abroad");
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
        if (profile == null) return 0.0;
        double bonus = 0.0;
        if (profile.school() != null && !profile.school().isBlank()
                && searchable.contains(profile.school().toLowerCase())) {
            bonus += 5.0;
        }
        if (profile.schoolTier() != null && !"未知".equals(profile.schoolTier()) && !"普通院校".equals(profile.schoolTier())) {
            String tier = profile.schoolTier().toLowerCase();
            if (searchable.contains(tier)) bonus += 3.0;
            if ("985".equals(tier) || "c9".equals(tier)) {
                if (searchable.contains("985") || searchable.contains("c9")) bonus += 2.0;
            } else if ("211".equals(tier)) {
                if (searchable.contains("211")) bonus += 2.0;
            } else if (tier.contains("双非") || tier.contains("双一流学科")) {
                if (searchable.contains("双非") || searchable.contains("非985")) bonus += 2.0;
            }
        }
        return bonus;
    }

    private double profileSimilarityBonus(UserProfile profile, CrawledArticle article) {
        if (profile == null || article == null) return 0.0;
        double bonus = 0.0;
        bonus += tierSimilarityBonus(profile.schoolTier(), article.getExtractedSchoolTier());
        bonus += gpaSimilarityBonus(profile.gpa(), article.getExtractedGpa());
        bonus += rankPctSimilarityBonus(profile, article);
        bonus += outcomeMatchBonus(profile.targetIntent(), article.getExtractedOutcome());
        return bonus;
    }

    private double tierSimilarityBonus(String userTier, String articleTier) {
        if (userTier == null || userTier.isBlank() || articleTier == null || articleTier.isBlank()) return 0.0;
        int d = Math.abs(tierLevel(userTier) - tierLevel(articleTier));
        if (d == 0) return 6.0;
        if (d == 1) return 3.0;
        if (d == 2) return 1.0;
        return 0.0;
    }

    private int tierLevel(String tier) {
        String t = tier == null ? "" : tier.toLowerCase(Locale.ROOT);
        if (t.contains("c9")) return 0;
        if (t.contains("985")) return 1;
        if (t.contains("211")) return 2;
        if (t.contains("双一流")) return 3;
        if (t.contains("双非") || t.contains("一本")) return 4;
        if (t.contains("二本")) return 5;
        return 6;
    }

    private double gpaSimilarityBonus(String userGpaRaw, String articleGpaRaw) {
        Double ug = parseGpa(userGpaRaw);
        Double ag = parseGpa(articleGpaRaw);
        if (ug == null || ag == null) return 0.0;
        double diff = Math.abs(ug - ag);
        if (diff <= 0.3) return 8.0;
        if (diff <= 0.6) return 4.0;
        if (diff <= 1.0) return 1.0;
        return 0.0;
    }

    private double rankPctSimilarityBonus(UserProfile profile, CrawledArticle article) {
        Double userRank = parseRankPct(profile == null ? null : profile.rankPct());
        Double articleRank = parseRankPct(article == null ? null : article.getExtractedRankPct());
        if (userRank == null || articleRank == null) return 0.0;
        double diff = Math.abs(userRank - articleRank);
        if (diff <= 3.0) return 5.0;
        if (diff <= 8.0) return 2.0;
        return 0.0;
    }

    private double outcomeMatchBonus(TargetIntent targetIntent, String outcomeRaw) {
        if (targetIntent == null || targetIntent == TargetIntent.UNKNOWN || outcomeRaw == null || outcomeRaw.isBlank()) return 0.0;
        String o = outcomeRaw.toLowerCase(Locale.ROOT);
        if (targetIntent == TargetIntent.BAOYAN && (o.contains("保研") || o.contains("推免"))) return 4.0;
        if (targetIntent == TargetIntent.KAOYAN && o.contains("考研")) return 4.0;
        if (targetIntent == TargetIntent.STUDY_ABROAD && (o.contains("留学") || o.contains("出国"))) return 4.0;
        if (targetIntent == TargetIntent.JOB && (o.contains("就业") || o.contains("工作") || o.contains("实习"))) return 4.0;
        return 0.0;
    }

    private Double parseGpa(String raw) {
        if (raw == null || raw.isBlank()) return null;
        Matcher m = Pattern.compile("([0-4](?:\\.[0-9]{1,2})?)").matcher(raw);
        if (!m.find()) return null;
        try {
            return Double.parseDouble(m.group(1));
        } catch (Exception ignored) {
            return null;
        }
    }

    private Double parseRankPct(String raw) {
        if (raw == null || raw.isBlank()) return null;
        Matcher m = Pattern.compile("([0-9]{1,2}(?:\\.[0-9])?)\\s*%").matcher(raw);
        if (m.find()) {
            try {
                return Double.parseDouble(m.group(1));
            } catch (Exception ignored) {
                return null;
            }
        }
        Matcher pctPhrase = Pattern.compile("前\\s*([0-9]{1,2}(?:\\.[0-9])?)").matcher(raw);
        if (pctPhrase.find()) {
            try {
                return Double.parseDouble(pctPhrase.group(1));
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
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

    private record RetrievalComputation(List<RetrievalResult> topResults, int totalCandidates) {}
}
