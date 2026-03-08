package com.cyberguide.service.pipeline;

import com.cyberguide.rag.RagService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Pipeline handler: retrieves relevant knowledge from RAG and injects into context.
 */
@Component
public class RagEnrichHandler implements MessageHandler {

    private static final Logger log = LoggerFactory.getLogger(RagEnrichHandler.class);
    private final RagService ragService;

    public RagEnrichHandler(RagService ragService) {
        this.ragService = ragService;
    }

    @Override
    public int order() { return 30; }

    @Override
    public void handle(MessageContext context) {
        var evidence = ragService.retrieve(context.getUserMessage());
        String formatted = ragService.formatEvidence(evidence);
        context.setEvidence(formatted);
        if (!evidence.isEmpty()) {
            log.debug("RAG enriched: {} chunks for session={}", evidence.size(), context.getSessionId());
        }
    }
}
