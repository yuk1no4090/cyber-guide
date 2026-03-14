'use client';

import { useMemo, useState } from 'react';
import type { PlanItem } from '../hooks/usePlan';
import type { StructuredProfileData } from './ProfileForm';
import type { AuthUser } from '../hooks/useAuth';
import UserMenu from './UserMenu';

export interface SidebarSessionItem {
  id: string;
  title: string;
  mode?: string;
  updatedAt?: string;
}

interface SidebarProps {
  open: boolean;
  sessions: SidebarSessionItem[];
  selectedSessionId: string | null;
  profile: StructuredProfileData | null;
  todayPlan: PlanItem | null;
  dataOptIn: boolean;
  user: AuthUser | null;
  onCloseMobile: () => void;
  onToggleDataOptIn: () => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onLoginClick: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  open,
  sessions,
  selectedSessionId,
  profile,
  todayPlan,
  dataOptIn,
  user,
  onCloseMobile,
  onToggleDataOptIn,
  onSelectSession,
  onNewSession,
  onLoginClick,
  onLogout,
}: SidebarProps) {
  const [darkMode, setDarkMode] = useState(false);
  const profileSummary = useMemo(() => {
    if (!profile) return '未填写画像';
    return `${profile.school} / ${profile.major} / ${profile.intent}`;
  }, [profile]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/25 transition-opacity lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onCloseMobile}
      />
      <aside
        className={[
          'fixed z-50 lg:static top-0 left-0 h-full w-64 lg:w-72',
          'border-r border-slate-200 bg-slate-50/95 backdrop-blur',
          'transform transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'flex flex-col',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <p className="text-sm font-semibold text-slate-800">小舟 · 控制台</p>
            <p className="text-xs text-slate-500">会话 / 画像 / 计划 / 设置</p>
          </div>
          <button onClick={onCloseMobile} className="lg:hidden text-slate-500">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">会话列表</h3>
              <button
                onClick={onNewSession}
                className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-700 hover:bg-sky-100"
              >
                + 新建
              </button>
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {sessions.length === 0 && <p className="text-xs text-slate-400">暂无历史会话</p>}
              {sessions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectSession(item.id)}
                  className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                    selectedSessionId === item.id
                      ? 'bg-sky-100 text-sky-800'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.title || '未命名会话'}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-xs font-semibold text-slate-700">我的画像</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">{profileSummary}</p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-xs font-semibold text-slate-700">7 天计划</h3>
            {todayPlan ? (
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Day {todayPlan.day_index ?? todayPlan.dayIndex}: {todayPlan.task_text ?? todayPlan.taskText}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">还没有生成计划</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-xs font-semibold text-slate-700">设置</h3>
            <div className="mt-2 space-y-2">
              <label className="flex items-center justify-between text-xs text-slate-600">
                <span>数据记录</span>
                <button
                  onClick={onToggleDataOptIn}
                  className={`toggle-switch ${dataOptIn ? 'active' : ''}`}
                  aria-label="切换数据记录"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-600">
                <span>深色模式</span>
                <button
                  onClick={() => setDarkMode((v) => !v)}
                  className={`toggle-switch ${darkMode ? 'active' : ''}`}
                  aria-label="切换主题"
                />
              </label>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-200 p-3">
          <UserMenu user={user} onLoginClick={onLoginClick} onLogout={onLogout} />
        </div>
      </aside>
    </>
  );
}
