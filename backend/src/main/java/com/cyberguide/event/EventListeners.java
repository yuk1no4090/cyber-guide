package com.cyberguide.event;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Async event listeners for analytics and alerting.
 * These run in a separate thread pool and don't block the request.
 */
@Component
public class EventListeners {

    private static final Logger log = LoggerFactory.getLogger(EventListeners.class);

    @Async
    @EventListener
    public void onChatCompleted(ChatCompletedEvent event) {
        log.info("[Event] ChatCompleted: session={}, mode={}, elapsed={}ms, crisis={}",
                event.getSessionId(), event.getMode(), event.getElapsedMs(), event.isCrisis());
        // Future: persist to analytics table, send to metrics service, etc.
    }

    @Async
    @EventListener
    public void onFeedbackReceived(FeedbackReceivedEvent event) {
        log.info("[Event] FeedbackReceived: rating={}, mode={}, hadCrisis={}",
                event.getRating(), event.getMode(), event.isHadCrisis());
        // Future: aggregate feedback trends, trigger alerts for low ratings
    }

    @Async
    @EventListener
    public void onCrisisDetected(CrisisDetectedEvent event) {
        log.warn("[Event] CrisisDetected: session={}, keywords={}",
                event.getSessionId(), event.getKeywords());
        // Future: send alert to admin, log to incident table
    }
}
