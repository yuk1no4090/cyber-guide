package com.cyberguide.service;

import com.cyberguide.event.FeedbackReceivedEvent;
import com.cyberguide.model.Feedback;
import com.cyberguide.repository.FeedbackRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class FeedbackService {

    private static final Logger log = LoggerFactory.getLogger(FeedbackService.class);
    private final FeedbackRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ApplicationEventPublisher eventPublisher;

    public FeedbackService(FeedbackRepository repo, ApplicationEventPublisher eventPublisher) {
        this.repo = repo;
        this.eventPublisher = eventPublisher;
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
        Feedback entity = new Feedback();
        try {
            entity.setRedactedMessages(mapper.writeValueAsString(request.messages()));
        } catch (JsonProcessingException e) {
            entity.setRedactedMessages("[]");
        }
        entity.setRating(request.rating());
        entity.setFeedbackRedacted(request.feedback());
        entity.setHadCrisis(request.hadCrisis());
        entity.setMode(request.mode());
        repo.save(entity);

        QualityResult quality = computeQuality(request);

        // Publish event asynchronously
        eventPublisher.publishEvent(new FeedbackReceivedEvent(this, request.rating(), request.mode(), request.hadCrisis()));

        return quality;
    }

    private QualityResult computeQuality(FeedbackRequest request) {
        double score = 0;
        score += request.rating() * 15;
        if (request.feedback() != null && request.feedback().length() > 10) score += 10;
        if (request.messages() != null) score += Math.min(request.messages().size() * 2, 15);

        String tier;
        if (score >= 75) tier = "gold";
        else if (score >= 55) tier = "silver";
        else if (score >= 35) tier = "bronze";
        else tier = "needs_fix";

        return new QualityResult(score, tier);
    }
}
