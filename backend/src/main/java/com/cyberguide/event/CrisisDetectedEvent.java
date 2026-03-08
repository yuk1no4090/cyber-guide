package com.cyberguide.event;

import org.springframework.context.ApplicationEvent;

import java.util.List;

/**
 * Published when crisis keywords are detected in user input.
 */
public class CrisisDetectedEvent extends ApplicationEvent {

    private final String sessionId;
    private final List<String> keywords;

    public CrisisDetectedEvent(Object source, String sessionId, List<String> keywords) {
        super(source);
        this.sessionId = sessionId;
        this.keywords = keywords;
    }

    public String getSessionId() { return sessionId; }
    public List<String> getKeywords() { return keywords; }
}
