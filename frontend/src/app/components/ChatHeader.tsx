import React from 'react';
import type { AppMode } from '../hooks/useChatFlow';

interface ChatHeaderProps {
  mode: AppMode;
  darkMode: boolean;
  isLoggedIn: boolean;
  authLoading: boolean;
  isLoading: boolean;
  isRecapLoading: boolean;
  isProfileMode: boolean;
  canGenerateRecap: boolean;
  showDisclaimer: boolean;
  showFeedback: boolean;
  feedbackDone: boolean;
  dataOptIn: boolean;
  reportContent: string | null;
  profileMessages: Array<{ role: string; content: string }>;
  messages: Array<{ role: string; content: string }>;
  onToggleDarkMode: () => void;
  onToggleDataOptIn: () => void;
  onLoginClick: () => void;
  onStartNewChat: () => void;
  onStartProfile: () => void;
  onBackToChat: () => void;
  onGenerateRecap: () => void;
  onGenerateReport: () => void;
  onDismissDisclaimer: () => void;
}

export default function ChatHeader({
  mode,
  darkMode,
  isLoggedIn,
  authLoading,
  isLoading,
  isRecapLoading,
  isProfileMode,
  canGenerateRecap,
  showDisclaimer,
  dataOptIn,
  reportContent,
  profileMessages,
  messages,
  onToggleDarkMode,
  onToggleDataOptIn,
  onLoginClick,
  onStartNewChat,
  onStartProfile,
  onBackToChat,
  onGenerateRecap,
  onGenerateReport,
  onDismissDisclaimer,
}: ChatHeaderProps) {
  return (
    <header className="glass safe-top sticky top-0 z-20 border-b border-slate-200/60 dark:border-slate-700/60">
      <div className="pl-12 pr-4 sm:pl-14 sm:pr-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative pulse-online w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-sky-400 via-blue-400 to-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <span className="text-base sm:text-lg">🛶</span>
          </div>
          <div>
            <h1 className="font-semibold text-[15px] sm:text-base text-slate-800 dark:text-slate-100 leading-tight tracking-tight">
              小舟 · Cyber Guide
            </h1>
            <p className="text-[11px] text-sky-500 dark:text-sky-300 leading-tight">
              {mode === 'chat' ? '在线 · 渡你过河的 CS 小船' : mode === 'profile_other' ? '🔍 读人模式' : '📋 画像分析模式'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={onToggleDarkMode}
            className={`shrink-0 h-8 w-8 rounded-lg border text-sm flex items-center justify-center transition-colors ${
              darkMode
                ? 'text-amber-100 bg-amber-900/35 border-amber-700 hover:bg-amber-900/55'
                : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
            }`}
            title={darkMode ? '切换到浅色模式' : '切换到深色模式'}
            aria-label={darkMode ? '切换到浅色模式' : '切换到深色模式'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          {!authLoading && !isLoggedIn && (
            <button
              onClick={onLoginClick}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-sky-600 dark:text-sky-50 bg-sky-50 dark:bg-sky-800/70 border border-sky-200 dark:border-sky-600 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-700/80 transition-colors"
            >
              登录
            </button>
          )}
          {!isProfileMode ? (
            <>
              {messages.length > 1 && (
                <button
                  onClick={onStartNewChat}
                  className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-slate-500 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  ✨ 新对话
                </button>
              )}
              {canGenerateRecap && (
                <button
                  onClick={onGenerateRecap}
                  disabled={isRecapLoading}
                  className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-indigo-600 dark:text-indigo-50 bg-indigo-50 dark:bg-indigo-800/70 border border-indigo-200 dark:border-indigo-600 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-700/80 disabled:opacity-40 transition-colors"
                >
                  {isRecapLoading ? '生成中...' : '🧭 复盘卡'}
                </button>
              )}
              <button
                onClick={onStartProfile}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-sky-600 dark:text-sky-50 bg-sky-50 dark:bg-sky-800/70 border border-sky-200 dark:border-sky-600 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-700/80 transition-colors"
              >
                📋 画像
              </button>
              <button
                onClick={onToggleDataOptIn}
                title={dataOptIn ? '已开启匿名指标记录（点击关闭）' : '已关闭匿名指标记录（点击开启）'}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${
                  dataOptIn
                    ? 'text-emerald-600 dark:text-emerald-50 bg-emerald-50 dark:bg-emerald-800/65 border-emerald-200 dark:border-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-700/80'
                    : 'text-slate-500 dark:text-slate-100 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                {dataOptIn ? '🔓 记录' : '🔒 记录'}
              </button>
            </>
          ) : (
            <div className="flex gap-1.5">
              {!reportContent && profileMessages.filter(m => m.role === 'user' && m.content.length > 5).length >= 2 && (
                <button
                  onClick={onGenerateReport}
                  disabled={isLoading}
                  className="px-2 py-1.5 text-[12px] text-emerald-600 dark:text-emerald-50 bg-emerald-50 dark:bg-emerald-800/65 border border-emerald-200 dark:border-emerald-600 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-700/80 disabled:opacity-40 transition-colors"
                >
                  ✨ 生成{mode === 'profile_other' ? '分析' : '画像'}
                </button>
              )}
              <button
                onClick={onBackToChat}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] text-slate-500 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                返回聊天
              </button>
            </div>
          )}
        </div>
      </div>
      {showDisclaimer && !isProfileMode && (
        <div className="disclaimer-bar px-4 py-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] sm:text-xs text-amber-600/70 dark:text-amber-300/80 flex-1 text-center">
            <span className="mr-1">🛶</span>
            小舟是 AI 陪伴工具，分享的经验仅供参考，不替代专业咨询
          </p>
          <button
            onClick={onDismissDisclaimer}
            className="text-amber-500/50 dark:text-amber-300/70 hover:text-amber-600 dark:hover:text-amber-200 text-xs p-1 transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </header>
  );
}
