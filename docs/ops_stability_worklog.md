# 稳定性工程工作留存（P0-P2）2.26

> 目标：降低“卡住/超时/报错”出现频率，并建立可复用的发布与排障闭环。

## 1) 本阶段已完成内容

### P0：先止血（已完成）

- `/api/chat` 改为流式输出（NDJSON），不再等待完整模型结果后一次性返回。
- 前端已支持流式消费（聊天与报告模式均可增量显示）。
- 新增模型降级：支持 `OPENAI_FALLBACK_MODEL`，主模型异常时自动尝试备用模型。
- 保留非 AI 路径（危机检测、计划问答、参数校验）为 JSON 响应，确保兼容。

### P1：可观测性（第一轮已完成）

- `/api/chat` 增加 `request_id`，并记录入口、RAG、LLM 分阶段耗时日志。
- `/api/chat` 新增上下文体积观测字段（`contextChars`、`ragTopK`），用于定位“聊到后半段变慢”的触发点。
- 计划相关接口补齐 `request_id` 与阶段日志：
  - `/api/plan/fetch`
  - `/api/plan/generate`
  - `/api/plan/update`
  - `/api/plan/regenerate-day`
- 指标接口补齐 `request_id` 与阶段日志：
  - `/api/metrics`

### P2：发布规范化（已完成基础版）

- 新增 `ecosystem.config.js`（PM2 进程配置）。
- 新增 `scripts/deploy.sh`（拉取代码→安装依赖→构建→PM2 重载→冒烟检查）。
- 增强 `scripts/smoke-test.sh`，支持 NDJSON/JSON 两种 chat 返回格式。
- 更新 `README.md`，补充自建部署与一键发布说明。

### P1.5：上下文瘦身（本轮已完成）

- `/api/chat` 增加“按字符预算”上下文截断，避免仅按消息条数截断导致上下文体积失控。
- 新增单条消息上限裁剪，超长消息保留开头+结尾，降低长文本对后续轮次的拖累。
- RAG 引入动态降载：在上下文过重时自动将 `topK` 从 2 降到 1，优先稳住时延和成功率。
- 报告模式同步应用更宽松的上下文预算，兼顾质量与稳定性。

## 2) 关键变更文件

- 流式与降级：
  - `src/lib/stream.ts`
  - `src/lib/openai.ts`
  - `src/app/api/chat/route.ts`
  - `src/app/page.tsx`
- 可观测性：
  - `src/app/api/metrics/route.ts`
  - `src/app/api/plan/fetch/route.ts`
  - `src/app/api/plan/generate/route.ts`
  - `src/app/api/plan/update/route.ts`
  - `src/app/api/plan/regenerate-day/route.ts`
- 发布与运维：
  - `ecosystem.config.js`
  - `scripts/deploy.sh`
  - `scripts/smoke-test.sh`
  - `README.md`
  - `package.json`

## 3) 验证结果（当前）

- `npm test`：通过（118/118）
- `npm run build`：通过
- 已覆盖流式返回场景测试（chat 路径）

## 4) 当前建议的发布方式

在服务器项目目录执行：

```bash
npm run deploy
```

可选参数：

```bash
DEPLOY_BRANCH=main HEALTH_URL=http://127.0.0.1:3000 npm run deploy
SKIP_GIT_PULL=1 npm run deploy
```

## 5) 后续计划（建议顺序）

### 下一步（优先）

1. 接入错误监控平台（Sentry 或同类）
   - 捕获 API 错误栈、环境、请求 ID
   - 与日志联动实现“报错一跳定位”
2. 增加“超时/降级命中率”统计
   - 统计 `AI_TIMEOUT`、fallback 命中比例
   - 按日输出趋势，验证优化收益
3. 细化 smoke 检查
   - 增加 `/api/metrics`、`/api/plan/*` 的更强断言
   - 将 smoke 结果输出为机器可读 JSON（便于 CI/CD）

### 中期（项目化）

1. 建立 CI（test + build + smoke）
2. 建立发布审计（版本号、提交号、发布时间、执行人）
3. 增加性能基线（首 token 延迟、平均响应、p95 响应）

## 6) 已知风险与注意事项

- `npm run lint` 当前会进入 Next.js ESLint 初始化交互，不适合作为无人值守发布步骤。
- 构建日志中若出现 `Dynamic server usage`，通常是 Next 静态分析提示，不等于运行时错误；需结合实际 API 响应判断。

## 7) 交接说明

如果后续继续推进稳定性优化，建议优先围绕 `request_id` 做闭环：

- 先从告警拿到 `request_id`
- 再在服务日志检索对应请求的分阶段耗时
- 最后按阶段定位瓶颈（RAG / 模型 / DB / 网络）
