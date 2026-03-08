'use client';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  return (
    <div className="px-4 py-2 flex flex-wrap gap-2">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="suggestion-chip px-3 py-1.5 rounded-full text-xs bg-[var(--color-bg-lighter)] text-[var(--color-primary-dark)] border border-[var(--color-border)] hover:bg-[var(--color-primary-light)] hover:text-white transition-colors"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
