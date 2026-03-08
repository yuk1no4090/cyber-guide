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
            scenarioContext + evidence;
    }

    @Override
    public ChatResult process(String aiResponse) {
        return new ChatResult(aiResponse, List.of("继续模拟", "换个场景", "结束模拟"), false);
    }
}
