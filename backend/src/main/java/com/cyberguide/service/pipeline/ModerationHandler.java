package com.cyberguide.service.pipeline;

import com.cyberguide.service.ModerationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Pipeline handler: checks for crisis keywords and aborts the chain if detected.
 */
@Component
public class ModerationHandler implements MessageHandler {

    private static final Logger log = LoggerFactory.getLogger(ModerationHandler.class);

    @Override
    public int order() { return 20; }

    @Override
    public void handle(MessageContext context) {
        var result = ModerationService.check(context.getUserMessage());
        if (result.isCrisis()) {
            log.warn("Crisis detected in session={}, keywords={}", context.getSessionId(), result.keywordsFound());
            context.setCrisis(true);
            context.setProcessedMessage(ModerationService.CRISIS_RESPONSE);
            context.setSuggestions(List.of("我想聊聊", "谢谢关心"));
            context.setAborted(true);
        }
    }
}
