'use client';

import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import TypingIndicator from './components/TypingIndicator';
import PrivacyToggle from './components/PrivacyToggle';
import SuggestionChips from './components/SuggestionChips';
import ProfileReport from './components/ProfileReport';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
  isReport?: boolean;
}

type AppMode = 'chat' | 'profile';

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: '你好！我是 Cyber Guide 🌿\n\n我是你的 CS 学长，和你一样也经历过迷茫和焦虑。\n\n不管是学业规划、方向选择，还是单纯想聊聊，都可以随便说。点下面的话题开始，或者直接打字也行：',
};

const WELCOME_SUGGESTIONS = [
  '不知道大学该怎么规划',
  '知道该学习但就是不想动',
  '感觉身边的人都比我强',
  '想聊聊方向和选择',
];

const PROFILE_WELCOME: Message = {
  role: 'assistant',
  content: '好的，让我来了解一下你 😊\n\n别紧张，就像朋友闲聊一样。随时可以点「生成画像」看分析结果。\n\n先聊聊——你现在是在读还是已经毕业了？学的什么专业呀？',
};

const PROFILE_WELCOME_SUGGESTIONS = [
  '我是大一新生',
  '大三了，快毕业了',
  '我是研究生',
  '已经工作了',
];

export default function Home() {
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [profileMessages, setProfileMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(WELCOME_SUGGESTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, profileMessages, isLoading, suggestions, reportContent]);

  const currentMessages = mode === 'chat' ? messages : profileMessages;

  // 切换到画像模式
  const startProfile = () => {
    setMode('profile');
    setProfileMessages([PROFILE_WELCOME]);
    setSuggestions(PROFILE_WELCOME_SUGGESTIONS);
    setReportContent(null);
  };

  // 返回聊天模式
  const backToChat = () => {
    setMode('chat');
    setSuggestions(messages.length <= 1 ? WELCOME_SUGGESTIONS : []);
    setReportContent(null);
  };

  // 生成画像报告
  const generateReport = async () => {
    if (profileMessages.length < 3) {
      // 至少聊几轮再生成
      setSuggestions(['再多聊几句吧']);
      return;
    }

    setIsLoading(true);
    setReportContent(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: profileMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          optIn,
          mode: 'generate_report',
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

  // 发送消息
  const sendMessage = async (content: string) => {
    // 如果在画像模式下点了"生成画像"相关的建议
    if (mode === 'profile' && (content.includes('结束画像') || content.includes('生成画像') || content.includes('看看分析'))) {
      generateReport();
      return;
    }

    setSuggestions([]);

    const userMessage: Message = { role: 'user', content };
    const currentMsgs = mode === 'chat' ? messages : profileMessages;
    const updatedMessages = [...currentMsgs, userMessage];

    if (mode === 'chat') {
      setMessages(updatedMessages);
    } else {
      setProfileMessages(updatedMessages);
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          optIn,
          mode,
        }),
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        isCrisis: data.isCrisis,
      };

      if (mode === 'chat') {
        setMessages([...updatedMessages, assistantMessage]);
      } else {
        setProfileMessages([...updatedMessages, assistantMessage]);
      }

      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMsg: Message = {
        role: 'assistant',
        content: '抱歉，我现在遇到了一些问题。请稍后再试。',
      };
      if (mode === 'chat') {
        setMessages([...updatedMessages, errorMsg]);
      } else {
        setProfileMessages([...updatedMessages, errorMsg]);
      }
      setSuggestions(['重新试试']);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container flex flex-col h-screen h-[100dvh] max-w-2xl mx-auto relative">
      {/* ===== Header ===== */}
      <header className="glass safe-top sticky top-0 z-20 border-b border-white/[0.06]">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative pulse-online w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <span className="text-base sm:text-lg">🌿</span>
            </div>
            <div>
              <h1 className="font-semibold text-[15px] sm:text-base text-white leading-tight tracking-tight">
                Cyber Guide
              </h1>
              <p className="text-[11px] text-emerald-400/70 leading-tight">
                {mode === 'chat' ? '在线 · 心理支持伙伴' : '📋 画像分析模式'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 画像按钮 / 返回按钮 */}
            {mode === 'chat' ? (
              <button
                onClick={startProfile}
                className="px-2.5 py-1.5 text-[12px] text-cyan-300/80 bg-cyan-400/[0.08] border border-cyan-400/15 rounded-lg hover:bg-cyan-400/[0.15] transition-colors"
              >
                📋 我的画像
              </button>
            ) : (
              <div className="flex gap-1.5">
                {!reportContent && profileMessages.length >= 3 && (
                  <button
                    onClick={generateReport}
                    disabled={isLoading}
                    className="px-2.5 py-1.5 text-[12px] text-emerald-300/80 bg-emerald-400/[0.08] border border-emerald-400/15 rounded-lg hover:bg-emerald-400/[0.15] disabled:opacity-40 transition-colors"
                  >
                    ✨ 生成画像
                  </button>
                )}
                <button
                  onClick={backToChat}
                  className="px-2.5 py-1.5 text-[12px] text-gray-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.08] transition-colors"
                >
                  返回聊天
                </button>
              </div>
            )}
            {/* 桌面端隐私开关 */}
            <div className="hidden sm:block">
              <PrivacyToggle optIn={optIn} onChange={setOptIn} />
            </div>
          </div>
        </div>
        {showDisclaimer && mode === 'chat' && (
          <div className="disclaimer-bar px-4 py-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] sm:text-xs text-amber-200/60 flex-1 text-center">
              <span className="mr-1">⚠️</span>
              本服务仅提供情感支持，不提供医学诊断或治疗建议
            </p>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="text-amber-200/40 hover:text-amber-200/70 text-xs p-1 transition-colors flex-shrink-0"
              aria-label="关闭提示"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* ===== 消息区域 ===== */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-3 sm:px-5 py-4 sm:py-6 space-y-1">
          {currentMessages.map((message, index) => (
            <ChatMessage
              key={index}
              role={message.role}
              content={message.content}
              isCrisis={message.isCrisis}
            />
          ))}

          {isLoading && <TypingIndicator />}

          {/* 画像报告 */}
          {reportContent && (
            <ProfileReport content={reportContent} onClose={backToChat} />
          )}

          {/* 建议标签 */}
          {!isLoading && !reportContent && suggestions.length > 0 && (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={sendMessage}
              disabled={isLoading}
            />
          )}

          <div ref={messagesEndRef} className="h-1" />
        </div>
      </main>

      {/* ===== 输入区域 ===== */}
      <footer className="glass safe-bottom sticky bottom-0 z-20 border-t border-white/[0.06]">
        <div className="px-3 sm:px-5 pt-3 pb-3">
          <div className="sm:hidden mb-2.5">
            <PrivacyToggle optIn={optIn} onChange={setOptIn} />
          </div>
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading || !!reportContent}
          />
        </div>
      </footer>
    </div>
  );
}
