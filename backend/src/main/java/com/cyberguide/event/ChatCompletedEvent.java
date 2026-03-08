package com.cyberguide.event;

import org.springframework.context.ApplicationEvent;

/**
 * Published after a chat interaction completes.
 */
public class ChatCompletedEvent extends ApplicationEvent {

    private final String sessionId;
    private final String mode;
    private final long elapsedMs;
    private final boolean crisis;

    public ChatCompletedEvent(Object source, String sessionId, String mode, long elapsedMs, boolean crisis) {
        super(source);
        this.sessionId = sessionId;
        this.mode = mode;
        this.elapsedMs = elapsedMs;
        this.crisis = crisis;
    }

    public String getSessionId() { return sessionId; }
    public String getMode() { return mode; }
    public long getElapsedMs() { return elapsedMs; }
    public boolean isCrisis() { return crisis; }
}
