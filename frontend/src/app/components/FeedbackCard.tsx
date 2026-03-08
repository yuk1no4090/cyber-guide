'use client';

import { useState } from 'react';
import { fetchWithTimeout, apiUrl } from '@/lib/api';
import type { Message } from '@/app/hooks/usePlan';

interface FeedbackCardProps {
  messages: Message[];
  sessionId: string;
  onClose: () => void;
}

export function FeedbackCard({ messages, sessionId, onClose }: FeedbackCardProps) {
  const [rating, setRating] = useState(7);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await fetchWithTimeout(apiUrl('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          rating,
          feedback: text || null,
          hadCrisis: messages.some(m => m.isCrisis),
          mode: 'chat',
        }),
      }, 6_000);
      setSubmitted(true);
    } catch {
      // silent fail
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-4 mb-2 p-3 rounded-xl bg-green-50 border border-green-200 text-center fade-in-up">
        <p className="text-sm text-green-700">感谢你的反馈！</p>
        <button onClick={onClose} className="text-xs text-green-500 mt-1 underline">关闭</button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2 p-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm fade-in-up">
      <p className="text-sm font-medium text-[var(--color-text)] mb-2">觉得这次聊天怎么样？</p>
      <div className="flex gap-1 mb-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            onClick={() => setRating(n)}
            className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
              n <= rating
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg-lighter)] text-[var(--color-text-muted)]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="有什么建议？（可选）"
        rows={2}
        className="w-full text-xs p-2 rounded-lg bg-[var(--color-bg-light)] text-[var(--color-text)] resize-none outline-none mb-2"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg text-xs bg-[var(--color-primary)] text-white disabled:opacity-40"
        >
          提交
        </button>
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-text-muted)]">
          跳过
        </button>
      </div>
    </div>
  );
}
