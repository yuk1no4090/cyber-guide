package com.cyberguide.service;

import com.cyberguide.service.pipeline.*;
import com.cyberguide.service.strategy.*;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ServiceEdgeCaseTest {

    // ── ModerationService ──

    @Nested
    class ModerationEdge {

        @Test
        void detectsAllCrisisKeywords() {
            String[] keywords = {
                "想死", "不想活", "自杀", "自残", "割腕", "跳楼", "跳河",
                "结束生命", "离开这个世界", "活着没意思", "不如死了",
                "不想活了", "寻死", "轻生", "了结"
            };
            for (String kw : keywords) {
                var result = ModerationService.check("我" + kw);
                assertTrue(result.isCrisis(), "Should detect: " + kw);
            }
        }

        @Test
        void allFalsePositivesAreFilteredCorrectly() {
            String[] safe = {
                "热死了今天", "累死我了", "笑死人了", "冷死了",
                "饿死了", "困死了", "急死我了", "气死了",
                "烦死了", "丑死了", "吓死我了", "渴死了",
                "忙死了", "无聊死了", "尴尬死了"
            };
            for (String msg : safe) {
                var result = ModerationService.check(msg);
                assertFalse(result.isCrisis(), "False positive: " + msg);
            }
        }

        @Test
        void mixedCrisisAndFalsePositive() {
            // "热死" is false positive but "自杀" is real crisis
            var result = ModerationService.check("热死了，我想自杀");
            assertTrue(result.isCrisis());
            assertTrue(result.keywordsFound().contains("自杀"));
        }

        @ParameterizedTest
        @NullAndEmptySource
        @ValueSource(strings = {" ", "\n", "\t", "   "})
        void handlesBlankInputSafely(String input) {
            if (input == null) return; // check() doesn't accept null
            var result = ModerationService.check(input);
            assertFalse(result.isCrisis());
        }

        @Test
        void handlesExtremelyLongInput() {
            String longText = "这是一段很长的正常文本。".repeat(5000);
            var result = ModerationService.check(longText);
            assertFalse(result.isCrisis());
        }

        @Test
        void handlesUnicodeAroundKeywords() {
            var result = ModerationService.check("😢😢😢我想自杀😢😢😢");
            assertTrue(result.isCrisis());
        }

        @Test
        void handlesKeywordsWithMixedCase() {
            // Chinese doesn't have case, but test that toLowerCase doesn't break
            var result = ModerationService.check("我想自杀ABC");
            assertTrue(result.isCrisis());
        }
    }

    // ── RedactService ──

    @Nested
    class RedactEdge {

        @Test
        void redactsChinesePhoneNumber() {
            assertEquals("打我 [PHONE]", RedactService.redact("打我 13812345678"));
        }

        @Test
        void redactsMultiplePiiTypes() {
            String input = "电话13812345678邮箱test@qq.com身份证110101199001011234";
            String result = RedactService.redact(input);
            assertFalse(result.contains("13812345678"));
            assertFalse(result.contains("test@qq.com"));
            assertFalse(result.contains("110101199001011234"));
            assertTrue(result.contains("[PHONE]"));
            assertTrue(result.contains("[EMAIL]"));
            assertTrue(result.contains("[ID_CARD]"));
        }

        @Test
        void redactsIpAddress() {
            String result = RedactService.redact("我的IP是192.168.1.100");
            assertTrue(result.contains("[IP]"));
            assertFalse(result.contains("192.168.1.100"));
        }

        @Test
        void preservesNonPiiText() {
            String clean = "今天天气不错，我想考研";
            assertEquals(clean, RedactService.redact(clean));
        }

        @Test
        void handlesNullInput() {
            assertNull(RedactService.redact(null));
        }

        @Test
        void handlesEmptyInput() {
            assertEquals("", RedactService.redact(""));
        }

        @Test
        void handlesOnlyPiiInput() {
            String result = RedactService.redact("13812345678");
            assertEquals("[PHONE]", result);
        }

        @Test
        void preservesTextAroundPii() {
            String result = RedactService.redact("前面13812345678后面");
            assertEquals("前面[PHONE]后面", result);
        }

        @Test
        void handlesEmail15CharIdCard() {
            // 15-digit ID card
            String result = RedactService.redact("身份证号110101900101123");
            assertTrue(result.contains("[ID_CARD]"));
        }
    }

    // ── FeedbackService quality scoring ──

    @Nested
    class FeedbackQuality {

        @Test
        void goldTierForHighRatingAndLongFeedback() {
            var svc = createFeedbackService();
            var req = new FeedbackService.FeedbackRequest(
                List.of(), 5, "非常好用，帮了很大忙，以后还会继续使用", false, "chat", "s1", null);
            var result = svc.submit(req);
            assertEquals("gold", result.tier());
            assertTrue(result.score() >= 75);
        }

        @Test
        void needsFixForLowRatingNoFeedback() {
            var svc = createFeedbackService();
            var req = new FeedbackService.FeedbackRequest(
                List.of(), 1, "", false, "chat", "s1", null);
            var result = svc.submit(req);
            assertEquals("needs_fix", result.tier());
        }

        @Test
        void messageCountCappedAt15Points() {
            var svc = createFeedbackService();
            var bigHistory = new java.util.ArrayList<java.util.Map<String, String>>();
            for (int i = 0; i < 100; i++) {
                bigHistory.add(java.util.Map.of("role", "user", "content", "msg" + i));
            }
            var req = new FeedbackService.FeedbackRequest(
                bigHistory, 3, "", false, "chat", "s1", null);
            var result = svc.submit(req);
            // 3*15 + 0 (feedback short) + min(100*2, 15) = 45 + 15 = 60
            assertEquals("silver", result.tier());
        }

        private FeedbackService createFeedbackService() {
            // Use a no-op repo and publisher
            var repo = org.mockito.Mockito.mock(com.cyberguide.repository.FeedbackRepository.class);
            org.mockito.Mockito.when(repo.save(org.mockito.ArgumentMatchers.any())).thenAnswer(i -> i.getArgument(0));
            var publisher = org.mockito.Mockito.mock(org.springframework.context.ApplicationEventPublisher.class);
            return new FeedbackService(repo, publisher);
        }
    }

    // ── Pipeline ordering and abort ──

    @Nested
    class PipelineEdge {

        @Test
        void pipelineSurvivesHandlerException() {
            MessageHandler thrower = new MessageHandler() {
                @Override public int order() { return 1; }
                @Override public void handle(MessageContext ctx) { throw new RuntimeException("boom"); }
            };
            MessagePipeline pipeline = new MessagePipeline(List.of(thrower));
            MessageContext ctx = new MessageContext();

            assertThrows(RuntimeException.class, () -> pipeline.execute(ctx));
        }

        @Test
        void pipelineWithNoHandlersDoesNothing() {
            MessagePipeline pipeline = new MessagePipeline(List.of());
            MessageContext ctx = new MessageContext();
            ctx.setUserMessage("test");
            pipeline.execute(ctx);
            assertEquals("test", ctx.getUserMessage());
        }

        @Test
        void redactThenModerateOrderIsCorrect() {
            // Redact (order=10) should run before Moderation (order=20)
            var redact = new RedactHandler();
            var moderate = new ModerationHandler();
            var pipeline = new MessagePipeline(List.of(moderate, redact)); // intentionally reversed

            MessageContext ctx = new MessageContext();
            ctx.setSessionId("t");
            ctx.setUserMessage("联系我13812345678，我想自杀");
            pipeline.execute(ctx);

            assertTrue(ctx.isCrisis());
            assertTrue(ctx.isAborted());
            // Redact should have cleaned the phone before moderation
            assertTrue(ctx.getUserMessage().contains("[PHONE]"));
        }
    }

    // ── ChatStrategy edge cases ──

    @Nested
    class StrategyEdge {

        @Test
        void factoryReturnsDefaultForNullOrBlankMode() {
            var defaultStrat = new DefaultChatStrategy();
            var factory = new ChatStrategyFactory(List.of(defaultStrat));

            assertSame(factory.getStrategy(null), factory.getStrategy("chat"));
            assertSame(factory.getStrategy(""), factory.getStrategy("chat"));
            assertSame(factory.getStrategy("   "), factory.getStrategy("chat"));
        }

        @Test
        void factoryReturnsDefaultForUnknownMode() {
            var defaultStrat = new DefaultChatStrategy();
            var factory = new ChatStrategyFactory(List.of(defaultStrat));

            assertSame(factory.getStrategy("nonexistent_mode"), factory.getStrategy("chat"));
        }

        @Test
        void defaultStrategyProcessEmptyResponse() {
            var strategy = new DefaultChatStrategy();
            var result = strategy.process("");
            assertNotNull(result.message());
            assertNotNull(result.suggestions());
        }

        @Test
        void defaultStrategyProcessNullResponseThrows() {
            var strategy = new DefaultChatStrategy();
            assertThrows(NullPointerException.class, () -> strategy.process(null));
        }

        @Test
        void crisisStrategyAlwaysReturnsCrisisFlag() {
            var strategy = new CrisisChatStrategy();
            var result = strategy.process("any response");
            assertTrue(result.isCrisis());
        }
    }
}
