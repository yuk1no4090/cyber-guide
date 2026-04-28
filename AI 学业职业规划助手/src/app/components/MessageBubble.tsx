import React from "react";
import { motion } from "motion/react";
import { Copy, ThumbsUp, ThumbsDown, RotateCcw } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { SimilarCaseCards } from "./SimilarCaseCard";
import { UserProfileForm } from "./UserProfileForm";
import { StudyPlanCard } from "./StudyPlanCard";
import { FeedbackCard } from "./FeedbackCard";
import type { Message } from "../data/mockData";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.type === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex justify-end gap-3 mb-4"
      >
        <div className="flex flex-col items-end gap-1 max-w-[75%]">
          <div className="bg-sky-500 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-sm shadow-sky-100 dark:shadow-sky-900/30">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 pr-1">
            {formatTime(message.timestamp)}
          </span>
        </div>

        {/* User avatar */}
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-sm self-end">
          <span className="text-white text-xs font-bold">我</span>
        </div>
      </motion.div>
    );
  }

  // AI message
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-3 mb-4"
    >
      {/* AI avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-sm self-start mt-0.5">
        <span className="text-white text-xs font-bold">CG</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
          <MarkdownContent content={message.content} />

          {/* Embedded cards */}
          {message.cardType === "profile-form" && <UserProfileForm />}
          {message.cardType === "study-plan" && <StudyPlanCard />}
          {message.cardType === "feedback" && <FeedbackCard />}
        </div>

        {/* Similar cases */}
        {message.similarCases && message.similarCases.length > 0 && (
          <SimilarCaseCards cases={message.similarCases} />
        )}

        {/* Action bar */}
        <div className="flex items-center gap-1 mt-1.5 pl-1">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mr-2">
            {formatTime(message.timestamp)}
          </span>
          {[
            { icon: Copy, label: "复制" },
            { icon: ThumbsUp, label: "有用" },
            { icon: ThumbsDown, label: "无用" },
            { icon: RotateCcw, label: "重新生成" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              title={label}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
