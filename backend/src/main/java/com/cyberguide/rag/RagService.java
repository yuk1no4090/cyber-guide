package com.cyberguide.rag;

import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.model.CareerCase;
import com.cyberguide.model.CrawledArticle;
import com.cyberguide.rag.UserProfileInferrer.TargetIntent;
import com.cyberguide.rag.UserProfileInferrer.UserIntent;
import com.cyberguide.rag.UserProfileInferrer.UserProfile;
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
    private final UniversityResolver universityResolver;
    private final UserProfileInferrer profileInferrer;
    private final RetrievalScorer scorer;

    public RagService(CacheGuard cacheGuard,
                      CareerCaseRepository caseRepo,
                      CrawledArticleRepository articleRepo,
                      UniversityResolver universityResolver,
                      UserProfileInferrer profileInferrer,
                      RetrievalScorer scorer) {
        this.cacheGuard = cacheGuard;
        this.caseRepo = caseRepo;
        this.articleRepo = articleRepo;
        this.universityResolver = universityResolver;
        this.profileInferrer = profileInferrer;
        this.scorer = scorer;
    }

    // ─── Records ───

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

    // ─── Knowledge base loading ───

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

    // ─── Public retrieval API ───

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

    public List<RetrievalResult> retrieve(String query, List<Map<String, String>> messages) {
        UserProfile profile = profileInferrer.inferUserProfile(messages, query);
        return retrieve(query, profile, defaultTopK);
    }

    public List<RetrievalResult> retrieve(String query, UserProfile profile, int topK) {
        UserProfile safeProfile = safeProfile(profile);
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
        UserProfile safeProfile = safeProfile(profile);
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

    // ─── Delegated public methods (kept for API compatibility) ───

    public UserProfile inferUserProfile(List<Map<String, String>> messages, String latestQuery) {
        return profileInferrer.inferUserProfile(messages, latestQuery);
    }

    public String resolveSchoolTier(String school) {
        return universityResolver.resolveSchoolTier(school);
    }

    public UniversityResolver.SchoolInfo resolveSchool(String school) {
        return universityResolver.resolveSchool(school);
    }

    public String resolveFuzzySchoolTier(String schoolDescription) {
        return universityResolver.resolveFuzzySchoolTier(schoolDescription);
    }

    // ─── Evidence formatting ───

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
            sb.append("4. 如果引用的 EVIDENCE 有“原文链接”，必须原样附上；如果没有原文链接，明确说“该条为内部知识库依据”，严禁编造链接。\n\n");
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
                m.put("school", r.school());
                m.put("schoolTier", r.schoolTier());
                m.put("gpa", r.gpa());
                m.put("rankPct", r.rankPct());
                m.put("outcome", r.outcome());
                m.put("destSchool", r.destSchool());
                return m;
            })
            .toList();
    }

    // ─── Private retrieval logic ───

    private List<RetrievalResult> doRetrieve(String query, int topK) {
        return doRetrieve(query, safeProfile(null), topK);
    }

    private List<RetrievalResult> doRetrieve(String query, UserProfile profile, int topK) {
        return doRetrieveDetailed(query, profile, topK).topResults();
    }

    private RetrievalComputation doRetrieveDetailed(String query, UserProfile profile, int topK) {
        List<RetrievalResult> results = new ArrayList<>();
        String expandedQuery = expandQuery(query, profile);

        // 1. In-memory knowledge base chunks
        results.addAll(retrieveFromKnowledgeBase(expandedQuery, Math.max(topK, 3)));

        // 2. Career cases from database
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
              null, null, null, null, null, null
        )).toList();
    }

    private List<RetrievalResult> retrieveFromCareerCases(String query, UserProfile profile, int limit) {
        try {
            List<CareerCase> cases = caseRepo.findCases(null, PageRequest.of(0, Math.max(limit, 50)));
            if (cases.isEmpty()) return List.of();

            String queryLower = query.toLowerCase();
            Set<String> allowedCategories = scorer.resolveAllowedCategories(profile);
            boolean useHardCategoryFilter = scorer.shouldUseHardCategoryFilter(profile);
            return cases.stream()
                .filter(c -> !useHardCategoryFilter || allowedCategories.contains(scorer.normalizeCategory(c.getCategory())))
                .map(c -> {
                    String searchable = ((c.getTitle() != null ? c.getTitle() : "") + " " +
                        (c.getBackground() != null ? c.getBackground() : "") + " " +
                        (c.getResult() != null ? c.getResult() : "") + " " +
                        (c.getTags() != null ? c.getTags() : "")).toLowerCase();
                    double score = 0;
                    score += scorer.intentBoost(c.getCategory(), profile.intent());
                    score += scorer.targetIntentBoost(c.getCategory(), profile.targetIntent());
                    for (int i = 0; i < queryLower.length() - 1; i++) {
                        if (searchable.contains(queryLower.substring(i, i + 2))) score += 1;
                    }
                    score += scorer.schoolBonus(profile, searchable);
                    score += scorer.keywordBonus(profile, searchable);
                    score += Math.min(c.getQualityScore() / 8.0, 10.0);
                    return new Object[]{c, score};
                })
                .filter(pair -> ((double) pair[1]) > 2)
                .sorted((a, b) -> Double.compare((double) b[1], (double) a[1]))
                .limit(limit)
                .map(pair -> {
                    CareerCase c = (CareerCase) pair[0];
                    String evidence = formatCaseEvidence(c);
                    String category = scorer.normalizeCategory(c.getCategory());
                    return new RetrievalResult(
                        c.getTitle(),
                        truncate(evidence, maxEvidenceChunkLength),
                        "case:" + c.getSource(),
                        c.getUrl(),
                        category,
                        scorer.computeCaseTier(category, c.getQualityScore()),
                        (double) pair[1],
                        null, null, null, null, null, null
                    );
                }).toList();
        } catch (Exception e) {
            log.warn("Career case retrieval failed: {}", e.getMessage());
            return List.of();
        }
    }

    private List<RetrievalResult> retrieveFromArticles(String query, UserProfile profile, int limit) {
        try {
            List<CrawledArticle> articles = articleRepo.findArticles(null, PageRequest.of(0, Math.max(limit, 50)));
            if (articles.isEmpty()) return List.of();

            String queryLower = query.toLowerCase();
            Set<String> allowedCategories = scorer.resolveAllowedCategories(profile);
            boolean useHardCategoryFilter = scorer.shouldUseHardCategoryFilter(profile);
            return articles.stream()
                .filter(a -> !useHardCategoryFilter || allowedCategories.contains(scorer.normalizeCategory(a.getCategory())))
                .map(a -> {
                    String searchable = ((a.getTitle() != null ? a.getTitle() : "") + " " +
                        (a.getSummary() != null ? a.getSummary() : "") + " " +
                        (a.getContentSnippet() != null ? a.getContentSnippet() : "")).toLowerCase();
                    double score = 0;
                    score += scorer.intentBoost(a.getCategory(), profile.intent());
                    score += scorer.targetIntentBoost(a.getCategory(), profile.targetIntent());
                    for (int i = 0; i < queryLower.length() - 1; i++) {
                        if (searchable.contains(queryLower.substring(i, i + 2))) score += 1;
                    }
                    score += scorer.schoolBonus(profile, searchable);
                    score += scorer.keywordBonus(profile, searchable);
                    score += scorer.profileSimilarityBonus(profile, a);
                    score += Math.min(a.getQualityScore() / 10.0, 8.0);
                    score += scorer.relevanceTierBonus(a.getRelevanceTier());
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
                        scorer.normalizeCategory(a.getCategory()),
                        scorer.normalizeTier(a.getRelevanceTier()),
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

    // ─── Helpers ───

    private UserProfile safeProfile(UserProfile profile) {
        return profile != null
            ? profile
            : new UserProfile(UserIntent.UNKNOWN, TargetIntent.UNKNOWN, "", "", "未知", "", "", "", List.of());
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

    private record RetrievalComputation(List<RetrievalResult> topResults, int totalCandidates) {}
}
