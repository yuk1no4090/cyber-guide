import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  MessageSquare,
  Sun,
  Moon,
  ChevronLeft,
  Search,
  LogIn,
  GraduationCap,
  Trash2,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useChat } from "../context/ChatContext";

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function Sidebar() {
  const { isDark, toggleTheme } = useTheme();
  const { sessions, currentSessionId, switchSession, createNewSession, sidebarOpen, setSidebarOpen } =
    useChat();
  const [searchQuery, setSearchQuery] = useState("");
  const [loggedIn] = useState(false);

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: sidebarOpen ? 260 : 0,
          opacity: sidebarOpen ? 1 : 0,
        }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="fixed md:relative z-30 left-0 top-0 h-full overflow-hidden bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700/80 flex flex-col"
      >
        <div className="w-[260px] flex flex-col h-full">
          {/* Logo + collapse */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-sm">
                <GraduationCap size={16} className="text-white" />
              </div>
              <span className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                Cyber Guide
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* New chat button */}
          <div className="px-3 pt-3 pb-2">
            <button
              onClick={createNewSession}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors duration-150 shadow-sm shadow-sky-200 dark:shadow-sky-900/30"
            >
              <Plus size={16} />
              新建会话
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="搜索会话..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-xs bg-transparent border-none outline-none text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
          </div>

          {/* Sessions list */}
          <div className="flex-1 overflow-y-auto px-2">
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1">
              历史会话
            </p>
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => switchSession(session.id)}
                className={`group w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 mb-0.5 ${
                  session.id === currentSessionId
                    ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <MessageSquare
                  size={14}
                  className={`shrink-0 mt-0.5 ${
                    session.id === currentSessionId
                      ? "text-sky-500"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{session.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate mt-0.5">
                    {formatRelativeTime(session.timestamp)}
                  </p>
                </div>
                <button
                  className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))}

            {filteredSessions.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
                没有匹配的会话
              </p>
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-slate-200 dark:border-slate-700/80 p-3 space-y-1">
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm"
            >
              {isDark ? (
                <>
                  <Sun size={15} className="text-amber-400" />
                  <span className="text-xs font-medium">切换浅色模式</span>
                </>
              ) : (
                <>
                  <Moon size={15} className="text-slate-500" />
                  <span className="text-xs font-medium">切换深色模式</span>
                </>
              )}
            </button>

            {/* User */}
            {loggedIn ? (
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">张</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                    张同学
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                    zhang@example.com
                  </p>
                </div>
              </button>
            ) : (
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <LogIn size={15} />
                <span className="text-xs font-medium">登录 / 注册</span>
              </button>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  );
}
