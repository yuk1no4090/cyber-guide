import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

// 支持国内 OpenAI 兼容 API（DeepSeek / 智谱 / 月之暗面等）
// 通过 OPENAI_BASE_URL 环境变量指向国内平台地址
const configuredBaseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: configuredBaseURL,
});

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const isGLMEndpoint = configuredBaseURL.includes('bigmodel.cn');
export const CHAT_MODEL = process.env.OPENAI_MODEL || (isGLMEndpoint ? 'glm-4.6' : 'gpt-4o');
