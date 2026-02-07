import { NextRequest, NextResponse } from 'next/server';
import { openai, CHAT_MODEL } from '@/lib/openai';
import { checkModeration, CRISIS_RESPONSE } from '@/lib/moderation';
import { retrieve, formatEvidence } from '@/lib/rag';
import { getSystemPrompt } from '@/lib/prompt';
import { saveCaseCard, Message } from '@/lib/logger';

// 必须使用 Node.js runtime（因为用到 fs 模块）
export const runtime = 'nodejs';

// 成本控制
const MAX_HISTORY_MESSAGES = 12;
const MAX_OUTPUT_TOKENS = 600;

export interface ChatRequest {
  messages: Message[];
  optIn: boolean;
}

export interface ChatResponse {
  message: string;
  suggestions: string[];
  isCrisis?: boolean;
}

/**
 * 截断对话历史
 */
function truncateHistory(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}

/**
 * 从 AI 回复中解析出建议标签
 * 格式：【建议】建议1 | 建议2 | 建议3
 */
function parseSuggestions(text: string): { message: string; suggestions: string[] } {
  // 匹配【建议】后面的内容
  const regex = /【建议】(.+?)$/m;
  const match = text.match(regex);

  if (match) {
    const suggestions = match[1]
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length <= 20);

    // 移除建议行，清理尾部空行
    const message = text.replace(regex, '').trimEnd();

    return { message, suggestions };
  }

  return { message: text, suggestions: [] };
}

// 危机场景的建议
const CRISIS_SUGGESTIONS = [
  '我现在需要有人陪',
  '可以告诉我更多求助方式吗',
  '我想聊点别的',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequest;
    const { messages, optIn } = body;

    // 验证请求
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages 数组不能为空' },
        { status: 400 }
      );
    }

    // 获取最新的用户消息
    const lastUserMessage = [...messages]
      .reverse()
      .find(m => m.role === 'user');

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: '没有找到用户消息' },
        { status: 400 }
      );
    }

    // 1. 安全检查
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

    // 2. RAG 检索
    const retrievalResults = retrieve(lastUserMessage.content, 3);
    const evidence = formatEvidence(retrievalResults);

    // 3. 构建 prompt
    const systemPrompt = getSystemPrompt() + evidence;

    // 4. 截断历史
    const truncatedMessages = truncateHistory(messages, MAX_HISTORY_MESSAGES);

    // 5. 调用 API
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

    // 6. 解析建议
    const { message: assistantMessage, suggestions } = parseSuggestions(rawMessage);

    // 7. 保存日志
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
