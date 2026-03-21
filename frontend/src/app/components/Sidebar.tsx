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
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  onLoginClick,
  onLogout,
}: SidebarProps) {
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const groupedSessions = useMemo(() => groupByDate(sessions), [sessions]);
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
    <aside className={`cg-gpt-sidebar h-full w-full border-r flex flex-col ${tone.container}`}>
      <div className={`px-3 py-3 border-b ${darkMode ? 'border-slate-800/90' : 'border-slate-200'}`}>
        <button
          onClick={onNewSession}
          className={`w-full rounded-lg border px-3 py-2 text-sm ${tone.actionBtn}`}
        >
          + 新建对话
        </button>
        <div className="mt-2 flex items-center justify-between">
          <p className={`text-[11px] ${tone.sectionHint}`}>会话历史</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {groupedSessions.length === 0 && (
          <p className={`px-2 py-4 text-xs ${tone.sectionHint}`}>暂无历史会话</p>
        )}
        {groupedSessions.map((group) => (
          <section key={group.label} className="mb-4">
            <h3 className={`px-2 py-1 text-[11px] ${tone.sectionHint}`}>{group.label}</h3>
            <div className="space-y-1">
              {group.items.map((item) => (
                <div key={item.id} className="group relative">
                  <button
                    onClick={() => onSelectSession(item.id)}
                    className={`w-full truncate rounded-lg px-3 py-2 text-left text-[13px] ${
                      selectedSessionId === item.id ? tone.itemActive : tone.itemIdle
                    }`}
                  >
                    {item.title || '未命名会话'}
                  </button>
                  <button
                    onClick={() => setMenuSessionId((prev) => prev === item.id ? null : item.id)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 ${
                      darkMode ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                    } ${menuSessionId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    aria-label="会话操作"
                  >
                    ⋯
                  </button>
                  {menuSessionId === item.id && (
                    <div className={`absolute right-2 top-9 z-10 w-28 rounded-md border shadow-xl ${tone.menuBox}`}>
                      <button
                        onClick={() => void handleRename(item.id, item.title)}
                        className={`block w-full px-3 py-2 text-left text-xs ${tone.menuItem}`}
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => void handleDelete(item.id)}
                        className={`block w-full px-3 py-2 text-left text-xs hover:bg-slate-100 ${darkMode ? 'text-rose-300 hover:bg-slate-700' : 'text-rose-600 hover:bg-slate-100'}`}
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

      <div className={`border-t p-3 space-y-2 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <button
          onClick={onToggleDarkMode}
          className={`w-full rounded-lg border px-3 py-2 text-sm ${tone.actionBtn}`}
        >
          {darkMode ? '☀️ 切到浅色' : '🌙 切到深色'}
        </button>
        {user ? (
          <div>
            <p className={`truncate text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{user.nickname || '用户'}</p>
            <p className={`truncate text-xs ${tone.sectionHint}`}>{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={onLogout}
                className={`rounded-md border px-2 py-1 text-[11px] ${tone.actionBtn}`}
              >
                退出
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onLoginClick}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${tone.actionBtn}`}
          >
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
