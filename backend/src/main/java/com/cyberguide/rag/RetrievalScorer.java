package com.cyberguide.rag;

import com.cyberguide.model.CrawledArticle;
import com.cyberguide.rag.UserProfileInferrer.TargetIntent;
import com.cyberguide.rag.UserProfileInferrer.UserIntent;
import com.cyberguide.rag.UserProfileInferrer.UserProfile;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Scoring strategies for RAG retrieval ranking.
 */
@Component
public class RetrievalScorer {

    private final UniversityResolver universityResolver;

    public RetrievalScorer(UniversityResolver universityResolver) {
        this.universityResolver = universityResolver;
    }

    public double intentBoost(String category, UserIntent intent) {
        String c = normalizeCategory(category);
        if (intent == UserIntent.POSTGRAD && (c.contains("kaoyan") || c.contains("baoyan") || c.contains("study_abroad"))) return 3.0;
        if (intent == UserIntent.JOB && c.contains("job")) return 3.0;
        return 0.0;
    }

    public double targetIntentBoost(String category, TargetIntent targetIntent) {
        String c = normalizeCategory(category);
        if (targetIntent == TargetIntent.KAOYAN && c.contains("kaoyan")) return 4.0;
        if (targetIntent == TargetIntent.BAOYAN && c.contains("baoyan")) return 4.0;
        if (targetIntent == TargetIntent.STUDY_ABROAD && c.contains("study_abroad")) return 4.0;
        if (targetIntent == TargetIntent.JOB && c.contains("job")) return 4.0;
        return 0.0;
    }

    public boolean shouldUseHardCategoryFilter(UserProfile profile) {
        return profile != null && (profile.intent() != UserIntent.UNKNOWN || profile.targetIntent() != TargetIntent.UNKNOWN);
    }

    public Set<String> resolveAllowedCategories(UserProfile profile) {
        if (profile == null) return Set.of();
        if (profile.targetIntent() == TargetIntent.BAOYAN) return Set.of("baoyan");
        if (profile.targetIntent() == TargetIntent.KAOYAN) return Set.of("kaoyan");
        if (profile.targetIntent() == TargetIntent.STUDY_ABROAD) return Set.of("study_abroad");
        if (profile.targetIntent() == TargetIntent.JOB) return Set.of("job");
        if (profile.intent() == UserIntent.POSTGRAD) return Set.of("baoyan", "kaoyan", "study_abroad");
        if (profile.intent() == UserIntent.JOB) return Set.of("job");
        return Set.of();
    }

    public String normalizeCategory(String category) {
        return category == null ? "" : category.trim().toLowerCase();
    }

    public String normalizeTier(String tier) {
        if (tier == null || tier.isBlank()) return "low";
        return tier.trim().toLowerCase();
    }

    public String computeCaseTier(String category, double qualityScore) {
        String c = normalizeCategory(category);
        if ((c.equals("baoyan") || c.equals("kaoyan") || c.equals("job")) && qualityScore >= 20) return "high";
        if (qualityScore >= 10) return "medium";
        return "low";
    }

    public double relevanceTierBonus(String tier) {
        String t = normalizeTier(tier);
        if ("high".equals(t)) return 4.0;
        if ("medium".equals(t)) return 1.5;
        return 0.0;
    }

    public double schoolBonus(UserProfile profile, String searchable) {
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

    public double keywordBonus(UserProfile profile, String searchable) {
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

    public double profileSimilarityBonus(UserProfile profile, CrawledArticle article) {
        if (profile == null || article == null) return 0.0;
        double bonus = 0.0;
        String articleTier = article.getExtractedSchoolTier();
        if (articleTier == null || articleTier.isBlank() || "未知".equals(articleTier)) {
            String fuzzy = universityResolver.resolveFuzzySchoolTier(article.getExtractedSchool());
            if (fuzzy != null) articleTier = fuzzy;
        }
        bonus += tierSimilarityBonus(profile.schoolTier(), articleTier);
        bonus += gpaSimilarityBonus(profile.gpa(), article.getExtractedGpa());
        bonus += rankPctSimilarityBonus(profile, article);
        bonus += outcomeMatchBonus(profile.targetIntent(), article.getExtractedOutcome());
        bonus += schoolRankProximityBonus(profile.school(), article.getExtractedSchool());
        bonus += experienceSimilarityBonus(profile.highlights(), article);
        return bonus;
    }

    // ─── Internal helpers ───

    private double tierSimilarityBonus(String userTier, String articleTier) {
        if (articleTier == null || articleTier.isBlank() || "未知".equals(articleTier)) {
            return 0.0;
        }
        if (userTier == null || userTier.isBlank()) return 0.0;
        int d = Math.abs(universityResolver.tierLevel(userTier) - universityResolver.tierLevel(articleTier));
        if (d == 0) return 6.0;
        if (d == 1) return 3.0;
        if (d == 2) return 1.0;
        return 0.0;
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

    private double schoolRankProximityBonus(String userSchool, String articleSchool) {
        if (userSchool == null || userSchool.isBlank() || articleSchool == null || articleSchool.isBlank()) return 0.0;
        UniversityResolver.SchoolInfo userInfo = universityResolver.resolveSchool(userSchool);
        UniversityResolver.SchoolInfo articleInfo = universityResolver.resolveSchool(articleSchool);
        if (userInfo == null || articleInfo == null) return 0.0;

        Integer uRank = userInfo.rank() != null ? userInfo.rank() : userInfo.qsRank();
        Integer aRank = articleInfo.rank() != null ? articleInfo.rank() : articleInfo.qsRank();
        if (uRank == null || aRank == null) return 0.0;

        int diff = Math.abs(uRank - aRank);
        if (diff <= 10) return 8.0;
        if (diff <= 30) return 5.0;
        if (diff <= 60) return 2.0;
        return 0.0;
    }

    private double experienceSimilarityBonus(String userHighlights, CrawledArticle article) {
        if (userHighlights == null || userHighlights.isBlank()) return 0.0;
        double bonus = 0.0;
        String h = userHighlights.toLowerCase();
        if (h.contains("实习") && Boolean.TRUE.equals(article.getExtractedHasInternship())) bonus += 3.0;
        if ((h.contains("科研") || h.contains("论文") || h.contains("项目")) && Boolean.TRUE.equals(article.getExtractedHasResearch())) bonus += 3.0;
        if (h.contains("竞赛") && Boolean.TRUE.equals(article.getExtractedHasCompetition())) bonus += 3.0;
        return bonus;
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
}
