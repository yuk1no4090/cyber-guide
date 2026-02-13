# Agent-C Integration Notes

本次 Agent-C 仅实现了可独立落地部分（场景模板、场景映射、RAG 场景 boost、`ScenarioPicker` 组件、测试）。
以下是必须由 `page.tsx` / `route.ts` 接通的待集成点：

## 1) `src/app/api/chat/route.ts` 待接入

- 请求体扩展：在 `mode='profile_other'` 与 `mode='generate_report_other'` 支持可选 `scenario`
- 系统提示词注入：通过 `buildScenarioSystemPrompt(scenario)` 注入 system message（不要把场景硬塞到 user message）
- 结构化优先：
  - 先要求模型输出 JSON
  - 调用 `parseScenarioModelOutput(raw, scenario)` 做解析
  - 解析失败走模板 fallback
- 响应统一为：
  - 成功：`{ success: true, data: { message, suggestions, scenario? }, error: null }`
  - 失败：`{ success: false, data: null, error: { code, message } }`

## 2) `src/app/page.tsx` 待接入

- 在 `mode='profile_other'` 显示 `ScenarioPicker`
- 新增状态：`selectedScenario: RelationshipScenario | null`
- 请求透传：
  - 对话请求 `profile_other` 时带上 `scenario`
  - 报告请求 `generate_report_other` 时带上 `scenario`
- 埋点触发建议：
  - 选择场景：`trackScenarioSelected(scenario)`
  - 响应生成：`trackScenarioResponseGenerated(scenario, { success, latency_ms, error_type })`
  - 复制话术：`trackScenarioScriptCopied(scenario, { success, latency_ms, error_type })`

## 3) UI 行为建议

- 无场景时保持旧读人模式逻辑，保证向后兼容
- 有场景时优先输出结构：
  - 关系判断（简版）
  - 沟通目标
  - 话术A（温和）
  - 话术B（直接）
  - 避坑点（1-2 条）
- 保留免责声明：不做医疗/法律结论

## 4) 本次已完成能力（可直接复用）

- `src/lib/scenario.ts`
  - 场景枚举、映射、模板、JSON 解析与 fallback、埋点 envelope
- `src/lib/rag.ts`
  - `retrieve(query, topK, { mode, scenario })` 场景 boost
- `src/app/components/ScenarioPicker.tsx`
  - 场景 chips 与 `scenario_selected` 埋点
- `knowledge_base/skills/relationship_*.md`
  - 5 个关系场景知识卡

## 5) `route.ts` 最小接线伪代码

```ts
// 仅示意：mode='profile_other' / 'generate_report_other'
import {
  normalizeScenario,
  buildScenarioSystemPrompt,
  parseScenarioModelOutput,
  formatScenarioScript,
  trackScenarioResponseGenerated,
} from '@/lib/scenario';

const scenario = normalizeScenario(body.scenario);
const started = Date.now();

if (mode === 'profile_other' || mode === 'generate_report_other') {
  const basePrompt = mode === 'profile_other'
    ? PROFILE_OTHER_SYSTEM_PROMPT
    : REPORT_OTHER_SYSTEM_PROMPT;

  const scenarioPrompt = scenario
    ? `\n\n${buildScenarioSystemPrompt(scenario)}`
    : '';

  const completion = await createCompletionWithRetry({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: basePrompt + scenarioPrompt },
      ...mappedMessages,
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '';

  if (scenario) {
    const parsed = parseScenarioModelOutput(raw, scenario);
    const message = formatScenarioScript(parsed.script);
    trackScenarioResponseGenerated(scenario, {
      success: true,
      latency_ms: Date.now() - started,
      error_type: parsed.usedFallback ? 'ai_format_error' : 'none',
    });

    return NextResponse.json({
      success: true,
      data: { message, suggestions: [], scenario },
      error: null,
    });
  }

  // 无 scenario 时保持旧逻辑
  return NextResponse.json({
    success: true,
    data: { message: raw, suggestions: [] },
    error: null,
  });
}
```

## 6) `page.tsx` 最小接线伪代码

```tsx
import ScenarioPicker from './components/ScenarioPicker';
import { type RelationshipScenario } from '@/lib/scenario';

const [selectedScenario, setSelectedScenario] = useState<RelationshipScenario | null>(null);

// profile_other 模式下渲染
{mode === 'profile_other' && (
  <ScenarioPicker
    value={selectedScenario}
    onChange={setSelectedScenario}
    disabled={isLoading}
  />
)}

// 对话请求透传 scenario
await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
    mode: mode === 'profile_other' ? 'profile_other' : mode,
    scenario: mode === 'profile_other' ? selectedScenario : null,
  }),
});

// 报告请求透传 scenario
await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: profileMessages.map(m => ({ role: m.role, content: m.content })),
    mode: mode === 'profile_other' ? 'generate_report_other' : 'generate_report',
    scenario: mode === 'profile_other' ? selectedScenario : null,
  }),
});
```

## 7) 请求/响应 JSON 示例（含 fallback）

### 请求（profile_other + scenario）

```json
{
  "mode": "profile_other",
  "scenario": "roommate_boundary",
  "messages": [
    { "role": "user", "content": "室友总是不问就用我东西，我很烦。" }
  ]
}
```

### 成功响应（结构化解析成功）

```json
{
  "success": true,
  "data": {
    "message": "关系判断（简版）：...\n\n沟通目标：...\n\n话术A（温和）：...\n\n话术B（直接）：...\n\n避坑点：\n- ...\n- ...\n\n免责声明：仅基于你提供的信息做沟通参考，不构成医疗或法律结论。",
    "suggestions": [],
    "scenario": "roommate_boundary"
  },
  "error": null
}
```

### 成功响应（AI 格式异常，fallback 到模板）

```json
{
  "success": true,
  "data": {
    "message": "关系判断（简版）：更像是边界未对齐导致的高频摩擦...\n\n沟通目标：先对齐具体规则...\n\n话术A（温和）：...\n\n话术B（直接）：...\n\n避坑点：\n- 上来翻旧账...\n- 只说你总是...\n\n免责声明：仅基于你提供的信息做沟通参考，不构成医疗或法律结论。",
    "suggestions": [],
    "scenario": "roommate_boundary"
  },
  "error": null
}
```

### 失败响应（统一错误结构）

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AI_TIMEOUT",
    "message": "小舟暂时有点忙，响应超时了，请稍后重试"
  }
}
```

## 8) 埋点触发点说明

- `scenario_selected`
  - 触发时机：用户在 `ScenarioPicker` 选择/切换场景
  - 建议字段：`scenario`, `success=true`, `latency_ms=0`, `error_type='none'`
- `scenario_response_generated`
  - 触发时机：`profile_other` 或 `generate_report_other` 返回后
  - 成功字段：`scenario`, `success=true`, `latency_ms`, `error_type='none'`
  - fallback 字段：`scenario`, `success=true`, `latency_ms`, `error_type='ai_format_error'`
  - 失败字段：`scenario`, `success=false`, `latency_ms`, `error_type='<api_error>'`
- `scenario_script_copied`
  - 触发时机：用户点击复制场景话术
  - 成功字段：`scenario`, `success=true`, `latency_ms`, `error_type='none'`
  - 失败字段：`scenario`, `success=false`, `latency_ms`, `error_type='clipboard_error'`

