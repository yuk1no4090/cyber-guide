package com.cyberguide.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "feedback")
public class Feedback {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "session_id", length = 128)
    private String sessionId;

    @Column(nullable = false)
    private int rating;

    @Column(name = "feedback_redacted", columnDefinition = "TEXT")
    private String feedbackRedacted;

    @Column(name = "quality_score")
    private double qualityScore;

    @Column(name = "quality_tier", length = 16)
    private String qualityTier;

    @Column(name = "conversation_turns")
    private int conversationTurns;

    @Column(name = "had_crisis")
    private boolean hadCrisis;

    @Column(length = 32)
    private String mode;

    @Column(name = "redacted_messages", columnDefinition = "TEXT")
    private String redactedMessages;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() { createdAt = Instant.now(); }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public int getRating() { return rating; }
    public void setRating(int rating) { this.rating = rating; }
    public String getFeedbackRedacted() { return feedbackRedacted; }
    public void setFeedbackRedacted(String feedbackRedacted) { this.feedbackRedacted = feedbackRedacted; }
    public double getQualityScore() { return qualityScore; }
    public void setQualityScore(double qualityScore) { this.qualityScore = qualityScore; }
    public String getQualityTier() { return qualityTier; }
    public void setQualityTier(String qualityTier) { this.qualityTier = qualityTier; }
    public int getConversationTurns() { return conversationTurns; }
    public void setConversationTurns(int conversationTurns) { this.conversationTurns = conversationTurns; }
    public boolean isHadCrisis() { return hadCrisis; }
    public void setHadCrisis(boolean hadCrisis) { this.hadCrisis = hadCrisis; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getRedactedMessages() { return redactedMessages; }
    public void setRedactedMessages(String redactedMessages) { this.redactedMessages = redactedMessages; }
    public Instant getCreatedAt() { return createdAt; }
}
