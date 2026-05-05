package com.cyberguide.service.strategy;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class DefaultChatStrategy implements ChatStrategy {

    @Override
    public String mode() { return "chat"; }

    @Override
    public String buildSystemPrompt(String evidence, String scenario) {
        return "你是 Cyber Guide / 小舟，一个陪伴型的 AI 伙伴。" +
            "请保持真诚、平等的态度，像朋友一样聊天。不做心理诊断，不懂的不装懂。\n" +
            "表达风格要求（非常重要）：\n" +
            "- 口语化、自然，不要官话和模板腔。\n" +
            "- 每次优先用 3-6 句短句回答，避免一大段长文。\n" +
            "- 非必要不要分很多点；需要分点时最多 2-3 点，每点一句话。\n" +
            "- 避免使用“首先/其次/最后/综上”等强 AI 腔连接词。\n" +
            "- 结尾给一个简短追问或下一步建议，让对话继续，而不是一次说完。\n" +
            "关键要求：\n" +
            "- 当证据中的 [USER CONTEXT] 显示 INTENT=UNKNOWN 或 TARGET_INTENT=UNKNOWN 时，" +
            "必须分别输出\u201c升学路径建议\u201d和\u201c就业路径建议\u201d，每条路径至少给 2-3 条可执行行动。\n" +
            "- 当目标意向明确时，只输出该主路径建议，同时补充另一条路径的一句提醒。\n" +
            "**引用规则（最重要！必须遵守）**：\n" +
            "- 你的回答**必须**引用下方 EVIDENCE 中的真实案例，绝对不要编造案例或说笼统套话。\n" +
            "- 引用时提取案例中的**具体数据**（GPA/绩点、排名百分比、学校层次、去向学校、offer结果等），" +
            "融入你的回答。例如：\u201c有个双非的同学 GPA 3.6 排名前5%，最后保研去了浙大\u201d。\n" +
            "- 每个引用的案例**结尾必须附上原文链接**，格式为：[查看原帖](直接复制EVIDENCE里的真实URL)。" +
            "链接只能来自 EVIDENCE 中的\u201c原文链接\u201d行，必须原样复制；严禁生成 http://xxx、https://xxx、example.com 等占位链接。\n" +
            "- 输出链接前必须检查：该 URL 必须逐字出现在 EVIDENCE 的\u201c原文链接\u201d中；如果没有真实原文链接，就不要输出任何链接，也不要写\u201c示例链接\u201d。\n" +
            "- 如果用户问\u201c我的均分/GPA能去哪些学校\u201d，从 EVIDENCE 中找背景最接近的案例，" +
            "告诉用户\u201c和你情况差不多的同学去了 XX 和 YY\u201d，并附链接让用户自己看详情。\n" +
            "- 如果证据中包含学校层次信息（985/211/双非等），针对用户的学校层次给出适配建议。\n" +
            "- **回复格式要求**：在正文结束后，换一行输出 2-3 条用户可能想继续聊的话题，" +
            "每条单独一行，以 \uD83D\uDCA1 开头。这些建议要和当前对话内容相关，" +
            "例如：\uD83D\uDCA1 帮我看看保研时间线怎么规划\n" +
            evidence;
    }

    @Override
    public ChatResult process(String aiResponse) {
        List<String> suggestions = new ArrayList<>();
        StringBuilder message = new StringBuilder();

        for (String line : aiResponse.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("\uD83D\uDCA1") || trimmed.startsWith("- \uD83D\uDCA1")) {
                String cleaned = trimmed.replaceFirst("^[-\\s]*\uD83D\uDCA1\\s*", "").trim();
                if (!cleaned.isEmpty()) {
                    suggestions.add(cleaned);
                }
            } else {
                if (!message.isEmpty()) message.append("\n");
                message.append(line);
            }
        }

        String cleanedMessage = cleanPlaceholderLinks(message.toString().trim());
        if (cleanedMessage.isBlank() && aiResponse != null && !aiResponse.isBlank()) {
            cleanedMessage = cleanPlaceholderLinks(aiResponse.trim());
        }

        if (suggestions.isEmpty()) {
            suggestions = generateContextualFallback(cleanedMessage);
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

    private List<String> generateContextualFallback(String message) {
        String lower = message.toLowerCase();
        if (lower.contains("保研") || lower.contains("推免") || lower.contains("夏令营")) {
            return List.of("保研时间线怎么规划", "夏令营面试一般问什么", "GPA 不够高还有希望吗");
        }
        if (lower.contains("考研") || lower.contains("复试") || lower.contains("调剂")) {
            return List.of("帮我制定复习计划", "考研和就业怎么选", "调剂一般什么时候开始");
        }
        if (lower.contains("留学") || lower.contains("申请") || lower.contains("出国")) {
            return List.of("帮我评估选校方案", "GPA 对申请影响大吗", "要不要找中介");
        }
        if (lower.contains("实习") || lower.contains("秋招") || lower.contains("面试") || lower.contains("offer")) {
            return List.of("简历怎么优化", "面试常问什么", "拿到多个 offer 怎么选");
        }
        if (lower.contains("焦虑") || lower.contains("迷茫") || lower.contains("不知道")) {
            return List.of("能帮我分析一下现状吗", "有什么具体的困扰", "想先聊聊方向还是心情");
        }
        return List.of("继续聊聊", "换个角度分析一下", "帮我做个规划");
    }
}
