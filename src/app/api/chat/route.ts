import { NextRequest, NextResponse } from 'next/server';
import { openai, CHAT_MODEL } from '@/lib/openai';
import { checkModeration, CRISIS_RESPONSE } from '@/lib/moderation';
import { retrieve, formatEvidence } from '@/lib/rag';
import { getSystemPrompt } from '@/lib/prompt';
import { saveCaseCard, Message } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_HISTORY_MESSAGES = 12;
const MAX_OUTPUT_TOKENS = 600;
const MAX_REPORT_TOKENS = 1200;

export interface ChatRequest {
  messages: Message[];
  optIn: boolean;
  mode?: 'chat' | 'profile' | 'generate_report';
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
 */
function fallbackSuggestions(userMessage: string): string[] {
  const text = userMessage.toLowerCase();

  if (text.includes('考研') || text.includes('保研') || text.includes('留学')) {
    return ['耗子你当时怎么选的', '我其实还没想好', '能具体聊聊吗'];
  }
  if (text.includes('拖延') || text.includes('不想动') || text.includes('不想学')) {
    return ['有没有坚持的方法', '我也不知道为什么', '是不是我太懒了'];
  }
  if (text.includes('迷茫') || text.includes('方向') || text.includes('规划')) {
    return ['我不知道自己喜欢什么', '能分享你的经验吗', '感觉什么都想学又什么都不会'];
  }
  if (text.includes('焦虑') || text.includes('压力') || text.includes('难受')) {
    return ['最近压力确实大', '有什么放松的办法吗', '其实还有一件事...'];
  }

  // 通用兜底
  return ['能展开聊聊吗', '耗子你怎么看', '其实我还想说...'];
}

const CRISIS_SUGGESTIONS = [
  '我现在需要有人陪',
  '可以告诉我更多求助方式吗',
  '我想聊点别的',
];

// 画像模式 prompt
const PROFILE_SYSTEM_PROMPT = `你是耗子🐭，现在进入"画像分析师"模式。通过轻松的对话了解用户，每次只问一个问题。

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
- 自称"耗子"或"我"
- 偶尔自嘲

## 格式
每次回复最后一行附带建议：
【建议】建议1 | 建议2 | 结束画像，看看分析`;

// 报告 prompt
const REPORT_SYSTEM_PROMPT = `你是耗子🐭。根据对话内容生成一份用户画像报告。

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

### 💡 耗子的建议

（2-3 条具体可行的建议，耗子的语气，可以直接一点）

### 🌟 一句话

（真诚的、个性化的鼓励，不要鸡汤。可以用耗子的风格，比如"反正老鼠不怕摔"）

---
注意：基于对话真实信息，没聊到就写"暂未了解"，不编造。`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequest;
    const { messages, optIn, mode = 'chat' } = body;

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

      if (optIn) {
        await saveCaseCard([
          ...messages,
          { role: 'assistant', content: CRISIS_RESPONSE }
        ]);
      }

      return NextResponse.json({
        message: CRISIS_RESPONSE,
        suggestions: CRISIS_SUGGESTIONS,
        isCrisis: true,
      } as ChatResponse);
    }

    // ===== 生成报告模式 =====
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

    // ===== 画像对话模式（低温度，更稳定） =====
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
        || '抱歉，耗子卡壳了 😵';

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
      || '抱歉，耗子现在脑子转不动了 😵 稍后再试试。';

    // 解析建议，没有则用兜底建议
    const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);
    const finalSuggestions = suggestions.length > 0
      ? suggestions
      : fallbackSuggestions(lastUserMessage.content);

    if (optIn) {
      await saveCaseCard([
        ...messages,
        { role: 'assistant', content: assistantMessage }
      ]);
    }

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
