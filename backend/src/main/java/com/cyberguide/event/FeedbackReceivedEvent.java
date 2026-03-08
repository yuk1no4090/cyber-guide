package com.cyberguide.event;

import org.springframework.context.ApplicationEvent;

/**
 * Published when user submits feedback.
 */
public class FeedbackReceivedEvent extends ApplicationEvent {

    private final int rating;
    private final String mode;
    private final boolean hadCrisis;

    public FeedbackReceivedEvent(Object source, int rating, String mode, boolean hadCrisis) {
        super(source);
        this.rating = rating;
        this.mode = mode;
        this.hadCrisis = hadCrisis;
    }

    public int getRating() { return rating; }
    public String getMode() { return mode; }
    public boolean isHadCrisis() { return hadCrisis; }
}
