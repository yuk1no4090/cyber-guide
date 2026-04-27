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
  onToggleDarkMode: () => void;
  onToggleSidebar?: () => void;
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
  onToggleDarkMode,
  onToggleSidebar,
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
      ? 'bg-slate-900 border-slate-800 text-slate-100'
      : 'bg-slate-50 border-slate-200 text-slate-800',
    sectionHint: darkMode ? 'text-slate-400' : 'text-slate-500',
    actionBtn: darkMode
      ? 'border-slate-600 bg-slate-700 text-slate-50 hover:bg-slate-600'
      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
    itemIdle: darkMode
      ? 'text-slate-200 hover:bg-slate-800'
      : 'text-slate-600 hover:bg-slate-200',
    itemActive: darkMode
      ? 'bg-slate-700 text-white'
      : 'bg-slate-300 text-slate-900',
    menuBox: darkMode
      ? 'border-slate-700 bg-slate-800'
      : 'border-slate-200 bg-white',
    menuItem: darkMode
      ? 'text-slate-200 hover:bg-slate-700'
      : 'text-slate-700 hover:bg-slate-100',
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

  return (
    <aside className={`h-full w-full border-r flex flex-col ${tone.container}`}>
      <div className={`flex items-center justify-between px-4 py-4 border-b ${darkMode ? 'border-slate-700/80' : 'border-slate-200'}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-sm shadow-sky-200 dark:shadow-sky-950/40">
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.42A12.08 12.08 0 0118 14.5c0 1.8-2.69 3.25-6 3.25s-6-1.45-6-3.25c0-1.35.11-2.65-.16-3.92L12 14z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold tracking-tight">Cyber Guide</p>
            <p className={`truncate text-[11px] ${tone.sectionHint}`}>学业与职业规划助手</p>
          </div>
        </div>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={`rounded-lg p-1.5 transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
            aria-label="收起侧边栏"
            title="收起侧边栏"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* 顶部：新建会话按钮 */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onNewSession}
          className="w-full rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-200 transition-colors duration-200 hover:bg-sky-600 dark:shadow-sky-950/40"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建会话
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
          <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.6-5.15a6.75 6.75 0 11-13.5 0 6.75 6.75 0 0113.5 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索会话..."
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {groupedSessions.length === 0 && (
          <p className={`px-2 py-8 text-xs text-center ${tone.sectionHint}`}>{searchQuery ? '没有匹配的会话' : '暂无历史会话'}</p>
        )}
        {groupedSessions.map((group) => (
          <section key={group.label} className="mb-3">
            <h3 className={`px-2 py-1 text-[11px] font-semibold ${tone.sectionHint}`}>{group.label}</h3>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <div key={item.id} className="group relative">
                  <button
                    onClick={() => onSelectSession(item.id)}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-all duration-150 ${
                      selectedSessionId === item.id ? tone.itemActive : tone.itemIdle
                    }`}
                  >
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 5l2.2-4.4A8 8 0 114 19z" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate">{item.title || '未命名会话'}</span>
                  </button>
                  <button
                    onClick={() => setMenuSessionId((prev) => prev === item.id ? null : item.id)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-opacity duration-150 ${
                      darkMode ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                    } ${menuSessionId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    aria-label="会话操作"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>
                  {menuSessionId === item.id && (
                    <div className={`absolute right-2 top-9 z-10 w-32 rounded-lg border shadow-lg ${tone.menuBox}`}>
                      <button
                        onClick={() => void handleRename(item.id, item.title)}
                        className={`block w-full px-3 py-2 text-left text-xs rounded-t-lg ${tone.menuItem}`}
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => void handleDelete(item.id)}
                        className={`block w-full px-3 py-2 text-left text-xs rounded-b-lg ${darkMode ? 'text-rose-300 hover:bg-slate-700' : 'text-rose-600 hover:bg-slate-100'}`}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className={`border-t p-4 space-y-3 ${darkMode ? 'border-slate-700/80' : 'border-slate-200'}`}>
        <button
          onClick={onToggleDarkMode}
          className={`w-full rounded-lg border px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 ${tone.actionBtn}`}
        >
          {darkMode ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              浅色模式
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              深色模式
            </>
          )}
        </button>
        {user ? (
          <div className="space-y-2">
            <div className={`rounded-lg border px-3 py-2 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
              <p className={`truncate text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{user.nickname || '用户'}</p>
              <p className={`truncate text-xs ${tone.sectionHint}`}>{user.email}</p>
            </div>
            <button
              onClick={onLogout}
              className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 ${tone.actionBtn}`}
            >
              退出登录
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginClick}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 ${tone.actionBtn}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            登录 / 注册
          </button>
        )}
      </div>
    </aside>
  );
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
    const diff = startToday - new Date(ts).setHours(0, 0, 0, 0);
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
