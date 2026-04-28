import React from "react";
import { Menu, GraduationCap, Sun, Moon, MoreHorizontal, Share2, Bookmark } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useChat } from "../context/ChatContext";

export function TopNav() {
  const { isDark, toggleTheme } = useTheme();
  const { sessions, currentSessionId, sidebarOpen, setSidebarOpen } = useChat();

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0f172a] shrink-0">
      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Logo — shown when sidebar is closed */}
      {!sidebarOpen && (
        <div className="flex items-center gap-2 mr-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
            <GraduationCap size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight hidden sm:block">
            Cyber Guide
          </span>
        </div>
      )}

      {/* Divider */}
      {!sidebarOpen && (
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
      )}

      {/* Session title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
          {currentSession?.title ?? "新建会话"}
        </h1>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <button
          title="收藏"
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden sm:flex"
        >
          <Bookmark size={16} />
        </button>
        <button
          title="分享"
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden sm:flex"
        >
          <Share2 size={16} />
        </button>
        <button
          onClick={toggleTheme}
          title={isDark ? "切换浅色" : "切换深色"}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
        </button>
        <button
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </header>
  );
}
