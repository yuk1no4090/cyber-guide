import { pickN } from '@/lib/random';
import type { ChatMessageState } from './hooks/useChatFlow';
import type { StructuredProfileData } from './components/ProfileForm';

type Message = ChatMessageState;

// ===== Storage keys =====
export const STORAGE_KEY = 'cyber-guide-chat';
export const PROFILE_STORAGE_KEY = 'cyber-guide-profile';
export const ACTIVE_SESSION_KEY = 'cyber-guide-active-session-id';
export const PROFILE_DATA_PREFIX = '[PROFILE_DATA]';

// ===== Welcome =====
export const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: '嘿 🛶\n\n我是小舟，CS 出身，水深水浅都趟过一些。迷茫过，焦虑过，到现在也没完全想明白，但一直在往前走。\n\n想聊点什么？随便说就行：',
};

const WELCOME_SUGGESTION_POOL = [
  '最近有点迷茫不知道该干嘛',
  '知道该努力但就是动不起来',
  '总觉得别人都比我强...',
  '有些事想找人聊聊',
  '每天都在焦虑但说不清为什么',
  '感觉自己一直在原地踏步',
  '不知道自己到底想要什么',
  '最近做什么都提不起劲',
  '有个选择一直在纠结',
  '想找个人吐槽一下',
  '觉得自己哪里都不够好',
  '对未来有点害怕',
];

export function getWelcomeSuggestions(): string[] {
  return pickN(WELCOME_SUGGESTION_POOL, 4);
}

export const DEFAULT_WELCOME_SUGGESTIONS = WELCOME_SUGGESTION_POOL.slice(0, 4);
export const DEFAULT_CHAT_FOLLOWUP_SUGGESTIONS = [
  '继续聊聊',
  '你能再具体一点吗？',
  '给我一个可执行计划',
  '换个角度分析一下',
];
export const DEFAULT_PROFILE_FOLLOWUP_SUGGESTIONS = [
  '请结合我的背景再细化',
  '给我一版 7 天行动清单',
  '帮我比较读研和就业',
];

// ===== Profile mode messages =====
export const PROFILE_CHOOSE: Message = {
  role: 'assistant',
  content: '想分析谁？我来帮你看看 🛶',
};

export const PROFILE_SELF_WELCOME: Message = {
  role: 'assistant',
  content: '好嘞，让我来认识一下你 🛶\n\n别紧张，就当朋友闲聊。随时可以点「生成画像」看分析结果。\n\n先聊聊——你现在是在读还是已经毕业了？学的什么专业呀？',
};

export const PROFILE_OTHER_WELCOME: Message = {
  role: 'assistant',
  content: '有意思，我最喜欢帮人"读人"了 🔍\n\n你想分析谁？先告诉我：\n- ta 是你的什么人？（同学/室友/老师/同事/领导/朋友/家人）\n- 发生了什么事让你想了解 ta？',
};

const PROFILE_OTHER_SUGGESTION_POOL = [
  '室友有些行为我看不懂',
  '有个同事让我很头疼',
  '不知道领导到底在想什么',
  '有个朋友最近让我很困惑',
  '和一个人关系变得很微妙',
  '有人总是让我不舒服但说不清',
  '团队里有个人特别难搞',
  '家人的一些做法我不理解',
  '有个暧昧对象让我很纠结',
  '导师最近的态度让我摸不透',
];

export function getProfileOtherSuggestions(): string[] {
  return pickN(PROFILE_OTHER_SUGGESTION_POOL, 4);
}

// ===== Action identifiers =====
export const ACTION_PREFIX = '__action:';
export const ACTION_PROFILE_SELF = `${ACTION_PREFIX}profile_self`;
export const ACTION_PROFILE_OTHER = `${ACTION_PREFIX}profile_other`;
export const ACTION_GENERATE_REPORT = `${ACTION_PREFIX}generate_report`;

export function isAction(text: string): boolean {
  return text.startsWith(ACTION_PREFIX);
}

export const PROFILE_CHOOSE_SUGGESTIONS = [
  ACTION_PROFILE_SELF,
  ACTION_PROFILE_OTHER,
];

// ===== localStorage helpers =====
export function saveToStorage(messages: Message[]) {
  try {
    if (messages.length > 1) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  } catch {}
}

export function loadFromStorage(): Message[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Message[];
      if (Array.isArray(parsed) && parsed.length > 1) return parsed;
    }
  } catch {}
  return null;
}

export function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function loadProfileFromStorage(): StructuredProfileData | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StructuredProfileData;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.school || !parsed.major || !parsed.stage || !parsed.intent) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfileToStorage(profile: StructuredProfileData) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

function sanitizeProfileValue(value: string): string {
  return (value || '').replace(/\|/g, '｜').replace(/=/g, '＝').trim();
}

export function serializeProfileData(profile: StructuredProfileData): string {
  return `${PROFILE_DATA_PREFIX} ` +
    `school=${sanitizeProfileValue(profile.school)}|` +
    `major=${sanitizeProfileValue(profile.major)}|` +
    `stage=${sanitizeProfileValue(profile.stage)}|` +
    `intent=${sanitizeProfileValue(profile.intent)}|` +
    `gpa=${sanitizeProfileValue(profile.gpa)}|` +
    `internship=${sanitizeProfileValue(profile.internship)}|` +
    `research=${sanitizeProfileValue(profile.research)}|` +
    `competition=${sanitizeProfileValue(profile.competition)}`;
}
