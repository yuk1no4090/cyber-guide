package com.cyberguide.service.pipeline;

import com.cyberguide.ai.AiClient;
import com.cyberguide.service.strategy.ChatStrategy;
import com.cyberguide.service.strategy.ChatStrategyFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Pipeline handler: calls the AI service using the appropriate chat strategy.
 */
@Component
public class AiCompletionHandler implements MessageHandler {

    private static final Logger log = LoggerFactory.getLogger(AiCompletionHandler.class);
    private static final int MAX_OUTPUT_TOKENS = 400;

    private final AiClient aiClient;
    private final ChatStrategyFactory strategyFactory;

    public AiCompletionHandler(AiClient aiClient, ChatStrategyFactory strategyFactory) {
        this.aiClient = aiClient;
        this.strategyFactory = strategyFactory;
    }

    @Override
    public int order() { return 40; }

    @Override
    public void handle(MessageContext context) {
        ChatStrategy strategy = strategyFactory.getStrategy(context.getMode());

        // Build system prompt via strategy
        String systemPrompt = strategy.buildSystemPrompt(context.getEvidence(), context.getScenario());
        context.setSystemPrompt(systemPrompt);

        // Call AI
        log.info("AI call: session={}, mode={}, strategy={}", context.getSessionId(), context.getMode(), strategy.mode());
        String response = aiClient.chat(context.getMessages(), systemPrompt, MAX_OUTPUT_TOKENS);
        context.setAiResponse(response);
    }
}
