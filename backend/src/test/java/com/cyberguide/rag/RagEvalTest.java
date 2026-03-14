package com.cyberguide.rag;

import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.model.CareerCase;
import com.cyberguide.model.CrawledArticle;
import com.cyberguide.repository.CareerCaseRepository;
import com.cyberguide.repository.CrawledArticleRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RagEvalTest {

    private RagService ragService;

    record EvalCase(String query, String expectedCategory, List<String> expectedKeywords, boolean shouldContainUrl) {}

    @BeforeEach
    void setUp() {
        CacheGuard cacheGuard = mock(CacheGuard.class);
        CareerCaseRepository caseRepository = mock(CareerCaseRepository.class);
        CrawledArticleRepository articleRepository = mock(CrawledArticleRepository.class);

        when(cacheGuard.getOrLoad(anyString(), any(), any())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Supplier<Object> loader = (Supplier<Object>) invocation.getArgument(1);
            return loader.get();
        });

        when(caseRepository.findCases(any(), any(Pageable.class))).thenReturn(mockCareerCases());
        when(articleRepository.findArticles(any(), any(Pageable.class))).thenReturn(mockArticles());

        ragService = new RagService(cacheGuard, caseRepository, articleRepository);
    }

    @Test
    void ragEvalSet_shouldMeetQualityThresholds() throws Exception {
        List<EvalCase> evalCases = loadEvalCases();
        assertTrue(evalCases.size() >= 20, "评估集样本数应至少为20");

        int categoryHit = 0;
        int urlHit = 0;

        for (EvalCase evalCase : evalCases) {
            var profile = ragService.inferUserProfile(
                List.of(Map.of("role", "user", "content", evalCase.query())),
                evalCase.query()
            );
            List<RagService.RetrievalResult> results = ragService.retrieve(evalCase.query(), profile, 5);
            assertFalse(results.isEmpty(), "每条 query 至少应返回1条结果: " + evalCase.query());

            boolean hasExpectedCategory = results.stream().anyMatch(r -> evalCase.expectedCategory().equals(r.category()));
            boolean hasUrl = results.stream().anyMatch(r -> r.url() != null && !r.url().isBlank());
            boolean hasHighTier = results.stream().anyMatch(r -> "high".equals(r.relevanceTier()));
            if (hasExpectedCategory) categoryHit++;
            if (!evalCase.shouldContainUrl() || hasUrl) urlHit++;

            assertTrue(hasHighTier, "TopN 中至少要有 1 条 high tier: " + evalCase.query());
        }

        double categoryHitRate = categoryHit * 1.0 / evalCases.size();
        double urlHitRate = urlHit * 1.0 / evalCases.size();

        assertTrue(categoryHitRate >= 0.70, "category 命中率应 >= 70%，当前: " + categoryHitRate);
        assertTrue(urlHitRate >= 0.80, "URL 可用率应 >= 80%，当前: " + urlHitRate);
    }

    private List<EvalCase> loadEvalCases() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        try (InputStream is = getClass().getClassLoader().getResourceAsStream("rag-eval-set.json")) {
            assertNotNull(is, "rag-eval-set.json 不存在");
            List<Map<String, Object>> raw = mapper.readValue(is, new TypeReference<>() {});
            List<EvalCase> result = new ArrayList<>();
            for (Map<String, Object> row : raw) {
                String query = String.valueOf(row.getOrDefault("query", ""));
                String expectedCategory = String.valueOf(row.getOrDefault("expectedCategory", ""));
                @SuppressWarnings("unchecked")
                List<String> expectedKeywords = (List<String>) row.getOrDefault("expectedKeywords", List.of());
                boolean shouldContainUrl = Boolean.parseBoolean(String.valueOf(row.getOrDefault("shouldContainUrl", "true")));
                result.add(new EvalCase(query, expectedCategory, expectedKeywords, shouldContainUrl));
            }
            return result;
        }
    }

    private List<CareerCase> mockCareerCases() {
        List<CareerCase> cases = new ArrayList<>();
        cases.add(caseItem("baoyan", "211计算机保研到985经验", "211计算机，大三，夏令营", "保研上岸", "保研,推免,夏令营", 32, "https://example.com/baoyan-1"));
        cases.add(caseItem("baoyan", "双非逆袭保研经验", "双非软件工程，绩点3.8", "推免录取", "保研,双非", 26, "https://example.com/baoyan-2"));
        cases.add(caseItem("kaoyan", "408备考上岸复盘", "大四跨考计算机，准备408", "成功上岸", "考研,408,复试", 30, "https://example.com/kaoyan-1"));
        cases.add(caseItem("kaoyan", "二本通信考研调剂经验", "二本通信，调剂", "调剂成功", "考研,调剂,通信", 24, "https://example.com/kaoyan-2"));
        cases.add(caseItem("job", "大三后端实习拿offer", "211计算机，Java后端项目", "拿到实习offer", "实习,秋招,面试", 31, "https://example.com/job-1"));
        cases.add(caseItem("job", "研二算法实习准备路线", "研二，算法岗", "面试通过", "算法,实习,面试", 22, "https://example.com/job-2"));
        return cases;
    }

    private List<CrawledArticle> mockArticles() {
        List<CrawledArticle> list = new ArrayList<>();
        list.add(articleItem("baoyan", "保研夏令营面试复盘", "夏令营面试准备与导师沟通", 28, "high", "https://example.com/a-baoyan-1"));
        list.add(articleItem("kaoyan", "考研复试高频问题整理", "复试题型与准备清单", 25, "high", "https://example.com/a-kaoyan-1"));
        list.add(articleItem("job", "秋招后端简历优化指南", "后端实习与校招简历修改建议", 27, "high", "https://example.com/a-job-1"));
        list.add(articleItem("job", "校招面试八股文速查", "Java后端高频面试", 14, "medium", "https://example.com/a-job-2"));
        return list;
    }

    private CareerCase caseItem(String category, String title, String background, String result, String tags, double score, String url) {
        CareerCase c = new CareerCase();
        c.setCategory(category);
        c.setTitle(title);
        c.setBackground(background);
        c.setResult(result);
        c.setTags(tags);
        c.setQualityScore(score);
        c.setSource("mock");
        c.setUrl(url);
        return c;
    }

    private CrawledArticle articleItem(String category, String title, String summary, double score, String tier, String url) {
        CrawledArticle a = new CrawledArticle();
        a.setCategory(category);
        a.setTitle(title);
        a.setSummary(summary);
        a.setContentSnippet(summary);
        a.setQualityScore(score);
        a.setRelevanceTier(tier);
        a.setSourceName("mock");
        a.setUrl(url);
        return a;
    }
}
