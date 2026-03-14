'use client';

import { type AuthUser } from '../hooks/useAuth';

interface UserMenuProps {
  user: AuthUser | null;
  onLoginClick: () => void;
  onLogout: () => void;
}

export default function UserMenu({ user, onLoginClick, onLogout }: UserMenuProps) {
  if (!user) {
    return (
      <button
        onClick={onLoginClick}
        className="w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700 hover:bg-sky-100"
      >
        登录 / 注册
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-sky-100 flex items-center justify-center text-sky-700">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.nickname || user.email} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span>{(user.nickname || user.email).slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{user.nickname || '用户'}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="mt-3 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
      >
        退出登录
      </button>
    </div>
  );
}
