'use client';

import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import TypingIndicator from './components/TypingIndicator';
import SuggestionChips from './components/SuggestionChips';
import ProfileReport from './components/ProfileReport';
import FeedbackCard from './components/FeedbackCard';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
}

type AppMode = 'chat' | 'profile' | 'profile_other';

const STORAGE_KEY = 'cyber-guide-chat';

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: '嘿！我是小舟 🛶\n\n一叶漂在 CS 领域的小船，水深水浅都趟过。也迷茫过，也焦虑过，一路飘飘荡荡走到现在。\n\n想聊什么都行，随便说：',
};

const WELCOME_SUGGESTIONS = [
  '最近有点迷茫不知道该干嘛',
  '知道该努力但就是动不起来',
  '总觉得别人都比我强...',
  '有些事想找人聊聊',
];

const PROFILE_CHOOSE: Message = {
  role: 'assistant',
  content: '你想让小舟帮你分析谁？🛶',
};

const PROFILE_CHOOSE_SUGGESTIONS = [
  '🙋 了解我自己',
  '👥 看懂身边的人',
];

const PROFILE_SELF_WELCOME: Message = {
  role: 'assistant',
  content: '好嘞，让小舟来认识一下你 🛶\n\n别紧张，就像朋友闲聊一样。随时可以点「生成画像」看分析结果。\n\n先聊聊——你现在是在读还是已经毕业了？学的什么专业呀？',
};

const PROFILE_SELF_SUGGESTIONS = [
  '刚上大学还在适应中',
  '大三了有点慌',
  '在读研，也不确定接下来',
  '已经工作了但想聊聊',
];

const PROFILE_OTHER_WELCOME: Message = {
  role: 'assistant',
  content: '有意思，小舟最喜欢帮人"读人"了 🛶🔍\n\n你想分析谁？先告诉我：\n- ta 是你的什么人？（同学/室友/老师/同事/领导/朋友/家人）\n- 发生了什么事让你想了解 ta？',
};

const PROFILE_OTHER_SUGGESTIONS = [
  '室友有些行为我看不懂',
  '有个同事让我很头疼',
  '不知道领导到底在想什么',
  '有个朋友最近让我很困惑',
];

// ===== localStorage =====
function saveToStorage(messages: Message[]) {
  try {
    if (messages.length > 1) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  } catch {}
}

function loadFromStorage(): Message[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Message[];
      if (Array.isArray(parsed) && parsed.length > 1) return parsed;
    }
  } catch {}
  return null;
}

function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function Home() {
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [profileMessages, setProfileMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(WELCOME_SUGGESTIONS);
  const [chatSuggestionsBak, setChatSuggestionsBak] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [hadCrisis, setHadCrisis] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      setMessages(saved);
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (mode === 'chat') saveToStorage(messages);
  }, [messages, mode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, profileMessages, isLoading, suggestions, reportContent]);

  const isProfileMode = mode === 'profile' || mode === 'profile_other';
  const currentMessages = mode === 'chat' ? messages : profileMessages;

  const startNewChat = () => {
    // 如果聊了足够多且还没评价过，先弹出评价卡
    if (messages.length >= 5 && !feedbackDone && !showFeedback) {
      setPendingReset(true);
      setShowFeedback(true);
      return;
    }
    doResetChat();
  };

  const doResetChat = () => {
    clearStorage();
    setMessages([WELCOME_MESSAGE]);
    setSuggestions(WELCOME_SUGGESTIONS);
    setShowFeedback(false);
    setFeedbackDone(false);
    setHadCrisis(false);
    setPendingReset(false);
  };

  const startProfile = () => {
    setChatSuggestionsBak(suggestions);
    setMode('profile');
    setProfileMessages([PROFILE_CHOOSE]);
    setSuggestions(PROFILE_CHOOSE_SUGGESTIONS);
    setReportContent(null);
  };

  const backToChat = () => {
    setMode('chat');
    setSuggestions(chatSuggestionsBak.length > 0 ? chatSuggestionsBak : (messages.length <= 1 ? WELCOME_SUGGESTIONS : []));
    setReportContent(null);
  };

  const generateReport = async () => {
    // 检查用户是否提供了足够的实质性内容（至少 2 条超过 5 字的用户消息）
    const substantiveUserMsgs = profileMessages.filter(
      m => m.role === 'user' && m.content.length > 5
    );
    if (substantiveUserMsgs.length < 2) {
      setSuggestions(['再多描述一些细节吧', '信息太少了，结果不准']);
      return;
    }
    setIsLoading(true);
    setReportContent(null);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: profileMessages.map(m => ({ role: m.role, content: m.content })),
          mode: mode === 'profile_other' ? 'generate_report_other' : 'generate_report',
        }),
      });
      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setReportContent(data.message);
      setSuggestions([]);
    } catch (error) {
      console.error('Failed to generate report:', error);
      setReportContent('抱歉，报告生成失败了。请稍后再试。');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('了解我自己')) {
      setProfileMessages([PROFILE_SELF_WELCOME]);
      setSuggestions(PROFILE_SELF_SUGGESTIONS);
      return;
    }
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('看懂身边的人')) {
      setMode('profile_other');
      setProfileMessages([PROFILE_OTHER_WELCOME]);
      setSuggestions(PROFILE_OTHER_SUGGESTIONS);
      return;
    }
    if ((mode === 'profile' || mode === 'profile_other') && (content.includes('结束画像') || content.includes('生成画像') || content.includes('看看分析'))) {
      generateReport();
      return;
    }

    setSuggestions([]);
    const userMessage: Message = { role: 'user', content };
    const currentMsgs = isProfileMode ? profileMessages : messages;
    const updatedMessages = [...currentMsgs, userMessage];

    if (isProfileMode) {
      setProfileMessages(updatedMessages);
    } else {
      setMessages(updatedMessages);
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          mode: mode === 'profile_other' ? 'profile_other' : mode,
        }),
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      if (data.isCrisis) setHadCrisis(true);

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        isCrisis: data.isCrisis,
      };

      if (isProfileMode) {
        setProfileMessages([...updatedMessages, assistantMessage]);
      } else {
        setMessages([...updatedMessages, assistantMessage]);
      }

      setSuggestions(data.suggestions?.length > 0 ? data.suggestions : []);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMsg: Message = {
        role: 'assistant',
        content: '抱歉，小舟现在遇到了一些问题 😵 请稍后再试。',
      };
      if (isProfileMode) {
        setProfileMessages([...updatedMessages, errorMsg]);
      } else {
        setMessages([...updatedMessages, errorMsg]);
      }
      setSuggestions(['重新试试']);
    } finally {
      setIsLoading(false);
    }
  };

  // 标记是否是"新对话前的评价"
  const [pendingReset, setPendingReset] = useState(false);

  const submitFeedback = async (rating: number, feedback: string | null, saveChat: boolean) => {
    if (saveChat) {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content })),
          rating,
          feedback,
          hadCrisis,
          mode,
        }),
      });
    }
    setFeedbackDone(true);
    // 如果是点了"新对话"触发的评价，提交后自动重置
    if (pendingReset) {
      setTimeout(() => doResetChat(), 1500); // 让用户看到"谢谢反馈"再跳
    }
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    setFeedbackDone(true);
    if (pendingReset) {
      doResetChat();
    }
  };

  const canShowFeedback = !isProfileMode && messages.length >= 9 && !showFeedback && !feedbackDone;

  return (
    <div className="chat-container flex flex-col h-screen h-[100dvh] max-w-3xl lg:max-w-4xl mx-auto relative">
      {/* ===== Header ===== */}
      <header className="glass safe-top sticky top-0 z-20 border-b border-slate-200/60">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative pulse-online w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-sky-400 via-blue-400 to-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <span className="text-base sm:text-lg">🛶</span>
            </div>
            <div>
              <h1 className="font-semibold text-[15px] sm:text-base text-slate-800 leading-tight tracking-tight">
                小舟 · Cyber Guide
              </h1>
              <p className="text-[11px] text-sky-500 leading-tight">
                {mode === 'chat' ? '在线 · 渡你过河的 CS 小船' : mode === 'profile_other' ? '🔍 读人模式' : '📋 画像分析模式'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!isProfileMode ? (
              <>
                {messages.length > 1 && (
                  <button
                    onClick={startNewChat}
                    className="px-2 py-1.5 text-[12px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    ✨ 新对话
                  </button>
                )}
                <button
                  onClick={startProfile}
                  className="px-2 py-1.5 text-[12px] text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
                >
                  📋 画像
                </button>
              </>
            ) : (
              <div className="flex gap-1.5">
                {!reportContent && profileMessages.filter(m => m.role === 'user' && m.content.length > 5).length >= 2 && (
                  <button
                    onClick={generateReport}
                    disabled={isLoading}
                    className="px-2 py-1.5 text-[12px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                  >
                    ✨ 生成{mode === 'profile_other' ? '分析' : '画像'}
                  </button>
                )}
                <button
                  onClick={backToChat}
                  className="px-2 py-1.5 text-[12px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  返回聊天
                </button>
              </div>
            )}
          </div>
        </div>
        {showDisclaimer && !isProfileMode && (
          <div className="disclaimer-bar px-4 py-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] sm:text-xs text-amber-600/70 flex-1 text-center">
              <span className="mr-1">🛶</span>
              小舟是 AI 陪伴工具，分享的经验仅供参考，不替代专业咨询
            </p>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="text-amber-500/50 hover:text-amber-600 text-xs p-1 transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* ===== 消息区域 ===== */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-3 sm:px-5 lg:px-8 py-4 sm:py-6 space-y-1">
          {currentMessages.map((message, index) => (
            <ChatMessage
              key={`${mode}-${index}`}
              role={message.role}
              content={message.content}
              isCrisis={message.isCrisis}
            />
          ))}

          {isLoading && <TypingIndicator />}

          {reportContent && (
            <ProfileReport content={reportContent} onClose={backToChat} isOtherMode={mode === 'profile_other'} />
          )}

          {showFeedback && !feedbackDone && (
            <FeedbackCard
              onSubmit={submitFeedback}
              onSkip={handleFeedbackSkip}
            />
          )}

          {!isLoading && !reportContent && !showFeedback && suggestions.length > 0 && (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={sendMessage}
              disabled={isLoading}
            />
          )}

          {canShowFeedback && !isLoading && (
            <div className="flex justify-center mt-3">
              <button
                onClick={() => setShowFeedback(true)}
                className="px-3 py-1.5 text-[12px] text-sky-500 bg-sky-50 border border-sky-200 rounded-full hover:bg-sky-100 hover:text-sky-600 transition-colors"
              >
                💬 聊完了？给小舟打个分
              </button>
            </div>
          )}

          <div ref={messagesEndRef} className="h-1" />
        </div>
      </main>

      {/* ===== 输入区域 ===== */}
      <footer className="glass safe-bottom sticky bottom-0 z-20 border-t border-slate-200/60">
        <div className="px-3 sm:px-5 lg:px-8 pt-3 pb-3">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading || !!reportContent}
          />
        </div>
      </footer>
    </div>
  );
}
