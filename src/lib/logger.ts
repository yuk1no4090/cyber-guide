import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { redact } from './redact';

const DATA_DIR = path.join(process.cwd(), 'data');
const CASE_CARDS_FILE = path.join(DATA_DIR, 'case_cards.jsonl');

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CaseCard {
  id: string;
  timestamp: string;
  sessionHash: string;
  summary: {
    conversationTurns: number;
    userMessageCount: number;
    assistantMessageCount: number;
  };
  redactedSnippets: string[];
}

/**
 * 生成会话哈希
 */
function hashSessionId(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * 保存脱敏后的案例卡片（异步，Vercel 无文件系统时优雅降级）
 */
export async function saveCaseCard(
  messages: Message[],
  sessionId?: string
): Promise<void> {
  try {
    // 动态导入 fs，避免在不支持文件系统的环境下直接崩溃
    const fs = await import('fs/promises');
    const fsSync = await import('fs');

    // 确保目录存在
    if (!fsSync.existsSync(DATA_DIR)) {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }

    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    const redactedSnippets = messages
      .filter(m => m.role !== 'system')
      .slice(-6)
      .map(m => `[${m.role.toUpperCase()}] ${redact(m.content).slice(0, 200)}...`);

    const caseCard: CaseCard = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      sessionHash: sessionId ? hashSessionId(sessionId) : 'anonymous',
      summary: {
        conversationTurns: Math.floor(messages.filter(m => m.role !== 'system').length / 2),
        userMessageCount: userMessages.length,
        assistantMessageCount: assistantMessages.length,
      },
      redactedSnippets,
    };

    await fs.appendFile(
      CASE_CARDS_FILE,
      JSON.stringify(caseCard) + '\n',
      'utf-8'
    );
  } catch (error) {
    // Vercel serverless 等无持久化文件系统的环境会走到这里，静默降级
    console.warn('[LOGGER] Failed to save case card (expected on serverless):', 
      error instanceof Error ? error.message : 'unknown error'
    );
  }
}
