'use client';

export function TypingIndicator() {
  return (
    <div className="flex justify-start fade-in-up">
      <div className="bg-[var(--color-bg-card)] px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border border-[var(--color-border)]">
        <div className="flex gap-1.5 items-center">
          <span className="typing-dot w-2 h-2 rounded-full bg-[var(--color-text-muted)]" />
          <span className="typing-dot w-2 h-2 rounded-full bg-[var(--color-text-muted)]" style={{ animationDelay: '0.15s' }} />
          <span className="typing-dot w-2 h-2 rounded-full bg-[var(--color-text-muted)]" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  );
}
