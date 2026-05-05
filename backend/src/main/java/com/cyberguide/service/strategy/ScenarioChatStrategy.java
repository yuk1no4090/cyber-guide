package com.cyberguide.service.strategy;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Scenario chat strategy — role-play mode for specific situations
 * (e.g. interview practice, workplace conflicts).
 */
@Component
public class ScenarioChatStrategy implements ChatStrategy {

    @Override
    public String mode() { return "scenario"; }

    @Override
    public String buildSystemPrompt(String evidence, String scenario) {
        String scenarioContext = (scenario != null && !scenario.isBlank())
            ? "\n当前场景：" + scenario + "\n请围绕这个场景展开对话。"
            : "";
        return "你是 Cyber Guide / 小舟，正在进行场景模拟对话。" +
            "请根据用户选择的场景，扮演相应角色，帮助用户练习应对。" +
            "表达方式尽量口语化、简短，不要一次输出过长大段；优先 3-6 句短句，" +
            "非必要不要分很多点，必要时最多 2-3 点。\n" +
            "引用 EVIDENCE 中的案例时，提取具体数据（GPA、排名、去向等），" +
            "并在引用结尾附上原文链接，链接必须直接复制 EVIDENCE 中的真实 URL；严禁生成 http://xxx、https://xxx、example.com、示例链接等占位或编造链接。\n" +
            "在回复末尾换行输出 2-3 条后续建议，每条以 \uD83D\uDCA1 开头，和当前场景相关。" +
            scenarioContext + evidence;
    }

    @Override
    public ChatResult process(String aiResponse) {
        java.util.List<String> suggestions = new java.util.ArrayList<>();
        StringBuilder message = new StringBuilder();
        for (String line : aiResponse.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("\uD83D\uDCA1") || trimmed.startsWith("- \uD83D\uDCA1")) {
                String cleaned = trimmed.replaceFirst("^[-\\s]*\uD83D\uDCA1\\s*", "").trim();
                if (!cleaned.isEmpty()) suggestions.add(cleaned);
            } else {
                if (!message.isEmpty()) message.append("\n");
                message.append(line);
            }
        }
        String cleanedMessage = cleanPlaceholderLinks(message.toString().trim());
        if (suggestions.isEmpty()) {
            suggestions = java.util.List.of("继续模拟", "换个场景", "结束模拟");
        }
        return new ChatResult(cleanedMessage, suggestions, false);
    }

    private String cleanPlaceholderLinks(String text) {
        if (text == null || text.isBlank()) return "";
        return text
            .replaceAll("\\[([^\\]]+)\\]\\(https?://x+[^)]*\\)", "$1")
            .replaceAll("https?://x+(?:\\.[A-Za-z0-9_-]+)*(?:/\\S*)?", "")
            .replaceAll("https?://example\\.com(?:/\\S*)?", "")
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
    }
}
