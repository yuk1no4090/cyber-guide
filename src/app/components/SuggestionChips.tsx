'use client';

import React from 'react';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export default function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 mb-1 message-bubble">
      {suggestions.map((text, index) => (
        <button
          key={index}
          onClick={() => onSelect(text)}
          disabled={disabled}
          className="
            suggestion-chip
            px-3 py-1.5 sm:px-3.5 sm:py-2
            text-[12px] sm:text-[13px]
            text-emerald-300/90 
            bg-emerald-500/[0.08]
            border border-emerald-400/15
            rounded-full
            hover:bg-emerald-500/[0.15] hover:border-emerald-400/25 hover:text-emerald-200
            active:scale-95
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-all duration-200
            whitespace-nowrap
          "
        >
          {text}
        </button>
      ))}
    </div>
  );
}

