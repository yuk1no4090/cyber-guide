'use client';

import React, { useState } from 'react';

interface FeedbackCardProps {
  onSubmit: (rating: number, feedback: string | null, saveChat: boolean) => Promise<void>;
  onSkip: () => void;
}

export default function FeedbackCard({ onSubmit, onSkip }: FeedbackCardProps) {
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [saveChat, setSaveChat] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit(rating, feedback.trim() || null, saveChat);
      setSubmitted(true);
    } catch {
      // 静默失败
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="message-bubble flex justify-start mb-3">
        <div className="ai-bubble max-w-[88%] sm:max-w-[72%] rounded-2xl rounded-bl-sm px-4 py-4 text-center">
          <div className="text-2xl mb-2">🐭 ✨</div>
          <p className="text-[14px] text-gray-200">谢谢你的反馈！耗子会变得更好的</p>
          <p className="text-[12px] text-gray-400 mt-1">反正老鼠不怕摔，大不了再爬起来</p>
        </div>
      </div>
    );
  }

  const ratingEmojis = ['😫', '😞', '😐', '🙂', '😊', '😄', '🤩', '🥰', '💯', '🏆'];

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="max-w-[92%] sm:max-w-[80%] rounded-2xl rounded-bl-sm overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-400/15 rounded-t-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐭</span>
            <span className="text-[14px] font-semibold text-amber-300">这次聊天对你有帮助吗？</span>
          </div>
        </div>

        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-4 space-y-4">
          {/* 评分 */}
          <div>
            <div className="flex items-center justify-between gap-1">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`
                    w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-[12px] sm:text-[13px] font-medium
                    transition-all duration-150
                    ${rating === n 
                      ? 'bg-amber-500/30 text-amber-200 border border-amber-400/40 scale-110' 
                      : 'bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:bg-white/[0.08]'
                    }
                  `}
                >
                  {n}
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-center text-[13px] text-gray-300 mt-2">
                {ratingEmojis[rating - 1]} {rating <= 3 ? '耗子会努力改进的' : rating <= 6 ? '还行，继续加油' : rating <= 8 ? '谢谢认可！' : '太开心了！'}
              </p>
            )}
          </div>

          {/* 一句话反馈 */}
          <div>
            <input
              type="text"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="一句话反馈（选填）"
              className="w-full px-3 py-2 bg-[#1a1d27] text-gray-200 text-[13px] border border-white/[0.08] rounded-xl placeholder:text-gray-500 focus:outline-none focus:border-amber-400/30"
              maxLength={200}
            />
          </div>

          {/* 匿名保存开关 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={saveChat}
              onChange={e => setSaveChat(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <span className="text-[12px] text-gray-400">
              愿意匿名保存对话用于改进（会自动脱敏）
            </span>
          </label>

          {/* 按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              className="flex-1 py-2 text-[13px] font-medium text-amber-200 bg-amber-500/15 border border-amber-400/20 rounded-xl hover:bg-amber-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? '提交中...' : '提交'}
            </button>
            <button
              onClick={onSkip}
              className="px-4 py-2 text-[13px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              跳过
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

