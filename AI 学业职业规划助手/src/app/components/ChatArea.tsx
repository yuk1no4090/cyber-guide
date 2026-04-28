import React, { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { useChat } from "../context/ChatContext";

export function ChatArea() {
  const { messages, isTyping } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
      <div className="max-w-3xl mx-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-200 dark:shadow-sky-900/40">
              <Sparkles size={28} className="text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">
                开始你的规划之旅
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                输入你的问题，Cyber Guide 将为你提供个性化建议
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isTyping && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
