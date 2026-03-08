package com.cyberguide.service.pipeline;

import com.cyberguide.service.RedactService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Pipeline handler: redacts PII (phone, email, ID card, etc.) from user messages.
 */
@Component
public class RedactHandler implements MessageHandler {

    private static final Logger log = LoggerFactory.getLogger(RedactHandler.class);

    @Override
    public int order() { return 10; }

    @Override
    public void handle(MessageContext context) {
        String original = context.getUserMessage();
        String redacted = RedactService.redact(original);
        if (!original.equals(redacted)) {
            log.info("PII redacted in session={}", context.getSessionId());
        }
        context.setUserMessage(redacted);
    }
}
