'use client';

import React from 'react';

const ACTION_LABELS: Record<string, string> = {
  '__action:profile_self': '🙋 了解我自己',
  '__action:profile_other': '👥 看懂身边的人',
  '__action:generate_report': '✨ 生成画像',
};

function displayText(text: string): string {
  return ACTION_LABELS[text] ?? text;
}

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export default function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div role="group" aria-label="建议回复" className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 mb-1 message-bubble">
      {suggestions.map((text, index) => (
        <button
          key={index}
          onClick={() => onSelect(text)}
          disabled={disabled}
          aria-label={`发送：${displayText(text)}`}
          className="
            suggestion-chip
            px-3 py-1.5 sm:px-3.5 sm:py-2
            text-[12px] sm:text-[13px]
            text-sky-600
            bg-sky-50
            border border-sky-200
            rounded-full
            hover:bg-sky-100 hover:border-sky-300 hover:text-sky-700
            active:scale-95
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-all duration-200
            whitespace-nowrap
          "
        >
          {displayText(text)}
        </button>
      ))}
    </div>
  );
}

