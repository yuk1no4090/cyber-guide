package com.cyberguide.service.strategy;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Default chat strategy — general conversation mode.
 */
@Component
public class DefaultChatStrategy implements ChatStrategy {

    @Override
    public String mode() { return "chat"; }

    @Override
    public String buildSystemPrompt(String evidence, String scenario) {
        return "你是 Cyber Guide / 小舟，一个陪伴型的 AI 伙伴。" +
            "请保持真诚、平等的态度，像朋友一样聊天。不做心理诊断，不懂的不装懂。" +
            "当证据中的 [USER CONTEXT] 显示 INTENT=UNKNOWN 或 TARGET_INTENT=UNKNOWN 时，必须分别输出“升学路径建议”和“就业路径建议”，每条路径至少给 2-3 条可执行行动。" +
            "当目标意向明确时，只输出该主路径建议，同时补充另一条路径的一句提醒，帮助用户做兜底决策。" +
            "当你引用案例或经验时，请优先保留并输出证据中的原文链接（Markdown 链接格式）。" +
            evidence;
    }

    @Override
    public ChatResult process(String aiResponse) {
        List<String> suggestions = new ArrayList<>();
        StringBuilder message = new StringBuilder();

        for (String line : aiResponse.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("💡") || trimmed.startsWith("- 💡")) {
                suggestions.add(trimmed.replaceFirst("^[-\\s]*💡\\s*", ""));
            } else {
                if (!message.isEmpty()) message.append("\n");
                message.append(line);
            }
        }

        if (suggestions.isEmpty()) {
            suggestions = List.of("继续聊聊", "换个话题", "帮我分析一下");
        }

        return new ChatResult(message.toString().trim(), suggestions, false);
    }
}
