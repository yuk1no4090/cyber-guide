package com.cyberguide.service;

import com.cyberguide.model.Feedback;
import com.cyberguide.repository.FeedbackRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class FeedbackService {

    private final FeedbackRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();

    public FeedbackService(FeedbackRepository repo) {
        this.repo = repo;
    }

    public record FeedbackRequest(
        List<Map<String, String>> messages,
        int rating,
        String feedback,
        boolean hadCrisis,
        String mode
    ) {}

    public record QualityResult(double score, String tier) {}

    public QualityResult submit(FeedbackRequest request) {
        // Redact messages
        List<Map<String, String>> redacted = request.messages().stream()
            .filter(m -> "user".equals(m.get("role")) || "assistant".equals(m.get("role")))
            .map(m -> Map.of("role", m.get("role"), "content", RedactService.redact(m.get("content"))))
            .toList();

        int turns = redacted.size() / 2;
        double avgLen = request.messages().stream()
            .filter(m -> "user".equals(m.get("role")))
            .mapToInt(m -> m.get("content").length())
            .average().orElse(0);

        QualityResult quality = calculateQuality(request.rating(), turns, avgLen);

        Feedback entity = new Feedback();
        entity.setRating(request.rating());
        entity.setFeedbackRedacted(request.feedback() != null ? RedactService.redact(request.feedback()) : null);
        entity.setQualityScore(quality.score());
        entity.setQualityTier(quality.tier());
        entity.setConversationTurns(turns);
        entity.setHadCrisis(request.hadCrisis());
        entity.setMode(request.mode());
        try {
            entity.setRedactedMessages(mapper.writeValueAsString(redacted));
        } catch (JsonProcessingException e) {
            entity.setRedactedMessages("[]");
        }

        repo.save(entity);
        return quality;
    }

    private QualityResult calculateQuality(int rating, int turns, double avgUserMsgLen) {
        double ratingScore = (rating / 10.0) * 100;
        double depthScore = Math.min(turns / 8.0, 1) * 100;
        double engagementScore = Math.min(avgUserMsgLen / 50.0, 1) * 100;
        double score = ratingScore * 0.5 + depthScore * 0.3 + engagementScore * 0.2;
        score = Math.round(score * 10) / 10.0;

        String tier;
        if (score >= 75) tier = "gold";
        else if (score >= 55) tier = "silver";
        else if (score >= 35) tier = "bronze";
        else tier = "needs_fix";

        return new QualityResult(score, tier);
    }
}
