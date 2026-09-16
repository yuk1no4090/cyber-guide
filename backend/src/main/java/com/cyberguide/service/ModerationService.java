package com.cyberguide.service;

import java.util.ArrayList;
import java.util.List;

/**
 * Crisis keyword detection — mirrors moderation.ts logic.
 */
public final class ModerationService {

    private ModerationService() {}

    private static final List<String> CRISIS_KEYWORDS = List.of(
        "想死", "不想活", "自杀", "自残", "割腕", "跳楼", "跳河",
        "结束生命", "离开这个世界", "活着没意思", "不如死了",
        "杀了", "想杀", "弄死", "打死", "伤害他",
        "不想活了", "寻死", "去死", "轻生", "了结"
    );

    /*
     * There was a FALSE_POSITIVES set here (累死, 死 as hyperbole, and so on) with a
     * branch that filtered it out of a match. The branch could never fire: it tested
     * for a keyword "去死" that was absent from CRISIS_KEYWORDS, and more
     * fundamentally no phrase in that set contains any crisis keyword, so a sentence
     * made only of hyperbole never produces a match to suppress in the first place.
     * That is the real protection, and it needs no list.
     *
     * If a short keyword is ever added here -- a bare "死", say -- hyperbole starts
     * matching and suppression becomes necessary again. Add it back deliberately at
     * that point, comparing match positions rather than whole strings.
     */

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

        List<String> found = new ArrayList<>();
        for (String kw : CRISIS_KEYWORDS) {
            if (lower.contains(kw)) found.add(kw);
        }

        // Erring toward a match is deliberate on this path: an unnecessary offer of
        // help costs someone a moment, a missed signal costs far more.
        return new ModerationResult(!found.isEmpty(), found);
    }
}
