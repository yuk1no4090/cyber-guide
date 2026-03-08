package com.cyberguide.service.strategy;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Crisis chat strategy — activated when crisis keywords are detected.
 * Returns a pre-defined safety response with hotline information.
 */
@Component
public class CrisisChatStrategy implements ChatStrategy {

    @Override
    public String mode() { return "crisis"; }

    @Override
    public String buildSystemPrompt(String evidence, String scenario) {
        return "你是一个关心用户安全的 AI 伙伴。用户可能正在经历心理危机。" +
            "请温柔地回应，表达关心，并引导用户寻求专业帮助。" +
            "务必提供心理援助热线：400-161-9995。";
    }

    @Override
    public ChatResult process(String aiResponse) {
        return new ChatResult(aiResponse, List.of("我想聊聊", "谢谢关心"), true);
    }
}
