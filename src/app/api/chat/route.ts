import { NextRequest, NextResponse } from 'next/server';
import { openai, CHAT_MODEL } from '@/lib/openai';
import { checkModeration, CRISIS_RESPONSE } from '@/lib/moderation';
import { retrieve, formatEvidence } from '@/lib/rag';
import { getSystemPrompt } from '@/lib/prompt';
import { Message } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_HISTORY_MESSAGES = 12;
const MAX_OUTPUT_TOKENS = 600;
const MAX_REPORT_TOKENS = 1200;

export interface ChatRequest {
  messages: Message[];
  mode?: 'chat' | 'profile' | 'profile_other' | 'generate_report' | 'generate_report_other';
}

export interface ChatResponse {
  message: string;
  suggestions: string[];
  isCrisis?: boolean;
  isReport?: boolean;
}

/**
 * 智能截断：始终保留前 2 条消息（用户自我介绍），再保留最近的消息
 */
function smartTruncate(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;

  // 保留前 2 条（通常是欢迎+用户第一句话，包含关键身份信息）
  const head = messages.slice(0, 2);
  // 保留最近的消息
  const tail = messages.slice(-(maxMessages - 2));

  return [...head, ...tail];
}

/**
 * 从 AI 回复中解析建议标签
 */
function parseSuggestions(text: string): { message: string; suggestions: string[] } {
  const regex = /【建议】(.+?)$/m;
  const match = text.match(regex);

  if (match) {
    const suggestions = match[1]
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length <= 20);
    const message = text.replace(regex, '').trimEnd();
    return { message, suggestions };
  }

  return { message: text, suggestions: [] };
}

/**
 * 根据用户最新消息生成兜底建议（AI 没返回【建议】时使用）
 * 写法原则：像用户心里正在想的话，不像选项按钮
 */
function fallbackSuggestions(userMessage: string): string[] {
  const text = userMessage.toLowerCase();

  if (text.includes('考研') || text.includes('保研') || text.includes('留学')) {
    return ['说实话我还没完全想清楚', '小舟你当时纠结了多久', '我怕选错了回不了头'];
  }
  if (text.includes('拖延') || text.includes('不想动') || text.includes('不想学')) {
    return ['一拿起手机时间就没了', '有没有那种很小的第一步', '说实话我连开始都害怕'];
  }
  if (text.includes('迷茫') || text.includes('方向') || text.includes('规划')) {
    return ['什么都试了一点但都不深入', '你是怎么确定方向的', '我怕选错了浪费时间'];
  }
  if (text.includes('焦虑') || text.includes('压力') || text.includes('难受')) {
    return ['最近确实绷得有点紧', '你有没有过这种感觉', '其实还有件事一直憋着没说'];
  }
  if (text.includes('比') || text.includes('差距') || text.includes('不如')) {
    return ['有时候觉得是不是我太菜了', '可我也不是没努力过', '怎么才能不去比较啊'];
  }

  if (text.length < 20) {
    return ['最近和朋友闹了点矛盾', '就是什么都不想做很烦', '考试/工作上遇到了麻烦'];
  }

  return ['其实最让我难受的是...', '你说得对我是在逃避', '还有一件事一直没说'];
}

const CRISIS_SUGGESTIONS = [
  '我现在需要有人陪',
  '可以告诉我更多求助方式吗',
  '我想聊点别的',
];

// 画像模式 prompt
const PROFILE_SYSTEM_PROMPT = `你是小舟🛶，现在进入"画像分析师"模式。通过轻松的对话了解用户，每次只问一个问题。

## 你要了解的维度（自然展开，不要一次全问）

1. **基本情况**：在读/已毕业？什么专业？大几？
2. **当前状态**：最近在忙什么？心情怎么样？
3. **优势与兴趣**：觉得自己擅长什么？对什么感兴趣？
4. **困扰与焦虑**：最近最烦的事情是什么？
5. **目标与方向**：有没有想做的事？
6. **行动力**：想到就做，还是想很多但不太动？
7. **社交风格**：喜欢独处还是和朋友一起？

## 风格
- 每次只问 1 个问题
- 语气轻松，"哈哈确实""能理解"
- 自称"小舟"或"我"
- 偶尔自嘲

## 建议的铁律
每条建议必须是「用户的真实回答」，不是指令。用户点击后会直接发送给你，所以必须有信息量。
- ❌ "先描述一个具体场景" ← 这是指令，你收到后还是不知道内容
- ✅ "我对 AI 方向挺感兴趣的" ← 这是真实回答，你能继续往下聊

## 格式
每次回复最后一行附带建议：
【建议】建议1 | 建议2 | 结束画像，看看分析`;

// "读人"模式 prompt
const PROFILE_OTHER_SYSTEM_PROMPT = `你是小舟🛶，现在进入"读人"模式。用户想了解/分析身边的一个人。你的任务是通过提问帮用户描述清楚那个人。

## 你要了解的维度

1. **关系**：那个人是用户的什么人？（同学/室友/同事/领导/朋友/家人/暧昧对象）
2. **基本信息**：大概多大？做什么的？
3. **性格特征**：平时是什么样的人？外向还是内向？
4. **关键事件**：发生了什么事让用户想分析 ta？
5. **相处困惑**：用户在和 ta 相处中遇到什么问题？
6. **用户的期望**：用户希望和 ta 达成什么关系/结果？

## 风格
- 每次只问 1 个问题
- 语气像朋友在八卦聊天，但带分析
- 可以边问边给小观察："听起来 ta 可能是那种..."
- 自称"小舟"

## 建议的铁律
每条建议必须是「用户的真实回答」，不是指令。
- ❌ "先描述一个具体场景" ← 指令，没信息
- ✅ "ta 总是不打招呼就用我的东西" ← 真实描述，有信息
- ❌ "回忆最近一次困惑的互动" ← 指令
- ✅ "上次 ta 当着别人面说我的方案有问题" ← 有具体事件

## 格式
每次回复最后一行附带建议：
【建议】建议1 | 建议2 | 结束画像，看看分析`;

// "读人"报告 prompt
const REPORT_OTHER_SYSTEM_PROMPT = `你是小舟🛶。根据对话内容分析用户描述的那个人，生成一份"读人报告"。

## 最重要的规则：信息不够就不要硬写！

在生成报告前，先判断用户是否提供了足够的具体信息：
- 用户是否描述了 ta 的**具体行为**（不只是"让我头疼"）？
- 用户是否提供了**至少 1-2 个具体事例**？
- 你能否从对话中提取出有依据的判断？

**如果信息严重不足**（用户只说了关系和笼统感受，没有具体行为/事例），你必须这样回复：

"🛶 小舟觉得现在的信息还不太够生成一份靠谱的报告。

我目前只知道：
- （列出你知道的 1-2 点）

要画出一个人的画像，小舟至少需要知道：
- ta 做过什么让你印象深刻的事？
- ta 平时说话是什么风格？
- 有没有一件具体的事让你对 ta 产生了现在的看法？

我们继续聊聊？聊得越具体，报告越准 😊"

然后不要生成报告格式的内容。

**只有在信息充足时**，才用以下格式：

### 🔍 ta 的画像

**一句话概括**：（基于真实信息的概括）

### 📊 性格分析

| 维度 | 分析 |
|---|---|
| 🎭 性格类型 | （必须有依据，没依据就写"信息不足"） |
| 💬 沟通风格 | （同上） |
| ⚡ 行为模式 | （同上） |
| 🎯 核心需求 | （同上） |
| ⚠️ 雷区 | （同上） |

### 🤝 相处建议

（3-4 条具体策略，必须基于用户描述的情况）

### 💡 一句话

（犀利但有依据的洞察）

---
核心原则：**有几分证据说几分话**。宁可报告短一点、留白多一点，也不要编造。`;

// 自我报告 prompt
const REPORT_SYSTEM_PROMPT = `你是小舟🛶。根据对话内容生成一份用户画像报告。

## 格式

### 🎯 你的画像

**一句话概括**：（用一句生动的话描述这个人）

### 📊 维度分析

| 维度 | 分析 |
|---|---|
| 🎓 当前阶段 | （在读/毕业，专业方向） |
| 💪 核心优势 | （2-3个突出特点） |
| 🔥 兴趣方向 | （对什么感兴趣） |
| 😰 主要困扰 | （当前面临的挑战） |
| 🎯 目标清晰度 | ⭐⭐⭐☆☆（1-5星） |
| ⚡ 行动力 | ⭐⭐⭐☆☆（1-5星） |
| 🤝 社交偏好 | （内向/外向/灵活型） |

### 💡 小舟的建议

（2-3 条具体可行的建议，小舟的语气，可以直接一点）

### 🌟 一句话

（真诚的、个性化的鼓励，不要鸡汤。可以用小舟的风格，比如"水再深，小舟也能飘过去"）

---
## 最重要的规则：信息不够就不要硬写！

在生成前先判断：用户是否回答了至少 3 个维度的具体内容？
- 如果是 → 正常生成报告
- 如果不是 → 回复"小舟觉得现在聊的还不太够，要不要再多说几句？我们可以继续聊聊你的 [缺失的维度]"，然后不要输出报告格式

核心原则：**有几分信息说几分话**，没聊到的就写"暂未了解"，绝不编造。`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequest;
    const { messages, mode = 'chat' } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages 数组不能为空' },
        { status: 400 }
      );
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find(m => m.role === 'user');

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: '没有找到用户消息' },
        { status: 400 }
      );
    }

    // 安全检查
    const moderationResult = checkModeration(lastUserMessage.content);

    if (moderationResult.isCrisis) {
      console.log('[CRISIS DETECTED]', {
        crisisKeywordsFound: moderationResult.crisisKeywordsFound,
      });

      return NextResponse.json({
        message: CRISIS_RESPONSE,
        suggestions: CRISIS_SUGGESTIONS,
        isCrisis: true,
      } as ChatResponse);
    }

    // ===== 生成"读人"报告 =====
    if (mode === 'generate_report_other') {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: REPORT_OTHER_SYSTEM_PROMPT },
          ...messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: '请根据我们刚才的对话，分析一下这个人，生成读人报告。' },
        ],
        temperature: 0.5,
        max_tokens: MAX_REPORT_TOKENS,
      });

      const report = completion.choices[0]?.message?.content?.trim()
        || '抱歉，暂时无法生成报告。';

      return NextResponse.json({
        message: report,
        suggestions: [],
        isCrisis: false,
        isReport: true,
      } as ChatResponse);
    }

    // ===== 生成自我画像报告 =====
    if (mode === 'generate_report') {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: REPORT_SYSTEM_PROMPT },
          ...messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: '请根据我们刚才的对话，生成我的画像分析报告。' },
        ],
        temperature: 0.5,
        max_tokens: MAX_REPORT_TOKENS,
      });

      const report = completion.choices[0]?.message?.content?.trim()
        || '抱歉，暂时无法生成报告。';

      return NextResponse.json({
        message: report,
        suggestions: [],
        isCrisis: false,
        isReport: true,
      } as ChatResponse);
    }

    // ===== "读人"对话模式 =====
    if (mode === 'profile_other') {
      const truncatedMessages = smartTruncate(messages, MAX_HISTORY_MESSAGES);

      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: PROFILE_OTHER_SYSTEM_PROMPT },
          ...truncatedMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        temperature: 0.6,
        max_tokens: MAX_OUTPUT_TOKENS,
      });

      const rawMessage = completion.choices[0]?.message?.content?.trim()
        || '抱歉，小舟卡壳了 😵';

      const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);

      return NextResponse.json({
        message: assistantMessage,
        suggestions: suggestions.length > 0 ? suggestions : ['继续描述 ta', '结束画像，看看分析'],
        isCrisis: false,
      } as ChatResponse);
    }

    // ===== 自我画像对话模式 =====
    if (mode === 'profile') {
      const truncatedMessages = smartTruncate(messages, MAX_HISTORY_MESSAGES);

      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: PROFILE_SYSTEM_PROMPT },
          ...truncatedMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        temperature: 0.5,
        max_tokens: MAX_OUTPUT_TOKENS,
      });

      const rawMessage = completion.choices[0]?.message?.content?.trim()
        || '抱歉，小舟卡壳了 😵';

      const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);

      return NextResponse.json({
        message: assistantMessage,
        suggestions: suggestions.length > 0 ? suggestions : ['继续聊聊', '结束画像，看看分析'],
        isCrisis: false,
      } as ChatResponse);
    }

    // ===== 普通聊天模式（高温度，更有个性） =====
    const retrievalResults = retrieve(lastUserMessage.content, 3);
    const evidence = formatEvidence(retrievalResults);
    const systemPrompt = getSystemPrompt() + evidence;
    const truncatedMessages = smartTruncate(messages, MAX_HISTORY_MESSAGES);

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...truncatedMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: 0.75,
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    const rawMessage = completion.choices[0]?.message?.content?.trim()
      || '抱歉，小舟现在脑子转不动了 😵 稍后再试试。';

    // 解析建议，没有则用兜底建议
    const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
    const finalSuggestions = suggestions.length > 0
      ? suggestions
      : fallbackSuggestions(lastUserMessage.content);

    return NextResponse.json({
      message: assistantMessage,
      suggestions: finalSuggestions,
      isCrisis: false,
    } as ChatResponse);

  } catch (error) {
    console.error('[CHAT API ERROR]', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后再试' },
      { status: 500 }
    );
  }
}
