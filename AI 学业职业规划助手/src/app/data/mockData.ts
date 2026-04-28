export interface SimilarCase {
  id: string;
  title: string;
  summary: string;
  schoolLevel: "Top 10" | "Top 30" | "Top 50" | "Top 100";
  gpa: string;
  school: string;
  link: string;
  major: string;
}

export interface StudyTask {
  id: string;
  date: string;
  title: string;
  description: string;
  completed: boolean;
  tag: "学术" | "考试" | "申请" | "职业" | "技能";
}

export interface ProfileData {
  school: string;
  major: string;
  grade: string;
  gpa: string;
  targetSchool: string;
  targetMajor: string;
  intention: string;
  extraInfo: string;
}

export type CardType = "profile-form" | "study-plan" | "feedback" | null;

export interface Message {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  cardType?: CardType;
  cardData?: StudyTask[] | ProfileData;
  similarCases?: SimilarCase[];
}

export interface Session {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messages: Message[];
}

export const gradSchoolCases: SimilarCase[] = [
  {
    id: "c1",
    title: "双非本科逆袭 CMU CS 硕士",
    summary: "通过两段科研经历+实习+GT高分，从普通985到CMU MSCS，分享完整备考历程和文书策略。",
    schoolLevel: "Top 10",
    gpa: "3.8/4.0",
    school: "Carnegie Mellon University",
    major: "CS",
    link: "#",
  },
  {
    id: "c2",
    title: "工科转 CS — UCLA MCS 录取经验",
    summary: "机械工程背景跨专业申请，补修CS核心课程，刷题+项目双管齐下，最终斩获 UCLA MCS。",
    schoolLevel: "Top 30",
    gpa: "3.6/4.0",
    school: "UCLA",
    major: "CS",
    link: "#",
  },
  {
    id: "c3",
    title: "UIUC CS 硕士：推荐信策略全解析",
    summary: "三封推荐信的选择与沟通技巧，如何让教授写出有竞争力的推荐信。",
    schoolLevel: "Top 30",
    gpa: "3.5/4.0",
    school: "UIUC",
    major: "CS",
    link: "#",
  },
];

export const careerCases: SimilarCase[] = [
  {
    id: "c4",
    title: "应届生进入 Google SWE 的面试准备",
    summary: "LeetCode 300 题策略 + System Design + 行为面试，历时 4 个月成功上岸 Google。",
    schoolLevel: "Top 10",
    gpa: "3.7/4.0",
    school: "Google",
    major: "SWE",
    link: "#",
  },
  {
    id: "c5",
    title: "产品经理转型数据分析师经验",
    summary: "自学 Python、SQL、Tableau，通过 3 个数据项目和认证，6 个月内完成职业转型。",
    schoolLevel: "Top 50",
    gpa: "3.4/4.0",
    school: "Meta",
    major: "DA",
    link: "#",
  },
];

export const initialStudyPlan: StudyTask[] = [
  {
    id: "t1",
    date: "2026年5月",
    title: "GRE 考试备考",
    description: "完成 GRE Verbal 词汇积累，刷满 3 套 Mock Test，目标 Q 165+ V 155+",
    completed: false,
    tag: "考试",
  },
  {
    id: "t2",
    date: "2026年6月",
    title: "托福冲刺 100+",
    description: "针对口语和写作短板专项训练，预约7月考试日期",
    completed: false,
    tag: "考试",
  },
  {
    id: "t3",
    date: "2026年7月",
    title: "科研 / 实习经历补充",
    description: "联系导师参与实验室项目，或在 GitHub 完成 2 个可展示的技术项目",
    completed: false,
    tag: "学术",
  },
  {
    id: "t4",
    date: "2026年8月",
    title: "选校初步列表",
    description: "筛选 10-12 所目标学校，按冲刺/匹配/保底分类，收集申请截止日期",
    completed: false,
    tag: "申请",
  },
  {
    id: "t5",
    date: "2026年9-10月",
    title: "文书写作与修改",
    description: "完成 Personal Statement 初稿，与文书导师完成至少 3 轮修改",
    completed: false,
    tag: "申请",
  },
  {
    id: "t6",
    date: "2026年11月",
    title: "提交早申（EA/ED）",
    description: "优先提交截止日期早的学校，确保推荐信按时提交",
    completed: false,
    tag: "申请",
  },
];

const welcomeContent = `你好！我是 **Cyber Guide** 🎯

很高兴成为你的 AI 学业与职业规划助手。我可以帮助你：

- 📚 **学业规划** — 选课建议、GPA 提升策略、科研方向
- 🎓 **研究生申请** — 选校分析、文书指导、推荐信策略
- 💼 **职业发展** — 求职策略、简历优化、面试准备
- 🗺️ **转行规划** — 行业分析、技能路线图、过渡方案

你目前最想聊哪个方向？`;

const gradSchoolContent = `## CS 硕士申请准备指南

申请美国 CS 硕士需要从以下几个维度系统准备：

### 1. 学术背景强化

- **GPA 目标**：Top 30 项目通常要求 **3.5+**，Top 10 需要 **3.7+**
- **核心课程**：数据结构、算法、操作系统、数据库、计算机网络
- **科研经历**：发表论文或参与导师课题组将大幅提升竞争力

### 2. 标准化考试

| 考试 | 目标分数 | 备注 |
|------|---------|------|
| GRE | Q 165+ V 155+ | 部分学校已不要求 |
| 托福 | 100+，口语 22+ | 听说读写均衡 |
| 雅思 | 7.0+ | 部分学校接受 |

### 3. 申请材料清单

1. **Personal Statement** — 突出研究兴趣与职业目标
2. **推荐信** — 3 封，最好来自教授或业内导师
3. **简历（CV）** — 精炼 1-2 页，突出技术项目与成果
4. **成绩单** — 官方成绩单（含在读证明）

### 4. 选校策略

建议 **2-3 保底 + 3-4 匹配 + 2-3 冲刺** 共 8-10 所

---

*你目前处于哪个阶段？填写个人信息后我可以为你制定更个性化的规划方案。*`;

export function getAIResponse(userMessage: string): {
  content: string;
  cardType?: CardType;
  cardData?: any;
  similarCases?: SimilarCase[];
} {
  const msg = userMessage.toLowerCase();

  if (msg.includes("申请") || msg.includes("研究生") || msg.includes("硕士") || msg.includes("留学") || msg.includes("cs") || msg.includes("计算机")) {
    return { content: gradSchoolContent, similarCases: gradSchoolCases };
  }

  if (msg.includes("职业") || msg.includes("工作") || msg.includes("求职") || msg.includes("转行") || msg.includes("面试")) {
    return {
      content: `## 职业发展规划建议

根据你的问题，以下是系统性的职业规划思路：

### 短期目标（0-6 个月）

- **技能盘点**：列出现有技能树，识别与目标岗位的 Gap
- **项目积累**：在 GitHub 上构建 2-3 个可展示的实战项目
- **网络建设**：主动在 LinkedIn 联系目标公司员工，内推效率更高

### 中期布局（6-12 个月）

1. 刷题准备技术面试（LeetCode 200+ 题，重点 Medium）
2. 准备 System Design 知识体系（Grokking System Design）
3. 参加黑客松/竞赛，丰富简历亮点

### 求职时间线

> 秋招（8-10 月）和春招（3-5 月）是黄金窗口期，提前 **3-4 个月** 开始准备

---

*想让我具体分析你的目标岗位和当前背景吗？*`,
      similarCases: careerCases,
    };
  }

  if (msg.includes("简历") || msg.includes("cv") || msg.includes("resume")) {
    return {
      content: `## 简历优化核心策略

### 结构建议

\`\`\`
简历结构（1-2 页）
├── 个人信息（姓名、邮箱、GitHub、LinkedIn）
├── 教育背景（逆序，含 GPA、相关课程）
├── 技术技能（分类罗列：语言/框架/工具）
├── 项目经历（2-4 个，STAR 原则描述）
├── 实习/工作经历（量化成果）
└── 荣誉奖项（可选）
\`\`\`

### 内容写作技巧

- 使用 **动词开头**：Developed / Optimized / Designed / Led
- **量化成果**：提升性能 30%、处理 10万+ 日活��减少延迟 200ms
- 针对 JD **定制关键词**，通过 ATS 系统筛选

### 常见错误

- ❌ 写"负责了某功能" → ✅ 写"独立设计并实现了..."
- ❌ 列技能列表不说程度 → ✅ 标注 Proficient / Familiar
- ❌ 超过 2 页内容冗余 → ✅ 只保留最相关的经历

---

*发送你的简历草稿，我可以给出具体修改建议。*`,
      similarCases: careerCases,
    };
  }

  if (msg.includes("画像") || msg.includes("信息") || msg.includes("背景") || msg.includes("个人")) {
    return {
      content: "为了给你制定更精准、个性化的规划方案，请填写你的基本信息：",
      cardType: "profile-form",
    };
  }

  if (msg.includes("计划") || msg.includes("时间表") || msg.includes("安排") || msg.includes("路线")) {
    return {
      content: `根据你的情况，我为你定制了以下学习规划时间表。你可以直接在卡片中跟踪完成进度 ✅`,
      cardType: "study-plan",
      cardData: initialStudyPlan,
    };
  }

  if (msg.includes("反馈") || msg.includes("评价") || msg.includes("满意") || msg.includes("建议")) {
    return {
      content: "非常感谢你使用 Cyber Guide！你的反馈对我们至关重要，请花 1 分钟告诉我你的体验：",
      cardType: "feedback",
    };
  }

  // Default response
  return {
    content: `感谢你的提问！我理解你想了解关于 **"${userMessage.slice(0, 20)}${userMessage.length > 20 ? "..." : ""}"** 的相关内容。

作为你的学业与职业规划助手，我建议从以下角度来思考这个问题：

1. **明确目标**：你希望达到的短期和长期目标是什么？
2. **现状评估**：当前的优势和需要提升的地方？
3. **行动计划**：具体可执行的步骤和时间节点

你可以尝试更具体地描述你的背景和诉求，例如：
- 你的学校、专业、年级和 GPA
- 你的目标（申请研究生 / 求职 / 转行）
- 你最大的困惑点

这样我可以给出更有针对性的建议！`,
  };
}

export const initialSession: Session = {
  id: "session-1",
  title: "CS 研究生申请规划",
  preview: "我想申请美国计算机科学硕士...",
  timestamp: new Date(),
  messages: [
    {
      id: "msg-0",
      type: "ai",
      content: welcomeContent,
      timestamp: new Date(Date.now() - 300000),
    },
    {
      id: "msg-1",
      type: "user",
      content: "我想申请美国计算机科学硕士项目，需要做哪些准备？",
      timestamp: new Date(Date.now() - 240000),
    },
    {
      id: "msg-2",
      type: "ai",
      content: gradSchoolContent,
      timestamp: new Date(Date.now() - 235000),
      similarCases: gradSchoolCases,
    },
  ],
};

export const historySessions: Session[] = [
  {
    id: "session-2",
    title: "数据科学转行指南",
    preview: "我是一名产品经理，想转型做数据分析...",
    timestamp: new Date(Date.now() - 86400000),
    messages: [],
  },
  {
    id: "session-3",
    title: "简历优化建议",
    preview: "帮我看看这份简历有什么问题...",
    timestamp: new Date(Date.now() - 172800000),
    messages: [],
  },
  {
    id: "session-4",
    title: "MIT vs Stanford 选校分析",
    preview: "我同时收到了 MIT 和 Stanford 的 offer...",
    timestamp: new Date(Date.now() - 604800000),
    messages: [],
  },
];

export const quickSuggestions = [
  "如何提升 GPA 和科研经历？",
  "帮我制定申请时间计划表",
  "分析我的背景竞争力",
  "推荐适合我的学校列表",
  "文书写作有哪些技巧？",
  "如何联系并请到好推荐人？",
];
