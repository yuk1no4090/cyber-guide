package com.cyberguide.service.pipeline;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

/**
 * Orchestrates the message processing pipeline.
 * Handlers are sorted by order() and executed sequentially.
 * If any handler sets context.aborted = true, remaining handlers are skipped.
 */
@Component
public class MessagePipeline {

    private static final Logger log = LoggerFactory.getLogger(MessagePipeline.class);
    private final List<MessageHandler> handlers;

    public MessagePipeline(List<MessageHandler> handlers) {
        this.handlers = handlers.stream()
                .sorted(Comparator.comparingInt(MessageHandler::order))
                .toList();
        log.info("Message pipeline initialized with {} handlers: {}",
                handlers.size(),
                this.handlers.stream().map(h -> h.getClass().getSimpleName()).toList());
    }

    /**
     * Execute the full pipeline on the given context.
     */
    public void execute(MessageContext context) {
        for (MessageHandler handler : handlers) {
            if (context.isAborted()) {
                log.debug("Pipeline aborted before {}", handler.getClass().getSimpleName());
                break;
            }
            try {
                handler.handle(context);
            } catch (Exception e) {
                log.error("Pipeline handler {} failed: {}", handler.getClass().getSimpleName(), e.getMessage(), e);
                throw e;
            }
        }
    }
}
