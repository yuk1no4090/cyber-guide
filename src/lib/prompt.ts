import fs from 'fs';
import path from 'path';

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), 'docs', 'SYSTEM_PROMPT.md');

let cachedSystemPrompt: string | null = null;
let cacheTimestamp: number = 0;

// 开发模式下每 30 秒重新读取一次（方便你编辑 SYSTEM_PROMPT.md 后立即生效）
const CACHE_TTL_MS = process.env.NODE_ENV === 'development' ? 30_000 : Infinity;

/**
 * 读取系统提示词
 */
export function getSystemPrompt(): string {
  const now = Date.now();

  // 缓存未过期则直接返回
  if (cachedSystemPrompt && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSystemPrompt;
  }

  try {
    const content = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    // 移除第一行 markdown 标题
    const lines = content.split('\n');
    const promptStart = lines.findIndex(line => !line.startsWith('#') && line.trim());
    cachedSystemPrompt = lines.slice(promptStart).join('\n').trim();
    cacheTimestamp = now;
    return cachedSystemPrompt;
  } catch (error) {
    console.error('Failed to read system prompt:', error);
    return `你是 Cyber Guide，一个陪伴型的 AI 学长。
请保持真诚、平等的态度，像朋友一样聊天。
不做心理诊断，不懂的不装懂。`;
  }
}
