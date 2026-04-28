import React from "react";
import { Calendar, CheckCircle2, Circle, Tag } from "lucide-react";
import { useChat } from "../context/ChatContext";

const tagColors: Record<string, string> = {
  学术: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  考试: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  申请: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  职业: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  技能: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
};

export function StudyPlanCard() {
  const { studyPlanTasks, toggleTask } = useChat();

  const completed = studyPlanTasks.filter((t) => t.completed).length;
  const total = studyPlanTasks.length;
  const progress = Math.round((completed / total) * 100);

  return (
    <div className="mt-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-500 to-sky-500 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-white" />
            <span className="text-sm font-semibold text-white">学习计划时间表</span>
          </div>
          <span className="text-xs text-white/80 font-medium">
            {completed}/{total} 完成
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tasks */}
      <div className="p-4 space-y-2.5">
        {studyPlanTasks.map((task) => (
          <button
            key={task.id}
            onClick={() => toggleTask(task.id)}
            className={`w-full flex gap-3 p-3 rounded-xl border transition-all duration-200 text-left ${
              task.completed
                ? "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 opacity-60"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-sm"
            }`}
          >
            {/* Checkbox icon */}
            <div className="shrink-0 mt-0.5">
              {task.completed ? (
                <CheckCircle2 size={18} className="text-emerald-500" />
              ) : (
                <Circle size={18} className="text-slate-300 dark:text-slate-600" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span
                  className={`text-xs font-semibold ${
                    task.completed
                      ? "text-slate-400 dark:text-slate-500 line-through"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {task.title}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tagColors[task.tag]}`}
                >
                  {task.tag}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-sky-500 font-medium flex items-center gap-1">
                  <Calendar size={10} />
                  {task.date}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {task.description}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {progress === 100 && (
        <div className="px-4 pb-4">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              🎉 恭喜！所有任务已完成！
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
