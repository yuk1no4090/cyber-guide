'use client';

import { useMemo, useState } from 'react';
import type { AuthUser } from '../hooks/useAuth';

export interface SidebarSessionItem {
  id: string;
  title: string;
  mode?: string;
  updatedAt?: string;
}

interface SidebarProps {
  sessions: SidebarSessionItem[];
  selectedSessionId: string | null;
  darkMode: boolean;
  user: AuthUser | null;
  collapsed?: boolean;
  isDrawer?: boolean;
  onToggleDarkMode: () => void;
  onCloseSidebar?: () => void;
  onToggleCollapse?: () => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (id: string, title: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onLoginClick: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  sessions,
  selectedSessionId,
  darkMode,
  user,
  collapsed = false,
  isDrawer = false,
  onToggleDarkMode,
  onCloseSidebar,
  onToggleCollapse,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  onLoginClick,
  onLogout,
}: SidebarProps) {
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((item) => (item.title || '').toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const groupedSessions = useMemo(() => groupByDate(filteredSessions), [filteredSessions]);
  const tone = {
    container: darkMode
      ? 'bg-[#020617]/92 border-slate-800/90 text-slate-100'
      : 'bg-white/88 border-slate-200/80 text-slate-800',
    sectionHint: darkMode ? 'text-slate-400' : 'text-slate-500',
    divider: darkMode ? 'border-slate-800/90' : 'border-slate-200/80',
    searchBox: darkMode
      ? 'border-slate-800 bg-slate-900/75 text-slate-100'
      : 'border-slate-200/80 bg-white/90 text-slate-800',
    subtleBtn: darkMode
      ? 'border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 hover:text-white'
      : 'border-slate-200/80 bg-white/90 text-slate-700 hover:bg-slate-100 hover:text-slate-900',
    newChatBtn:
      'bg-sky-500 text-white hover:bg-sky-600 shadow-sm shadow-sky-300/30 dark:shadow-sky-950/45',
    itemIdle: darkMode
      ? 'border-transparent text-slate-200 hover:border-slate-700 hover:bg-slate-900/80'
      : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100/90',
    itemActive: darkMode
      ? 'border-sky-500/35 bg-sky-500/12 text-white shadow-sm shadow-sky-950/30'
      : 'border-sky-200 bg-sky-50/95 text-slate-900 shadow-sm shadow-sky-100/70',
    menuBox: darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white',
    menuItem: darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100',
    userCard: darkMode ? 'border-slate-800 bg-slate-900/75' : 'border-slate-200/80 bg-white/90',
  };

  const handleRename = async (id: string, oldTitle: string) => {
    const input = window.prompt('重命名会话', oldTitle || '未命名会话');
    if (!input || input.trim() === oldTitle.trim()) {
      setMenuSessionId(null);
      return;
    }
    await onRenameSession(id, input.trim());
    setMenuSessionId(null);
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm('确认删除该会话？删除后不可恢复。');
    if (!ok) return;
    await onDeleteSession(id);
    setMenuSessionId(null);
  };

  const handleSelectSession = (id: string) => {
    onSelectSession(id);
    setMenuSessionId(null);
    onCloseSidebar?.();
  };

  const handleCreateSession = () => {
    onNewSession();
    setMenuSessionId(null);
    onCloseSidebar?.();
  };

  const initials = getUserInitials(user);

  return (
    <aside className={`cg-gpt-sidebar h-full w-full border-r backdrop-blur-2xl ${tone.container}`}>
      <div className="flex h-full flex-col">
        <div className={`border-b ${tone.divider} ${collapsed ? 'px-2 py-3' : 'px-3 py-4 sm:px-4'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className={`flex min-w-0 items-center ${collapsed ? 'gap-0' : 'gap-3'}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-blue-600 shadow-md shadow-sky-200/60 dark:shadow-sky-950/40">
                <svg className="h-[18px] w-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.42A12.08 12.08 0 0118 14.5c0 1.8-2.69 3.25-6 3.25s-6-1.45-6-3.25c0-1.35.11-2.65-.16-3.92L12 14z" />
                </svg>
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    Cyber Guide
                  </p>
                  <p className={`truncate text-[11px] ${tone.sectionHint}`}>学业与职业规划助手</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${tone.subtleBtn}`}
                  aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
                  title={collapsed ? '展开侧边栏' : '收起侧边栏'}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
                    />
                  </svg>
                </button>
              )}
              {isDrawer && onCloseSidebar && (
                <button
                  type="button"
                  onClick={onCloseSidebar}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${tone.subtleBtn}`}
                  aria-label="关闭侧边栏"
                  title="关闭侧边栏"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={handleCreateSession}
              className={`flex h-10 w-full items-center rounded-2xl text-sm font-semibold leading-none transition-colors ${
                collapsed ? 'justify-center px-0' : 'justify-center gap-2 px-4'
              } ${tone.newChatBtn}`}
              aria-label="新建会话"
              title={collapsed ? '新建会话' : undefined}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {!collapsed && <span>新建会话</span>}
            </button>
          </div>

          {!collapsed && (
            <div className="mt-3">
              <div
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition-opacity ${
                  sessions.length === 0 && !searchQuery ? 'opacity-75' : 'opacity-100'
                } ${tone.searchBox}`}
              >
                <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.6-5.15a6.75 6.75 0 11-13.5 0 6.75 6.75 0 0113.5 0z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索会话"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${collapsed ? 'px-2 py-3' : 'px-3 py-3 sm:px-4'}`}>
          {groupedSessions.length === 0 && (
            <div
              className={`rounded-2xl border border-dashed px-3 py-6 text-center text-xs ${tone.sectionHint} ${
                darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/80'
              }`}
            >
              {searchQuery ? '没有匹配的会话' : collapsed ? '暂无' : '暂无历史会话，开始一段新的对话吧'}
            </div>
          )}

          {groupedSessions.map((group) => (
            <section key={group.label} className={collapsed ? 'mb-2' : 'mb-4'}>
              {!collapsed && (
                <h3 className={`mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone.sectionHint}`}>
                  {group.label}
                </h3>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = selectedSessionId === item.id;

                  return (
                    <div key={item.id} className="group relative">
                      <button
                        onClick={() => handleSelectSession(item.id)}
                        title={collapsed ? item.title || '未命名会话' : undefined}
                        className={`flex w-full items-center rounded-2xl border text-left transition-all duration-150 ${
                          collapsed ? 'h-11 justify-center px-0' : 'min-h-[52px] gap-3 px-3 py-2.5 pr-11'
                        } ${active ? tone.itemActive : tone.itemIdle}`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                            active
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-200'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 5l2.2-4.4A8 8 0 114 19z" />
                          </svg>
                        </div>

                        {!collapsed && (
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                              {item.title || '未命名会话'}
                            </div>
                            <div className={`mt-0.5 flex items-center gap-1.5 truncate text-[10px] ${tone.sectionHint}`}>
                              <span>{formatModeLabel(item.mode)}</span>
                              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                              <span>{formatUpdatedAt(item.updatedAt)}</span>
                            </div>
                          </div>
                        )}
                      </button>

                      {!collapsed && (
                        <button
                          onClick={() => setMenuSessionId((prev) => (prev === item.id ? null : item.id))}
                          className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl transition-all ${
                            darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                          } ${menuSessionId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          aria-label="会话操作"
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                            <circle cx="8" cy="3" r="1.5" />
                            <circle cx="8" cy="8" r="1.5" />
                            <circle cx="8" cy="13" r="1.5" />
                          </svg>
                        </button>
                      )}

                      {!collapsed && menuSessionId === item.id && (
                        <div className={`absolute right-2 top-[calc(100%+4px)] z-20 w-36 overflow-hidden rounded-2xl border shadow-xl ${tone.menuBox}`}>
                          <button
                            onClick={() => void handleRename(item.id, item.title)}
                            className={`block w-full px-3 py-2.5 text-left text-xs ${tone.menuItem}`}
                          >
                            重命名
                          </button>
                          <button
                            onClick={() => void handleDelete(item.id)}
                            className={`block w-full px-3 py-2.5 text-left text-xs ${
                              darkMode ? 'text-rose-300 hover:bg-slate-700' : 'text-rose-600 hover:bg-slate-100'
                            }`}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className={`safe-bottom border-t ${tone.divider} ${collapsed ? 'px-2 py-3' : 'px-3 py-3 sm:px-4'}`}>
          <div className={`flex ${collapsed ? 'flex-col items-center gap-2' : 'flex-col gap-3'}`}>
            <button
              onClick={onToggleDarkMode}
              className={`flex rounded-2xl border text-sm font-medium transition-colors ${
                collapsed ? 'h-10 w-10 items-center justify-center' : 'h-10 w-full items-center justify-center gap-2 px-3'
              } ${tone.subtleBtn}`}
              aria-label={darkMode ? '切换到浅色模式' : '切换到深色模式'}
              title={collapsed ? (darkMode ? '切换到浅色模式' : '切换到深色模式') : undefined}
            >
              {darkMode ? (
                <svg className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              {!collapsed && <span>{darkMode ? '浅色模式' : '深色模式'}</span>}
            </button>

            {user ? (
              collapsed ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    title={`${user.nickname || '用户'}${user.email ? ` · ${user.email}` : ''}`}
                    className="pulse-online flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white shadow-md shadow-sky-300/35 dark:shadow-sky-950/45"
                  >
                    {initials}
                  </div>
                  <button
                    onClick={onLogout}
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors ${tone.subtleBtn}`}
                    aria-label="退出登录"
                    title="退出登录"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className={`rounded-[22px] border p-3 ${tone.userCard}`}>
                  <div className="flex items-center gap-3">
                    <div className="pulse-online flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white shadow-md shadow-sky-300/35 dark:shadow-sky-950/45">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {user.nickname || '已登录用户'}
                      </p>
                      <p className={`truncate text-[11px] ${tone.sectionHint}`}>{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={onLogout}
                    className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-medium transition-colors ${tone.subtleBtn}`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    退出登录
                  </button>
                </div>
              )
            ) : (
              <button
                onClick={() => {
                  onLoginClick();
                  onCloseSidebar?.();
                }}
                className={`flex rounded-2xl border text-sm font-medium transition-colors ${
                  collapsed ? 'h-10 w-10 items-center justify-center' : 'h-10 w-full items-center justify-center gap-2 px-3'
                } ${tone.subtleBtn}`}
                aria-label="登录或注册"
                title={collapsed ? '登录 / 注册' : undefined}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                {!collapsed && <span>登录 / 注册</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function formatModeLabel(mode?: string) {
  if (mode === 'profile_other') return '读人模式';
  if (mode === 'profile') return '画像分析';
  return '对话';
}

function formatUpdatedAt(updatedAt?: string) {
  if (!updatedAt) return '较早';

  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return '较早';

  const diffMs = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute));
    return `${minutes} 分钟前`;
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour));
    return `${hours} 小时前`;
  }

  if (diffMs < 7 * day) {
    const days = Math.max(1, Math.round(diffMs / day));
    return `${days} 天前`;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(ts));
}

function getUserInitials(user: AuthUser | null) {
  const source = (user?.nickname || user?.email || 'U').trim();
  return source.slice(0, 1).toUpperCase();
}

function groupByDate(items: SidebarSessionItem[]): Array<{ label: string; items: SidebarSessionItem[] }> {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const groups = new Map<string, SidebarSessionItem[]>();

  const push = (label: string, item: SidebarSessionItem) => {
    const list = groups.get(label) || [];
    list.push(item);
    groups.set(label, list);
  };

  for (const item of items) {
    const ts = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    const dayStart = Number.isNaN(ts) ? 0 : new Date(ts).setHours(0, 0, 0, 0);
    const diff = startToday - dayStart;

    if (diff === 0) {
      push('今天', item);
    } else if (diff === oneDayMs) {
      push('昨天', item);
    } else if (diff > oneDayMs && diff <= 7 * oneDayMs) {
      push('7 天内', item);
    } else {
      push('更早', item);
    }
  }

  const order = ['今天', '昨天', '7 天内', '更早'];
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label) || [] }));
}
