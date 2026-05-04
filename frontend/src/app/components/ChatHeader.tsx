import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppMode } from '../hooks/useChatFlow';

interface ChatHeaderProps {
  mode: AppMode;
  darkMode: boolean;
  isDesktop: boolean;
  isTablet: boolean;
  mobileSidebarOpen: boolean;
  desktopSidebarCollapsed: boolean;
  isLoggedIn: boolean;
  authLoading: boolean;
  isLoading: boolean;
  isRecapLoading: boolean;
  isProfileMode: boolean;
  canGenerateRecap: boolean;
  reportContent: string | null;
  profileMessages: Array<{ role: string; content: string }>;
  messages: Array<{ role: string; content: string }>;
  onToggleSidebar: () => void;
  onToggleDarkMode: () => void;
  onLoginClick: () => void;
  onStartNewChat: () => void;
  onStartProfile: () => void;
  onBackToChat: () => void;
  onGenerateRecap: () => void;
  onGenerateReport: () => void;
}

interface HeaderAction {
  id: string;
  label: string;
  shortLabel: string;
  tone: 'neutral' | 'sky' | 'indigo' | 'emerald';
  disabled?: boolean;
  onClick: () => void;
}

export default function ChatHeader({
  mode,
  darkMode,
  isDesktop,
  isTablet,
  mobileSidebarOpen,
  desktopSidebarCollapsed,
  isLoggedIn,
  authLoading,
  isLoading,
  isRecapLoading,
  isProfileMode,
  canGenerateRecap,
  reportContent,
  profileMessages,
  messages,
  onToggleSidebar,
  onToggleDarkMode,
  onLoginClick,
  onStartNewChat,
  onStartProfile,
  onBackToChat,
  onGenerateRecap,
  onGenerateReport,
}: ChatHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  const modeTitle = mode === 'chat' ? 'Cyber Guide' : mode === 'profile_other' ? '读人模式' : '画像分析';
  const modeSubtitle = mode === 'chat'
    ? '规划、案例检索与连续对话工作区'
    : mode === 'profile_other'
      ? '分析他人特点、关系场景与沟通策略'
      : '梳理你的背景、优势与方向判断';
  const profileUserTurns = profileMessages.filter((message) => message.role === 'user' && message.content.trim().length > 5).length;

  const primaryActions = useMemo<HeaderAction[]>(() => {
    const actions: HeaderAction[] = [];

    if (!isProfileMode) {
      if (messages.length > 1) {
        actions.push({
          id: 'new-chat',
          label: '新对话',
          shortLabel: '新建',
          tone: 'neutral',
          onClick: onStartNewChat,
        });
      }

      if (canGenerateRecap) {
        actions.push({
          id: 'recap',
          label: isRecapLoading ? '正在生成复盘' : '生成复盘',
          shortLabel: '复盘',
          tone: 'indigo',
          disabled: isRecapLoading,
          onClick: onGenerateRecap,
        });
      }

      actions.push({
        id: 'profile',
        label: '开启画像',
        shortLabel: '画像',
        tone: 'sky',
        onClick: onStartProfile,
      });
    } else {
      if (!reportContent && profileUserTurns >= 2) {
        actions.push({
          id: 'report',
          label: `生成${mode === 'profile_other' ? '分析' : '画像'}`,
          shortLabel: '生成',
          tone: 'emerald',
          disabled: isLoading,
          onClick: onGenerateReport,
        });
      }

      actions.push({
        id: 'back',
        label: '返回对话',
        shortLabel: '返回',
        tone: 'neutral',
        onClick: onBackToChat,
      });
    }

    return actions;
  }, [
    canGenerateRecap,
    isLoading,
    isProfileMode,
    isRecapLoading,
    messages.length,
    mode,
    onBackToChat,
    onGenerateRecap,
    onGenerateReport,
    onStartNewChat,
    onStartProfile,
    profileUserTurns,
    reportContent,
  ]);

  const compactActions = isTablet ? primaryActions.slice(0, 3) : [];

  const handleMenuAction = (action: HeaderAction) => {
    if (action.disabled) return;
    action.onClick();
    setMoreOpen(false);
  };

  return (
    <header className="surface-panel relative flex min-h-[52px] items-center gap-2 rounded-[24px] border border-soft px-3 py-2 shadow-sm shadow-slate-900/5 backdrop-blur-xl sm:min-h-[56px] sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          aria-label={
            isDesktop
              ? desktopSidebarCollapsed
                ? '展开侧边栏'
                : '收起侧边栏'
              : mobileSidebarOpen
                ? '关闭侧边栏'
                : '打开侧边栏'
          }
        >
          {isDesktop ? (
            <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={desktopSidebarCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100 sm:text-[15px]">
            {modeTitle}
          </h1>
          <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
            {modeSubtitle}
          </p>
        </div>
      </div>

      {isDesktop ? (
        <div className="ml-auto flex items-center gap-2">
          {primaryActions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className={`inline-flex h-10 items-center justify-center rounded-2xl border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${getActionClass(action.tone)}`}
            >
              {action.label}
            </button>
          ))}

          <button
            type="button"
            onClick={onToggleDarkMode}
            title={darkMode ? '切换到浅色模式' : '切换到深色模式'}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {darkMode ? <SunIcon className="h-4 w-4 text-amber-400" /> : <MoonIcon className="h-4 w-4" />}
          </button>

          {!authLoading && !isLoggedIn && (
            <button
              type="button"
              onClick={onLoginClick}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 px-4 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200 dark:hover:bg-sky-900/50"
            >
              登录
            </button>
          )}
        </div>
      ) : (
        <div className="ml-auto flex items-center gap-1.5">
          {compactActions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className={`hidden h-10 min-w-10 items-center justify-center rounded-2xl border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex ${getActionClass(action.tone)}`}
              title={action.label}
            >
              {action.shortLabel}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="更多操作"
            aria-expanded={moreOpen}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
        </div>
      )}

      {!isDesktop && moreOpen && (
        <div
          ref={menuRef}
          className="surface-card absolute right-0 top-[calc(100%+10px)] z-30 w-[min(86vw,320px)] rounded-[22px] border border-soft p-2 shadow-2xl shadow-slate-900/12"
        >
          <div className="space-y-1">
            {primaryActions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                onClick={() => handleMenuAction(action)}
                className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span>{action.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${getMenuToneClass(action.tone)}`}>
                  {action.shortLabel}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                onToggleDarkMode();
                setMoreOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>{darkMode ? '切换到浅色模式' : '切换到深色模式'}</span>
              {darkMode ? <SunIcon className="h-4 w-4 text-amber-400" /> : <MoonIcon className="h-4 w-4 text-slate-500 dark:text-slate-300" />}
            </button>

            {!authLoading && !isLoggedIn && (
              <button
                type="button"
                onClick={() => {
                  onLoginClick();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span>登录 / 注册</span>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                  账号
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function getActionClass(tone: HeaderAction['tone']) {
  switch (tone) {
    case 'sky':
      return 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200 dark:hover:bg-sky-900/50';
    case 'indigo':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50';
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50';
    default:
      return 'border-slate-200 bg-white/85 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800';
  }
}

function getMenuToneClass(tone: HeaderAction['tone']) {
  switch (tone) {
    case 'sky':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200';
    case 'indigo':
      return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200';
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}
