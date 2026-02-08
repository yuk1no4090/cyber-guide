'use client';

import React from 'react';

interface PrivacyToggleProps {
  optIn: boolean;
  onChange: (value: boolean) => void;
}

export default function PrivacyToggle({ optIn, onChange }: PrivacyToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={optIn}
        aria-label="允许匿名记录用于改进"
        onClick={() => onChange(!optIn)}
        className={`toggle-switch flex-shrink-0 ${optIn ? 'active' : ''}`}
      />
      <span className="text-[12px] text-slate-500 select-none leading-tight">
        允许匿名记录
      </span>
      <div className="relative group">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 text-slate-400 cursor-help"
        >
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
        {/* Tooltip - 向下弹出，避免被浏览器顶部遮挡 */}
        <div className="absolute top-full right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto mt-2 w-56 p-2.5 bg-white rounded-lg text-[11px] text-slate-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 shadow-xl border border-slate-200 z-30">
          <p className="mb-0.5 font-medium text-slate-800 text-[12px]">关于数据记录</p>
          <p className="leading-relaxed">开启后，脱敏后的对话摘要将用于改进 AI 回应质量。不会收集可识别个人身份的信息。</p>
          <div className="absolute top-0 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto -translate-y-1/2 w-2 h-2 bg-white rotate-45 border-l border-t border-slate-200" />
        </div>
      </div>
    </div>
  );
}
