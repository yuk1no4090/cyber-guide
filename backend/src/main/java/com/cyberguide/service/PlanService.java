package com.cyberguide.service;

import com.cyberguide.ai.AiClient;
import com.cyberguide.model.PlanDay;
import com.cyberguide.repository.PlanDayRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class PlanService {

    private static final Logger log = LoggerFactory.getLogger(PlanService.class);
    private static final int PLAN_DAYS = 7;
    private static final int TASK_MIN_LEN = 8;
    private static final int TASK_MAX_LEN = 40;

    private final PlanDayRepository repo;
    private final AiClient aiClient;

    public PlanService(PlanDayRepository repo, AiClient aiClient) {
        this.repo = repo;
        this.aiClient = aiClient;
    }

    // ---- Fallback task pools (same as TS) ----
    private static final Map<Integer, List<String>> FALLBACK_POOLS = Map.of(
        1, List.of("写下今天最重要的一件事并先做10分钟", "列出3件今天能做的小事并完成1件"),
        2, List.of("整理一个最小任务清单并完成第一项", "把昨天没做完的事拆成3个更小的步骤"),
        3, List.of("给关键同学发一条确认信息推进事项", "找一个人聊聊你最近在做的事"),
        4, List.of("复盘昨天卡点并写出一个改进动作", "写下这周最大的收获和最大的坑"),
        5, List.of("安排30分钟无打扰时段专注完成任务", "关掉手机通知做30分钟深度工作"),
        6, List.of("检查进度并删掉一项不必要的任务", "看看这周的计划完成了多少做个标记"),
        7, List.of("总结本周收获并规划下周第一步", "写3句话总结这一周然后定下周第一件事")
    );

    public record FetchResult(List<PlanDay> plans, int todayIndex, PlanDay todayPlan) {}

    public FetchResult fetch(String sessionId) {
        List<PlanDay> plans = repo.findBySessionIdOrderByDayIndexAsc(sessionId);
        int todayIndex = computeTodayIndex(plans);
        PlanDay todayPlan = plans.stream()
            .filter(p -> p.getDayIndex() == todayIndex)
            .findFirst().orElse(null);
        return new FetchResult(plans, todayIndex, todayPlan);
    }

    public FetchResult generate(String sessionId, String context) {
        // Call AI to generate 7 tasks
        String systemPrompt = "你是行动教练，请生成简洁、可执行、当天可完成的任务。\n" +
            "请输出 7 条任务，中文，每条 8-40 字。\n" +
            "禁止输出解释，只输出 JSON：{\"tasks\":[\"任务1\",\"任务2\"]}";
        String userPrompt = "session_id=" + sessionId + "\n用户上下文=" +
            (context != null ? context : "无") + "\n请生成连续 7 天的微行动任务，逐天递进，难度适中。";

        List<String> tasks;
        try {
            String response = aiClient.chatCompletion(
                List.of(Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)),
                0.8, 300);
            tasks = parseTasksFromAI(response);
        } catch (Exception e) {
            log.warn("AI plan generation failed, using fallback", e);
            tasks = new ArrayList<>();
        }

        // Pad with fallback if needed
        while (tasks.size() < PLAN_DAYS) {
            int day = tasks.size() + 1;
            List<String> pool = FALLBACK_POOLS.getOrDefault(day, List.of("完成今天的一个小目标"));
            tasks.add(pool.get(new Random().nextInt(pool.size())));
        }

        // Upsert into DB
        List<PlanDay> saved = new ArrayList<>();
        for (int i = 0; i < PLAN_DAYS; i++) {
            int dayIndex = i + 1;
            String taskText = sanitizeTask(tasks.get(i), dayIndex);
            PlanDay plan = repo.findBySessionIdAndDayIndex(sessionId, dayIndex)
                .orElseGet(PlanDay::new);
            plan.setSessionId(sessionId);
            plan.setDayIndex(dayIndex);
            plan.setTaskText(taskText);
            plan.setStatus("todo");
            saved.add(repo.save(plan));
        }

        int todayIndex = computeTodayIndex(saved);
        PlanDay todayPlan = saved.stream()
            .filter(p -> p.getDayIndex() == todayIndex)
            .findFirst().orElse(null);
        return new FetchResult(saved, todayIndex, todayPlan);
    }

    public PlanDay update(String sessionId, int dayIndex, String status) {
        PlanDay plan = repo.findBySessionIdAndDayIndex(sessionId, dayIndex)
            .orElseThrow(() -> new NoSuchElementException("Plan not found for day " + dayIndex));
        plan.setStatus(status);
        return repo.save(plan);
    }

    public PlanDay regenerateDay(String sessionId, int dayIndex, String context) {
        String systemPrompt = "你是行动教练，请生成简洁、可执行、当天可完成的任务。\n" +
            "请输出 1 条任务，中文，8-40 字。\n禁止输出解释，只输出 JSON：{\"tasks\":[\"任务\"]}";
        String userPrompt = "session_id=" + sessionId + "\n目标天数=第" + dayIndex + "天\n" +
            "用户上下文=" + (context != null ? context : "无") + "\n请只生成当天 1 条任务。";

        String taskText;
        try {
            String response = aiClient.chatCompletion(
                List.of(Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)),
                0.8, 100);
            List<String> tasks = parseTasksFromAI(response);
            taskText = tasks.isEmpty() ? getFallbackTask(dayIndex) : sanitizeTask(tasks.get(0), dayIndex);
        } catch (Exception e) {
            taskText = getFallbackTask(dayIndex);
        }

        PlanDay plan = repo.findBySessionIdAndDayIndex(sessionId, dayIndex)
            .orElseGet(PlanDay::new);
        plan.setSessionId(sessionId);
        plan.setDayIndex(dayIndex);
        plan.setTaskText(taskText);
        plan.setStatus("todo");
        return repo.save(plan);
    }

    // ---- Helpers ----

    private List<String> parseTasksFromAI(String text) {
        // Try JSON parse
        try {
            String cleaned = text.replaceAll("```(?:json)?\\s*", "").replaceAll("```", "").trim();
            // Simple extraction of array values
            int start = cleaned.indexOf('[');
            int end = cleaned.lastIndexOf(']');
            if (start >= 0 && end > start) {
                String arrayStr = cleaned.substring(start + 1, end);
                List<String> result = new ArrayList<>();
                for (String item : arrayStr.split(",")) {
                    String trimmed = item.trim().replaceAll("^\"|\"$", "").trim();
                    if (!trimmed.isEmpty()) result.add(trimmed);
                }
                return result;
            }
        } catch (Exception ignored) {}

        // Fallback: line-by-line
        List<String> result = new ArrayList<>();
        for (String line : text.split("\n")) {
            String trimmed = line.replaceAll("^[-*•\\d.、)\\s]+", "").trim();
            if (!trimmed.isEmpty() && trimmed.length() >= TASK_MIN_LEN) result.add(trimmed);
        }
        return result;
    }

    private String sanitizeTask(String task, int dayIndex) {
        String cleaned = task.replaceAll("\\s+", " ").trim();
        if (cleaned.length() < TASK_MIN_LEN || cleaned.length() > TASK_MAX_LEN) {
            return getFallbackTask(dayIndex);
        }
        return cleaned;
    }

    private String getFallbackTask(int dayIndex) {
        int clamped = Math.max(1, Math.min(PLAN_DAYS, dayIndex));
        List<String> pool = FALLBACK_POOLS.getOrDefault(clamped, List.of("完成今天的一个小目标"));
        return pool.get(new Random().nextInt(pool.size()));
    }

    private int computeTodayIndex(List<PlanDay> plans) {
        if (plans.isEmpty()) return 1;
        PlanDay first = plans.stream()
            .filter(p -> p.getDayIndex() == 1)
            .findFirst().orElse(plans.get(0));
        if (first.getCreatedAt() == null) return 1;
        long days = Duration.between(first.getCreatedAt(), Instant.now()).toDays();
        return Math.max(1, Math.min(PLAN_DAYS, (int) days + 1));
    }
}
