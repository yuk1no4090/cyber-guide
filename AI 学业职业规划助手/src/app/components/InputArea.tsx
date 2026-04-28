import React, { useRef, useState } from "react";
import { ArrowUp, Mic, Paperclip } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useChat } from "../context/ChatContext";
import { quickSuggestions } from "../data/mockData";

export function InputArea() {
  const { sendMessage, isTyping } = useChat();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!text.trim() || isTyping) return;
    sendMessage(text.trim());
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  };

  const handleChip = (suggestion: string) => {
    setText(suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0f172a] px-4 pt-3 pb-4">
      <div className="max-w-3xl mx-auto">
        {/* Quick suggestion chips */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          {quickSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleChip(s)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-sky-400 dark:hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all duration-150 whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-3xl px-4 py-3 focus-within:border-sky-400 dark:focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-400/20 transition-all duration-200 shadow-sm">
          {/* Attachment button */}
          <button
            className="shrink-0 mb-0.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="上传文件"
          >
            <Paperclip size={17} />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题（Shift+Enter 换行）..."
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 max-h-[180px] py-0.5 leading-relaxed"
            style={{ minHeight: "24px" }}
            disabled={isTyping}
          />

          {/* Mic button */}
          <button
            className="shrink-0 mb-0.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="语音输入"
          >
            <Mic size={17} />
          </button>

          {/* Send button */}
          <AnimatePresence mode="wait">
            <motion.button
              key={text.trim() ? "active" : "inactive"}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={handleSend}
              disabled={!text.trim() || isTyping}
              className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${
                text.trim() && !isTyping
                  ? "bg-sky-500 hover:bg-sky-600 text-white shadow-sm shadow-sky-200 dark:shadow-sky-900/40"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
              }`}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </motion.button>
          </AnimatePresence>
        </div>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-600 mt-2">
          Cyber Guide 可能产生错误信息，重要决策请结合专业顾问意见
        </p>
      </div>
    </div>
  );
}
