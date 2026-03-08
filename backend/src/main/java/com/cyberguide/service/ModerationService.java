package com.cyberguide.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Crisis keyword detection — mirrors moderation.ts logic.
 */
public final class ModerationService {

    private ModerationService() {}

    private static final List<String> CRISIS_KEYWORDS = List.of(
        "想死", "不想活", "自杀", "自残", "割腕", "跳楼", "跳河",
        "结束生命", "离开这个世界", "活着没意思", "不如死了",
        "杀了", "想杀", "弄死", "打死", "伤害他",
        "不想活了", "寻死", "轻生", "了结"
    );

    private static final Set<String> FALSE_POSITIVES = Set.of(
        "热死", "累死", "笑死", "冷死", "饿死", "困死", "急死",
        "气死", "烦死", "丑死", "吓死", "渴死", "忙死", "无聊死",
        "尴尬死", "羡慕死", "开心死", "难吃死", "好看死"
    );

    public static final String CRISIS_RESPONSE = """
        我听到了你说的话，这让我非常担心你的安全。

        你现在的感受一定很痛苦，我想让你知道，你并不孤单。

        请现在就联系专业的帮助：
        全国心理援助热线: 400-161-9995
        北京心理危机研究与干预中心: 010-82951332
        生命热线: 400-821-1215

        如果你有立即的危险，请拨打 120 或前往最近的医院急诊。""";

    public record ModerationResult(boolean isCrisis, List<String> keywordsFound) {}

    public static ModerationResult check(String text) {
        String lower = text.toLowerCase();
        boolean hasFalsePositive = FALSE_POSITIVES.stream().anyMatch(lower::contains);

        List<String> found = new ArrayList<>();
        for (String kw : CRISIS_KEYWORDS) {
            if (lower.contains(kw)) found.add(kw);
        }

        if (found.isEmpty()) return new ModerationResult(false, List.of());

        if (hasFalsePositive) {
            List<String> real = found.stream()
                .filter(kw -> !kw.equals("去死") || FALSE_POSITIVES.stream().noneMatch(lower::contains))
                .toList();
            return new ModerationResult(!real.isEmpty(), real);
        }

        return new ModerationResult(true, found);
    }
}
