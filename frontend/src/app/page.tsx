'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchWithTimeout, apiUrl } from '@/lib/api';
import { ChatInput } from '@/app/components/ChatInput';
import { ChatMessage } from '@/app/components/ChatMessage';
import { SuggestionChips } from '@/app/components/SuggestionChips';
import { TypingIndicator } from '@/app/components/TypingIndicator';
import { PlanCard } from '@/app/components/PlanCard';
import { FeedbackCard } from '@/app/components/FeedbackCard';
import { usePlan, type Message } from '@/app/hooks/usePlan';

function generateSessionId(): string {
  return crypto.randomUUID();
}

export default function Home() {
  const [sessionId] = useState(generateSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([
    '最近有点迷茫', '想聊聊职业方向', '帮我做个计划',
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const plan = usePlan(sessionId, messages);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsLoading(true);
    setSuggestions([]);

    try {
      const response = await fetchWithTimeout(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          mode: 'chat',
          session_id: sessionId,
        }),
      }, 30_000);

      const data = await response.json();
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.message || '抱歉，我暂时无法回复。',
        isCrisis: data.isCrisis,
      };
      setMessages(prev => [...prev, assistantMsg]);
      setSuggestions(data.suggestions || ['继续聊聊', '换个话题']);

      if (nextMessages.length >= 6 && !showFeedback) {
        setShowFeedback(true);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '网络不太好，请稍后再试。',
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, sessionId, showFeedback]);

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      {/* Header */}
      <header className="glass safe-top px-4 py-3 flex items-center gap-3 border-b border-[var(--color-border)]">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold pulse-online">
          舟
        </div>
        <div>
          <h1 className="text-sm font-semibold text-[var(--color-text)]">小舟 · Cyber Guide</h1>
          <p className="text-xs text-[var(--color-text-muted)]">水深水浅都趟过</p>
        </div>
      </header>

      {/* Disclaimer */}
      <div className="disclaimer-bar px-4 py-1.5 text-center">
        <span className="text-xs text-[var(--color-warning)]">
          本应用不提供医学或心理诊断，如有紧急情况请拨打 400-161-9995
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 fade-in-up">
            <div className="text-4xl mb-3">🛶</div>
            <p className="text-sm text-[var(--color-text-muted)]">
              有什么想聊的？学业、工作、迷茫、拖延……都可以。
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}

        {/* Plan Card */}
        {plan.plans.length > 0 && (
          <PlanCard
            plans={plan.plans}
            todayPlan={plan.todayPlan}
            todayIndex={plan.todayIndex}
            isPlanActing={plan.isPlanActing}
            planError={plan.planError}
            onMarkDone={() => plan.updateTodayPlanStatus('done')}
            onMarkSkipped={() => plan.updateTodayPlanStatus('skipped')}
            onRegenerate={() => plan.regenerateTodayPlan()}
          />
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && !isLoading && (
        <SuggestionChips suggestions={suggestions} onSelect={sendMessage} />
      )}

      {/* Feedback */}
      {showFeedback && (
        <FeedbackCard
          messages={messages}
          sessionId={sessionId}
          onClose={() => setShowFeedback(false)}
        />
      )}

      {/* Input */}
      <div className="safe-bottom">
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}
