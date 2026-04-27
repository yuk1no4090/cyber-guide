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
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
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
  sidebarOpen,
  onToggleSidebar,
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
    <header className="h-14 flex items-center gap-3 px-4 border-b border-slate-200/80 dark:border-slate-700/80 bg-white/85 dark:bg-[#0f172a]/90 backdrop-blur-xl shrink-0 sticky top-0 z-20">
      {/* Sidebar toggle (mobile) */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {!sidebarOpen && (
        <div className="hidden sm:flex items-center gap-2 mr-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-sm shadow-sky-200 dark:shadow-sky-950/40">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Cyber Guide</span>
        </div>
      )}

      {/* Session title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
          {mode === 'chat' ? 'Cyber Guide' : mode === 'profile_other' ? '读人模式' : '画像分析'}
        </h1>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {!isProfileMode ? (
          <>
            {messages.length > 1 && (
              <button
                onClick={onStartNewChat}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-150"
              >
                新对话
              </button>
            )}
            {canGenerateRecap && (
              <button
                onClick={onGenerateRecap}
                disabled={isRecapLoading}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-40 transition-all duration-150"
              >
                {isRecapLoading ? '生成中...' : '复盘'}
              </button>
            )}
            <button
              onClick={onStartProfile}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-all duration-150"
            >
              画像
            </button>
          </>
        ) : (
          <>
            {!reportContent && profileMessages.filter(m => m.role === 'user' && m.content.length > 5).length >= 2 && (
              <button
                onClick={onGenerateReport}
                disabled={isLoading}
                className="shrink-0 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-40 transition-all duration-150"
              >
                生成{mode === 'profile_other' ? '分析' : '画像'}
              </button>
            )}
            <button
              onClick={onBackToChat}
              className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-150"
            >
              返回
            </button>
          </>
        )}

        <button
          onClick={onToggleDarkMode}
          title={darkMode ? '切换浅色' : '切换深色'}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? (
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {!authLoading && !isLoggedIn && (
          <button
            onClick={onLoginClick}
            className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-all duration-150"
          >
            登录
          </button>
        )}
      </div>
    </header>
  );
}
