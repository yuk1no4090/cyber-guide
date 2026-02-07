import fs from 'fs';
import path from 'path';

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), 'docs', 'SYSTEM_PROMPT.md');

let cachedSystemPrompt: string | null = null;

/**
 * 读取系统提示词
 */
export function getSystemPrompt(): string {
  if (cachedSystemPrompt) {
    return cachedSystemPrompt;
  }

  try {
    const content = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    // 移除 markdown 标题（第一行）
    const lines = content.split('\n');
    const promptStart = lines.findIndex(line => !line.startsWith('#') && line.trim());
    cachedSystemPrompt = lines.slice(promptStart).join('\n').trim();
    return cachedSystemPrompt;
  } catch (error) {
    console.error('Failed to read system prompt:', error);
    // 返回默认提示词
    return `你是 Cyber Guide，一个温暖、专业的心理支持 AI 伙伴。
你的目标是为用户提供情感支持、倾听和心理疏导。
请保持温暖、共情的态度，不要做出医学诊断或提供药物建议。`;
  }
}

/**
 * 重新加载系统提示词（用于开发时热更新）
 */
export function reloadSystemPrompt(): void {
  cachedSystemPrompt = null;
}

