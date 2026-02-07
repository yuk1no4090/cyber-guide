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

function truncateHistory(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}

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

const CRISIS_SUGGESTIONS = [
  '我现在需要有人陪',
  '可以告诉我更多求助方式吗',
  '我想聊点别的',
];

// 画像模式的 system prompt
const PROFILE_SYSTEM_PROMPT = `你是 Cyber Guide 的"画像分析师"模式。你的任务是通过轻松的对话了解用户，每次只问一个问题。

## 你要了解的维度（不要一次全问，自然地展开）

1. **基本情况**：在读/已毕业？什么专业？大几？
2. **当前状态**：最近在忙什么？心情怎么样？
3. **优势与兴趣**：觉得自己擅长什么？对什么感兴趣？
4. **困扰与焦虑**：最近最烦的事情是什么？
5. **目标与方向**：有没有想做的事？短期/长期的想法？
6. **行动力**：是想到就做的类型，还是想很多但不太动？
7. **社交风格**：喜欢独处还是和朋友一起？遇到困难会找人聊吗？

## 对话风格
- 每次只问 1 个问题，不要连环追问
- 语气轻松，像朋友闲聊不是做问卷
- 根据用户回答自然地追问或跳到下一个维度
- 适当给一些简短的回应（"哈哈确实"、"能理解"）再问下一个

## 格式
每次回复最后一行附带建议：
【建议】建议1 | 建议2 | 结束画像，看看分析`;

// 生成报告的 system prompt
const REPORT_SYSTEM_PROMPT = `你是 Cyber Guide 的"画像分析师"。根据之前的对话内容，生成一份用户画像分析报告。

## 报告格式要求

用以下结构输出（用 markdown 格式）：

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

### 💡 学长建议

（针对这个人的具体情况，给 2-3 条实际可行的建议，每条 1-2 句话）

### 🌟 一句鼓励

（根据他的特点，给一句真诚的、个性化的鼓励，不要鸡汤）

---
注意：报告要基于对话中的真实信息，没聊到的维度就写"暂未了解"，不要编造。语气温暖但不虚伪。`;

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

    // 安全检查（所有模式都需要）
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
        temperature: 0.6,
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

    // ===== 画像对话模式 =====
    if (mode === 'profile') {
      const truncatedMessages = truncateHistory(messages, MAX_HISTORY_MESSAGES);

      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: PROFILE_SYSTEM_PROMPT },
          ...truncatedMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        temperature: 0.7,
        max_tokens: MAX_OUTPUT_TOKENS,
      });

      const rawMessage = completion.choices[0]?.message?.content?.trim()
        || '抱歉，我现在无法回复。';

      const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);

      return NextResponse.json({
        message: assistantMessage,
        suggestions,
        isCrisis: false,
      } as ChatResponse);
    }

    // ===== 普通聊天模式 =====
    const retrievalResults = retrieve(lastUserMessage.content, 3);
    const evidence = formatEvidence(retrievalResults);
    const systemPrompt = getSystemPrompt() + evidence;
    const truncatedMessages = truncateHistory(messages, MAX_HISTORY_MESSAGES);

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...truncatedMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: 0.7,
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    const rawMessage = completion.choices[0]?.message?.content?.trim()
      || '抱歉，我现在无法回复。请稍后再试。';

    const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);

    if (optIn) {
      await saveCaseCard([
        ...messages,
        { role: 'assistant', content: assistantMessage }
      ]);
    }

    return NextResponse.json({
      message: assistantMessage,
      suggestions,
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
