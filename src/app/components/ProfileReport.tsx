'use client';

import React from 'react';

interface ProfileReportProps {
  content: string;
  onClose: () => void;
}

export default function ProfileReport({ content, onClose }: ProfileReportProps) {
  const formatReport = (text: string) => {
    let formatted = text;
    // 标题 ###
    formatted = formatted.replace(/^### (.+)/gm, '<h3 class="text-base font-semibold text-white mt-4 mb-2">$1</h3>');
    // 粗体
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
    // 表格处理
    formatted = formatted.replace(/\| (.+?) \| (.+?) \|/g, (_, col1, col2) => {
      if (col1.includes('---')) return '';
      if (col1.includes('维度')) return `<div class="grid grid-cols-[100px_1fr] gap-1 text-[13px] mt-1 mb-1 px-2 py-1 bg-white/[0.03] rounded font-medium text-gray-300"><span>${col1}</span><span>${col2}</span></div>`;
      return `<div class="grid grid-cols-[100px_1fr] gap-1 text-[13px] px-2 py-1.5 border-b border-white/[0.04]"><span class="text-gray-400">${col1}</span><span class="text-gray-200">${col2}</span></div>`;
    });
    // 列表
    formatted = formatted.replace(/^- (.+)/gm, '<div class="flex gap-1.5 items-start text-[13px] mb-1"><span class="text-emerald-400/70 mt-0.5">•</span><span class="text-gray-200">$1</span></div>');
    // 换行
    formatted = formatted.replace(/\n/g, '<br />');
    // 清理多余的 <br />
    formatted = formatted.replace(/(<br \/>){3,}/g, '<br /><br />');
    return formatted;
  };

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="max-w-[95%] sm:max-w-[85%] rounded-2xl rounded-bl-sm overflow-hidden">
        {/* 报告头部 */}
        <div className="bg-gradient-to-r from-emerald-600/20 via-teal-600/15 to-cyan-600/20 border border-emerald-400/15 rounded-t-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-[14px] font-semibold text-emerald-300">你的个人画像</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
          >
            返回聊天
          </button>
        </div>

        {/* 报告内容 */}
        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-3">
          <div
            className="text-[13px] sm:text-[14px] leading-[1.7] text-gray-200/90"
            dangerouslySetInnerHTML={{ __html: formatReport(content) }}
          />
        </div>
      </div>
    </div>
  );
}

