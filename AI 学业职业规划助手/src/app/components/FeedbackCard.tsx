import React, { useState } from "react";
import { Star, Send, Heart } from "lucide-react";

export function FeedbackCard() {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (rating === 0) return;
    setSubmitted(true);
  };

  const ratingLabels = ["", "不太满意", "一般", "还不错", "比较满意", "非常满意！"];

  if (submitted) {
    return (
      <div className="mt-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
          <Heart size={22} className="text-pink-500 fill-pink-500" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
          感谢你的反馈！
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          你的建议将帮助我们持续改善 Cyber Guide，期待再次为你服务 ✨
        </p>
        <div className="flex justify-center gap-1 mt-3">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              size={16}
              className={s <= rating ? "text-amber-400 fill-amber-400" : "text-slate-200 dark:text-slate-600"}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-3 flex items-center gap-2">
        <Heart size={15} className="text-white" />
        <span className="text-sm font-semibold text-white">使用体验反馈</span>
      </div>

      <div className="p-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          你对本次咨询的满意度如何？
        </p>

        {/* Star rating */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(s)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={24}
                  className={`transition-colors ${
                    s <= (hoverRating || rating)
                      ? "text-amber-400 fill-amber-400"
                      : "text-slate-200 dark:text-slate-600"
                  }`}
                />
              </button>
            ))}
          </div>
          {(hoverRating || rating) > 0 && (
            <span className="text-xs font-medium text-amber-500">
              {ratingLabels[hoverRating || rating]}
            </span>
          )}
        </div>

        {/* Text feedback */}
        <textarea
          placeholder="有什么建议想告诉我们？（选填）"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100 transition-all resize-none mb-3"
        />

        {/* Quick feedback chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {["回答很专业", "建议很实用", "希望更详细", "响应有点慢", "界面体验好"].map((tag) => (
            <button
              key={tag}
              onClick={() => setFeedback((prev) => prev ? `${prev}、${tag}` : tag)}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={rating === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-pink-500 hover:bg-pink-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed"
        >
          <Send size={14} />
          提交反馈
        </button>
      </div>
    </div>
  );
}
