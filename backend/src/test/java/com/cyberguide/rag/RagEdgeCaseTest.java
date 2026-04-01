package com.cyberguide.rag;

import com.cyberguide.infrastructure.cache.CacheGuard;
import com.cyberguide.repository.CareerCaseRepository;
import com.cyberguide.repository.CrawledArticleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RagEdgeCaseTest {

    @Mock private CacheGuard cacheGuard;
    @Mock private CareerCaseRepository caseRepo;
    @Mock private CrawledArticleRepository articleRepo;

    private RagService ragService;

    @BeforeEach
    void setUp() {
        ragService = new RagService(cacheGuard, caseRepo, articleRepo);
        // Skip knowledge base loading (no files in test env)
    }

    // ── Profile inference edge cases ──

    @Test
    void inferProfileFromEmptyMessages() {
        var profile = ragService.inferUserProfile(List.of(), "你好");
        assertNotNull(profile);
        assertEquals(RagService.UserIntent.UNKNOWN, profile.intent());
    }

    @Test
    void inferProfileFromNullMessages() {
        var profile = ragService.inferUserProfile(null, "你好");
        assertNotNull(profile);
    }

    @Test
    void inferProfileDetectsPostgradIntent() {
        var messages = List.of(
            Map.of("role", "user", "content", "我想保研，夏令营怎么准备"),
            Map.of("role", "user", "content", "推免需要什么条件")
        );
        var profile = ragService.inferUserProfile(messages, "保研经验");
        assertEquals(RagService.UserIntent.POSTGRAD, profile.intent());
        assertEquals(RagService.TargetIntent.BAOYAN, profile.targetIntent());
    }

    @Test
    void inferProfileDetectsJobIntent() {
        var messages = List.of(
            Map.of("role", "user", "content", "秋招面试怎么准备"),
            Map.of("role", "user", "content", "简历投递有什么技巧")
        );
        var profile = ragService.inferUserProfile(messages, "找实习");
        assertEquals(RagService.UserIntent.JOB, profile.intent());
    }

    @Test
    void inferProfileExtractsSchoolAndGpa() {
        var messages = List.of(
            Map.of("role", "user", "content", "我是北京大学计算机专业大三的，GPA: 3.8")
        );
        var profile = ragService.inferUserProfile(messages, "保研");
        assertTrue(profile.school().contains("北京大学"));
        assertEquals("3.8", profile.gpa());
        assertEquals("大三", profile.stage());
    }

    @Test
    void inferProfileHandlesStructuredProfileData() {
        var messages = List.of(
            Map.of("role", "user", "content",
                "[PROFILE_DATA]intent=保研|school=清华大学|gpa=3.9|stage=大三")
        );
        var profile = ragService.inferUserProfile(messages, "");
        assertEquals("清华大学", profile.school());
        assertEquals("3.9", profile.gpa());
        assertEquals(RagService.TargetIntent.BAOYAN, profile.targetIntent());
    }

    @Test
    void inferProfileStructuredDataWithMalformedSegments() {
        var messages = List.of(
            Map.of("role", "user", "content",
                "[PROFILE_DATA]=badkey|good_key=value|=|noeq")
        );
        var profile = ragService.inferUserProfile(messages, "");
        assertNotNull(profile);
    }

    @Test
    void inferProfileStructuredDataBlankPayload() {
        var messages = List.of(
            Map.of("role", "user", "content", "[PROFILE_DATA]")
        );
        var profile = ragService.inferUserProfile(messages, "你好");
        assertNotNull(profile);
        assertEquals(RagService.UserIntent.UNKNOWN, profile.intent());
    }

    // ── Retrieval edge cases ──

    @Test
    void retrieveReturnsEmptyWhenNothingMatches() {
        // Cache guard bypass: just pass through to doRetrieve
        when(cacheGuard.getOrLoad(anyString(), any(), any()))
            .thenAnswer(inv -> {
                var loader = inv.getArgument(1, java.util.function.Supplier.class);
                return loader.get();
            });
        when(caseRepo.findCases(any(), any())).thenReturn(List.of());
        when(articleRepo.findArticles(any(), any())).thenReturn(List.of());

        var results = ragService.retrieve("不存在的关键词xyz", 3);
        assertNotNull(results);
        assertTrue(results.isEmpty());
    }

    // ── Format evidence edge cases ──

    @Test
    void formatEvidenceWithEmptyResults() {
        String formatted = ragService.formatEvidence(List.of());
        assertEquals("", formatted);
    }

    @Test
    void formatEvidenceWithNullProfile() {
        var results = List.of(
            new RagService.RetrievalResult("Title", "Content", "kb:test", null, "kb", "medium", 5.0, null, null, null, null, null, null)
        );
        String formatted = ragService.formatEvidence(results, null);
        assertTrue(formatted.contains("Content"));
    }

    @Test
    void formatEvidenceIncludesUserContext() {
        var profile = new RagService.UserProfile(
            RagService.UserIntent.POSTGRAD,
            RagService.TargetIntent.BAOYAN,
            "大三",
            "清华大学",
            "C9",
            "3.9",
            "前5%",
            "有科研经历",
            List.of("保研", "清华大学")
        );
        var results = List.of(
            new RagService.RetrievalResult("Case", "Body", "case:src", "http://url", "baoyan", "high", 10.0, null, null, null, null, null, null)
        );
        String formatted = ragService.formatEvidence(results, profile);
        assertTrue(formatted.contains("INTENT=POSTGRAD"));
        assertTrue(formatted.contains("TARGET_INTENT=BAOYAN"));
        assertTrue(formatted.contains("清华大学"));
        assertTrue(formatted.contains("3.9"));
        assertTrue(formatted.contains("升学"));
    }

    // ── buildSimilarCases edge cases ──

    @Test
    void buildSimilarCasesSkipsNullUrls() {
        var results = List.of(
            new RagService.RetrievalResult("t", "c", "kb:test", null, "kb", "medium", 5.0, null, null, null, null, null, null),
            new RagService.RetrievalResult("t2", "c2", "case:x", "http://url", "job", "high", 8.0, null, null, null, null, null, null)
        );
        var cases = ragService.buildSimilarCases(results, 5);
        assertEquals(1, cases.size());
        assertEquals("http://url", cases.get(0).get("url"));
    }

    @Test
    void buildSimilarCasesWithEmptyList() {
        assertTrue(ragService.buildSimilarCases(List.of(), 3).isEmpty());
        assertTrue(ragService.buildSimilarCases(null, 3).isEmpty());
    }

    @Test
    void buildSimilarCasesTruncatesLongSnippet() {
        String longContent = "a".repeat(200);
        var results = List.of(
            new RagService.RetrievalResult("title", longContent, "case:x", "http://url", "job", "high", 8.0, null, null, null, null, null, null)
        );
        var cases = ragService.buildSimilarCases(results, 3);
        String snippet = (String) cases.get(0).get("snippet");
        assertTrue(snippet.length() <= 123); // 120 + "..."
    }
}
