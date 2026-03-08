package com.cyberguide.domain.feedback;

/**
 * Value object representing the quality assessment of a feedback submission.
 */
public record QualityScore(double score, String tier) {

    public static QualityScore compute(int rating, String feedbackText, int messageCount) {
        double score = 0;
        score += rating * 15;
        if (feedbackText != null && feedbackText.length() > 10) score += 10;
        score += Math.min(messageCount * 2, 15);

        String tier;
        if (score >= 75) tier = "gold";
        else if (score >= 55) tier = "silver";
        else if (score >= 35) tier = "bronze";
        else tier = "needs_fix";

        return new QualityScore(score, tier);
    }
}
