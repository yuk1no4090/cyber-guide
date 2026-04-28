import React from "react";
import { motion } from "motion/react";

export function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-4">
      {/* AI Avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-sm">
        <span className="text-white text-xs font-bold">CG</span>
      </div>

      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-sky-400 rounded-full"
            animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
