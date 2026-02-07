'use client';

import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import TypingIndicator from './components/TypingIndicator';
import PrivacyToggle from './components/PrivacyToggle';
import SuggestionChips from './components/SuggestionChips';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isCrisis?: boolean;
}

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [suggestions, setSuggestions] = useState<string[]>(WELCOME_SUGGESTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, suggestions]);

  const sendMessage = async (content: string) => {
    // 清除当前建议
    setSuggestions([]);

    const userMessage: Message = { role: 'user', content };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
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
        }),
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      setMessages([...updatedMessages, {
        role: 'assistant',
        content: data.message,
        isCrisis: data.isCrisis,
      }]);

      // 设置新的建议
      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages([...updatedMessages, {
        role: 'assistant',
        content: '抱歉，我现在遇到了一些问题。请稍后再试，或者如果你需要紧急帮助，请联系专业心理热线：400-161-9995',
      }]);
      setSuggestions(['重新试试', '我需要帮助']);
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
              <p className="text-[11px] text-emerald-400/70 leading-tight">在线 · 心理支持伙伴</p>
            </div>
          </div>
          <div className="hidden sm:block">
            <PrivacyToggle optIn={optIn} onChange={setOptIn} />
          </div>
        </div>
        {showDisclaimer && (
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
          {messages.map((message, index) => (
            <ChatMessage
              key={index}
              role={message.role}
              content={message.content}
              isCrisis={message.isCrisis}
            />
          ))}
          {isLoading && <TypingIndicator />}

          {/* 建议标签 —— 只在不加载时、有建议时显示 */}
          {!isLoading && suggestions.length > 0 && (
            <div className="pl-0 sm:pl-0">
              <SuggestionChips
                suggestions={suggestions}
                onSelect={sendMessage}
                disabled={isLoading}
              />
            </div>
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
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      </footer>
    </div>
  );
}
