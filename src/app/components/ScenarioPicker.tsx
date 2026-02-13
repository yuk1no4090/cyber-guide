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
      <p className="text-[12px] sm:text-[13px] text-slate-500 mb-1.5">
        关系场景模板（可切换）
      </p>

      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {allowClear && (
          <button
            type="button"
            onClick={() => handleSelect(null)}
            disabled={disabled}
            className={`
              px-3 py-1.5 sm:px-3.5 sm:py-2
              text-[12px] sm:text-[13px]
              rounded-full border transition-all duration-200
              ${value === null
                ? 'text-sky-700 bg-sky-100 border-sky-300'
                : 'text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}
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
            className={`
              px-3 py-1.5 sm:px-3.5 sm:py-2
              text-[12px] sm:text-[13px]
              rounded-full border transition-all duration-200
              ${value === option.id
                ? 'text-sky-700 bg-sky-100 border-sky-300'
                : 'text-sky-600 bg-sky-50 border-sky-200 hover:bg-sky-100 hover:border-sky-300'}
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

