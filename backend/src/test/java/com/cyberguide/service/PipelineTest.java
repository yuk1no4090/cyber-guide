package com.cyberguide.service;

import com.cyberguide.service.pipeline.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PipelineTest {

    @Test
    void moderationHandlerAbortOnCrisis() {
        var handler = new ModerationHandler();
        MessageContext ctx = new MessageContext();
        ctx.setUserMessage("我想自杀");
        ctx.setSessionId("test");

        handler.handle(ctx);

        assertTrue(ctx.isCrisis());
        assertTrue(ctx.isAborted());
        assertNotNull(ctx.getProcessedMessage());
    }

    @Test
    void moderationHandlerPassesSafeMessage() {
        var handler = new ModerationHandler();
        MessageContext ctx = new MessageContext();
        ctx.setUserMessage("今天天气不错");
        ctx.setSessionId("test");

        handler.handle(ctx);

        assertFalse(ctx.isCrisis());
        assertFalse(ctx.isAborted());
    }

    @Test
    void redactHandlerRedactsPhone() {
        var handler = new RedactHandler();
        MessageContext ctx = new MessageContext();
        ctx.setUserMessage("我的号码是13812345678");
        ctx.setSessionId("test");

        handler.handle(ctx);

        assertTrue(ctx.getUserMessage().contains("[PHONE]"));
        assertFalse(ctx.getUserMessage().contains("13812345678"));
    }

    @Test
    void pipelineStopsOnAbort() {
        MessageHandler abort = new MessageHandler() {
            @Override public int order() { return 1; }
            @Override public void handle(MessageContext context) {
                context.setAborted(true);
            }
        };
        MessageHandler shouldNotRun = new MessageHandler() {
            @Override public int order() { return 2; }
            @Override public void handle(MessageContext context) {
                fail("Should not reach this handler");
            }
        };

        MessagePipeline pipeline = new MessagePipeline(List.of(abort, shouldNotRun));
        MessageContext ctx = new MessageContext();
        pipeline.execute(ctx);

        assertTrue(ctx.isAborted());
    }

    @Test
    void pipelineExecutesInOrder() {
        StringBuilder order = new StringBuilder();

        MessageHandler a = new MessageHandler() {
            @Override public int order() { return 20; }
            @Override public void handle(MessageContext c) { order.append("B"); }
        };
        MessageHandler b = new MessageHandler() {
            @Override public int order() { return 10; }
            @Override public void handle(MessageContext c) { order.append("A"); }
        };

        MessagePipeline pipeline = new MessagePipeline(List.of(a, b));
        pipeline.execute(new MessageContext());

        assertEquals("AB", order.toString());
    }
}
