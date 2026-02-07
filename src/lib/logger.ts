import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { redact } from './redact';

const DATA_DIR = path.join(process.cwd(), 'data');
const CASE_CARDS_FILE = path.join(DATA_DIR, 'case_cards.jsonl');

// 确保数据目录存在（同步版本，初始化用）
function ensureDataDirSync() {
  if (!fsSync.existsSync(DATA_DIR)) {
    fsSync.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 确保数据目录存在（异步版本）
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

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
 * 生成会话哈希（用于关联同一会话的多条记录，但不暴露原始 ID）
 */
function hashSessionId(sessionId: string): string {
  // 简单哈希实现（生产环境应使用 crypto）
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * 保存脱敏后的案例卡片（异步版本）
 */
export async function saveCaseCard(
  messages: Message[],
  sessionId?: string
): Promise<void> {
  await ensureDataDir();
  
  // 过滤出用户和助手消息
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  
  // 创建脱敏后的摘要
  const redactedSnippets = messages
    .filter(m => m.role !== 'system')
    .slice(-6) // 只保留最后几轮
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
  
  // 追加写入 JSONL 文件
  await fs.appendFile(
    CASE_CARDS_FILE,
    JSON.stringify(caseCard) + '\n',
    'utf-8'
  );
}

/**
 * 读取所有案例卡片
 */
export async function readCaseCards(): Promise<CaseCard[]> {
  try {
    await fs.access(CASE_CARDS_FILE);
  } catch {
    return [];
  }
  
  const content = await fs.readFile(CASE_CARDS_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  return lines.map(line => JSON.parse(line) as CaseCard);
}
