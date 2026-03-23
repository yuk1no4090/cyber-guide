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
        var profile = ragService.inferUserProfile(context.getMessages(), context.getUserMessage());
        context.setUserProfile(profile);

        var bundle = ragService.retrieveWithMetadata(context.getUserMessage(), profile, 6);
        context.setRetrievalResults(bundle.results());
        context.setRetrievalMetadata(bundle.metadata());

        var promptEvidence = bundle.results().stream().limit(4).toList();
        String formatted = ragService.formatEvidence(promptEvidence, profile);
        context.setEvidence(formatted);
        if (!bundle.results().isEmpty()) {
            log.debug("RAG enriched: {} chunks for session={}", bundle.results().size(), context.getSessionId());
        }
    }
}
