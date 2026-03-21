'use client';

import React from 'react';
import {
  getScenarioOptions,
  type RelationshipScenario,
  trackScenarioSelected,
} from '@/lib/scenario';

interface ScenarioPickerProps {
  value: RelationshipScenario | null;
  onChange: (scenario: RelationshipScenario | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}

export default function ScenarioPicker({
  value,
  onChange,
  disabled = false,
  allowClear = true,
  className = '',
}: ScenarioPickerProps) {
  const options = getScenarioOptions();

  const handleSelect = (next: RelationshipScenario | null) => {
    if (disabled) return;
    onChange(next);
    trackScenarioSelected(next);
  };

  return (
    <section className={`message-bubble mt-2 mb-1 ${className}`.trim()}>
      <p className="text-[12px] sm:text-[13px] text-slate-500 dark:text-slate-300 mb-1.5" id="scenario-picker-label">
        关系场景模板（可切换）
      </p>

      <div className="flex flex-wrap gap-1.5 sm:gap-2" role="radiogroup" aria-labelledby="scenario-picker-label">
        {allowClear && (
          <button
            type="button"
            onClick={() => handleSelect(null)}
            disabled={disabled}
            aria-pressed={value === null}
            className={`
              px-3 py-1.5 sm:px-3.5 sm:py-2
              text-[12px] sm:text-[13px]
              rounded-full border transition-all duration-200
              ${value === null
                ? 'text-sky-700 dark:text-sky-50 bg-sky-100 dark:bg-sky-800/70 border-sky-300 dark:border-sky-600'
                : 'text-slate-500 dark:text-slate-100 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}
              disabled:opacity-30 disabled:cursor-not-allowed
            `}
          >
            不限场景
          </button>
        )}

        {options.map(option => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleSelect(option.id)}
            disabled={disabled}
            aria-pressed={value === option.id}
            className={`
              px-3 py-1.5 sm:px-3.5 sm:py-2
              text-[12px] sm:text-[13px]
              rounded-full border transition-all duration-200
              ${value === option.id
                ? 'text-sky-700 dark:text-sky-50 bg-sky-100 dark:bg-sky-800/70 border-sky-300 dark:border-sky-600'
                : 'text-sky-600 dark:text-sky-50 bg-sky-50 dark:bg-sky-700/70 border-sky-200 dark:border-sky-600 hover:bg-sky-100 dark:hover:bg-sky-600/80 hover:border-sky-300 dark:hover:border-sky-500'}
              disabled:opacity-30 disabled:cursor-not-allowed
            `}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

