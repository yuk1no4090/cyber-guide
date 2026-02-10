import fs from 'fs';
import path from 'path';

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), 'docs', 'SYSTEM_PROMPT.md');

let cachedSystemPrompt: string | null = null;
let cachedPromptVersion: string = 'unknown';
let cacheTimestamp: number = 0;

const CACHE_TTL_MS = process.env.NODE_ENV === 'development' ? 30_000 : Infinity;

/**
 * 读取系统提示词
 */
export function getSystemPrompt(): string {
  loadIfNeeded();
  return cachedSystemPrompt!;
}

/**
 * 获取提示词版本号
 */
export function getPromptVersion(): string {
  loadIfNeeded();
  return cachedPromptVersion;
}

function loadIfNeeded() {
  const now = Date.now();
  if (cachedSystemPrompt && (now - cacheTimestamp) < CACHE_TTL_MS) return;

  try {
    const content = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');

    // 解析版本号：<!-- prompt_version: x.x -->
    const versionMatch = content.match(/prompt_version:\s*([\d.]+)/);
    cachedPromptVersion = versionMatch?.[1] || 'unknown';

    // 移除 HTML 注释和 markdown 标题，提取正文
    const lines = content.split('\n');
    const promptStart = lines.findIndex(line =>
      !line.startsWith('#') && !line.startsWith('<!--') && line.trim()
    );
    cachedSystemPrompt = lines.slice(promptStart).join('\n').trim();
    cacheTimestamp = now;
  } catch (error) {
    console.error('Failed to read system prompt:', error);
    cachedSystemPrompt = `你是 Cyber Guide / 小舟，一个陪伴型的 AI 伙伴。
请保持真诚、平等的态度，像朋友一样聊天。
不做心理诊断，不懂的不装懂。`;
    cachedPromptVersion = 'fallback';
  }
}
