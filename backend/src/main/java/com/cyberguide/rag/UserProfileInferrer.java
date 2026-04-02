package com.cyberguide.rag;

import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Infers user profile (intent, background, school tier) from conversation messages.
 */
@Component
public class UserProfileInferrer {

    private static final String PROFILE_DATA_PREFIX = "[PROFILE_DATA]";
    private static final Pattern SCHOOL_PATTERN = Pattern.compile("([\\u4e00-\\u9fa5A-Za-z]{2,20}(大学|学院))");
    private static final Pattern GPA_PATTERN = Pattern.compile("(GPA|gpa|绩点)\\s*[:：]?\\s*([0-9](?:\\.[0-9]{1,2})?)");
    private static final Pattern RANK_PATTERN = Pattern.compile("(前\\s*[0-9]{1,2}(?:\\.[0-9])?%?|rank\\s*[:：]?\\s*[0-9]{1,2}(?:\\.[0-9])?%?)");
    private static final Pattern STAGE_PATTERN = Pattern.compile("(大一|大二|大三|大四|研一|研二|已工作)");

    private final UniversityResolver universityResolver;

    public UserProfileInferrer(UniversityResolver universityResolver) {
        this.universityResolver = universityResolver;
    }

    public enum UserIntent { POSTGRAD, JOB, UNKNOWN }
    public enum TargetIntent { KAOYAN, BAOYAN, STUDY_ABROAD, JOB, UNKNOWN }

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
    ) implements java.io.Serializable {}

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

        String tier = universityResolver.resolveSchoolTier(school);
        if ("普通院校".equals(tier)) {
            tier = inferTierFromContext(lower);
        }
        return new UserProfile(intent, targetIntent, stage, school, tier, gpa, rankPct, profileHighlights, keywords.stream().distinct().toList());
    }

    // ─── Internal helpers ───

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
        String tier = universityResolver.resolveSchoolTier(school);
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
        return UserIntent.UNKNOWN;
    }

    private String inferTierFromContext(String lowerContext) {
        if (containsAny(lowerContext, List.of("c9"))) return "C9";
        if (containsAny(lowerContext, List.of("985"))) return "985";
        if (containsAny(lowerContext, List.of("211"))) return "211";
        if (containsAny(lowerContext, List.of("双一流"))) return "双一流";
        if (containsAny(lowerContext, List.of("一本"))) return "普通一本";
        if (containsAny(lowerContext, List.of("双非", "二本", "四非", "非985", "非211"))) return "双非";
        return "普通院校";
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
