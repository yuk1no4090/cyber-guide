package com.cyberguide.service.pipeline;

import com.cyberguide.service.AllowedLinkSanitizer;
import com.cyberguide.service.strategy.ChatStrategy;
import com.cyberguide.service.strategy.ChatStrategyFactory;
import org.springframework.stereotype.Component;

/**
 * Pipeline handler: parses the AI response using the chat strategy.
 */
@Component
public class ResponseParseHandler implements MessageHandler {

    private final ChatStrategyFactory strategyFactory;

    public ResponseParseHandler(ChatStrategyFactory strategyFactory) {
        this.strategyFactory = strategyFactory;
    }

    @Override
    public int order() { return 50; }

    @Override
    public void handle(MessageContext context) {
        ChatStrategy strategy = strategyFactory.getStrategy(context.getMode());
        ChatStrategy.ChatResult result = strategy.process(context.getAiResponse());
        String sanitizedMessage = AllowedLinkSanitizer.sanitizeWithRetrievalResults(
            result.message(),
            context.getRetrievalResults()
        );
        context.setProcessedMessage(sanitizedMessage);
        context.setSuggestions(result.suggestions());
        context.setCrisis(result.isCrisis());
    }
}
