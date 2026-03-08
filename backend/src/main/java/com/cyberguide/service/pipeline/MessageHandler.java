package com.cyberguide.service.pipeline;

/**
 * A single handler in the message processing chain.
 * Handlers are executed in order; any handler can abort the chain by setting context.aborted = true.
 */
public interface MessageHandler {

    /**
     * Execution order — lower values run first.
     */
    int order();

    /**
     * Process the context. Call next.handle(context) to continue the chain,
     * or set context.aborted = true to stop.
     */
    void handle(MessageContext context);
}
