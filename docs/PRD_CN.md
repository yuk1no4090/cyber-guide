# Cyber Guide 产品需求文档 (PRD)

## 1. 产品定位

Cyber Guide 是一款面向学生和职场新人的 AI 陪伴产品。
产品聚焦于学习规划、职业规划以及不确定时期的情绪支持。

本版本以简历导向的工程目标进行重构：

- 主流全栈架构（Java + React + Python）
- 清晰的领域边界（DDD 四层架构）
- 真实数据管线（crawler -> db -> rag -> chat）
- 生产级基础设施（JWT 认证、Redis 缓存、熔断器、分布式限流）
- 可部署系统，Docker Compose 一键启动

## 2. 目标与非目标

### 2.1 目标

- 通过多轮对话提供有效的规划支持
- 生成并跟踪 7 天行动计划
- 通过爬虫持续采集公开的规划相关内容
- 使用本地 RAG 证据增强模型输出
- 交付面向面试讨论的生产级架构

### 2.2 非目标

- 医学诊断或临床治疗指导
- 无限制地爬取社交媒体私人数据
- 缺乏人类可读证据的全自动推荐

## 3. 目标用户

- 有方向焦虑的计算机专业学生（本科/硕士）
- 准备实习/求职的应届毕业生
- 考虑下一步转型的职场新人

## 4. 核心用户旅程

### 4.1 旅程 A：对话引导

1. 用户打开聊天界面，前端通过 `/api/auth/anonymous` 获取匿名 JWT
2. 用户描述困惑（学习/求职/技能）
3. 消息管线：PII 脱敏 -> 危机检测 -> RAG 检索 -> AI 补全 -> 响应解析
4. 模型返回回复 + 建议标签
5. 用户继续追问

成功指标：

- 中位对话轮次 >= 5
- 用户反馈平均分 >= 7/10

### 4.2 旅程 B：7 天计划

1. 用户请求生成计划
2. 系统根据上下文生成 7 天任务（AI + 备选池）
3. 用户标记任务完成/跳过
4. 用户可重新生成某一天的任务
5. 系统按会话维护进度状态（Redis 缓存，PostgreSQL 持久化）

成功指标：

- 计划生成成功率 >= 98%
- 日状态更新成功率 >= 99%

### 4.3 旅程 C：爬虫驱动的建议

1. 定时爬虫抓取公开文章/帖子
2. 数据清洗器去重并评估质量
3. 后端向前端暴露精选记录（Redis 缓存，TTL 1h）
4. 用户看到"近期实用建议"面板
5. 对话/RAG 可引用爬虫支撑的证据

成功指标：

- 每日爬取任务成功率 >= 95%
- 重复率 < 20%

## 5. 功能需求

### 5.1 前端（Next.js 15 + React 19 + TypeScript + Tailwind CSS）

- 聊天 UI，支持 NDJSON 流式渲染和建议标签
- 档案模式（自我/他人）及报告生成
- 场景选择器，用于角色扮演练习
- 7 天计划卡片，支持状态操作（完成/跳过/重新生成）
- 反馈提交及质量评分展示
- 对话回顾卡片
- JWT 令牌生命周期（自动获取、localStorage 缓存、401 自动刷新）

### 5.2 后端（Java 21 + Spring Boot 3.3 + JPA + PostgreSQL + Redis）

认证：
- `POST /api/auth/anonymous` — 签发匿名 JWT 令牌

对话：
- `POST /api/chat` — 流式（NDJSON）和 JSON 响应
- `POST /api/chat/stream` — 专用流式端点

反馈：
- `POST /api/feedback` — 含 PII 脱敏和质量评分

计划：
- `GET /api/plan/fetch?session_id=` — 获取计划（Redis 缓存）
- `POST /api/plan/generate` — 生成 7 天计划
- `PUT /api/plan/status` — 更新日状态
- `POST /api/plan/regenerate` — 重新生成单日

爬虫数据：
- `GET /api/crawler/articles` — 文章列表（Redis 缓存，TTL 1h）

基础设施：
- 全局异常处理器，统一错误码
- TraceId 过滤器（MDC + X-Trace-Id 响应头）
- Resilience4j 熔断器 + AI 调用重试
- Redis 分布式限流（Lua 原子脚本）
- Redis 多 TTL 缓存，含穿透/雪崩/击穿防护

### 5.3 爬虫（Python）

- 数据源配置与调度（可配置间隔，默认 6h）
- 公开页面抓取 + 解析 + 标准化
- 重复检测（dedupe hash）与持久化
- 结构化输出至 PostgreSQL

## 6. 非功能需求

- 可用性目标：99.5%
- p95 后端延迟：
  - 对话首字节 < 3s
  - 非对话 API < 600ms
- 所有服务容器化，一键启动（`docker compose up`）
- 敏感字段不以明文记录日志（管线中 PII 脱敏）
- Redis 优雅降级：缓存故障回退至数据库，不阻塞请求
- 熔断器：AI 服务失败率 >50% 触发断路，30s 后自动恢复

## 7. 合规与安全

- 危机关键词检测及紧急转介响应（热线：400-161-9995）
- 默认隐私保护：
  - 指标和可选日志为 opt-in
  - 持久化前 PII 脱敏（手机号、邮箱、身份证号模式）
- 爬虫仅采集公开页面，适用时遵守 robots 策略
- JWT 无状态认证 — 无服务端会话存储

## 8. 里程碑

- 阶段 0：文档与契约 — 已完成
- 阶段 1：后端服务（Spring Boot + JPA + PostgreSQL）— 已完成
- 阶段 2：前端迁移至独立后端（JWT 认证）— 已完成
- 阶段 3：爬虫模块与洞察集成 — 已完成
- 阶段 4：容器化部署（Docker Compose）与 CI — 已完成
- 阶段 5：工程加固 — 已完成
  - 全局异常处理 + 错误码
  - Spring Security + JWT 认证
  - Resilience4j 熔断器 + 重试
  - 策略模式（ChatStrategy）+ 责任链模式（MessagePipeline）
  - Spring Events（异步分析）
  - DDD 四层包结构
- 阶段 6：Redis 缓存层 — 已完成
  - RedisTemplate + Jackson 序列化
  - 多 TTL CacheManager（rag 30min、plan 10min、articles 1h）
  - CacheGuard：穿透/雪崩/击穿防护
  - 分布式限流器（Redis INCR + Lua 脚本）

## 9. 简历亮点

架构与设计模式：
- 全栈分离：Java 后端 + React 前端 + Python 爬虫
- DDD 四层架构（domain / application / infrastructure / interfaces）
- 策略模式实现多模式对话（default、crisis、scenario）
- 责任链模式实现消息处理管线（redact -> moderate -> RAG -> AI -> parse）
- 基于 Spring ApplicationEvent 的事件驱动架构（异步分析）
- Cache-Aside 模式保障数据一致性

后端工程：
- Java 21 + Spring Boot 3.3 + Spring Security + JPA
- 无状态 JWT 认证（匿名会话令牌）
- Resilience4j 熔断器 + 重试 + 备用模型
- Redis 多层缓存 + TTL 抖动（雪崩防护）
- 缓存穿透防护（null 哨兵）+ 击穿防护（本地锁 + 双重检查）
- 基于 Redis Lua 原子脚本的分布式限流
- 全局异常处理 + 统一错误码 + trace ID 传播
- NDJSON 流式响应，实现实时 AI 输出

数据管线：
- Python 爬虫，支持调度、去重和质量评分
- PostgreSQL 表设计，含索引和唯一约束
- 本地 RAG 检索（关键词 + bigram 评分）+ Redis 缓存结果

基础设施：
- Docker Compose 一键部署（backend + frontend + PostgreSQL + Redis + crawler）
- Logback MDC trace ID 实现请求级日志关联
- Actuator 健康检查（DB + Redis + 熔断器状态）
- 优雅降级：Redis 故障不阻塞核心功能
