'use client';

import React, { useMemo, useState } from 'react';

export type ProfileIntent = '考研' | '保研' | '就业' | '还没想好';

export interface StructuredProfileData {
  school: string;
  major: string;
  stage: string;
  gpa: string;
  internship: string;
  research: string;
  competition: string;
  intent: ProfileIntent;
}

interface ProfileFormProps {
  initialValue?: Partial<StructuredProfileData>;
  onSubmit: (data: StructuredProfileData) => void;
}

const STAGE_OPTIONS = ['大一', '大二', '大三', '大四', '研一', '研二', '已工作'];
const INTENT_OPTIONS: ProfileIntent[] = ['考研', '保研', '就业', '还没想好'];

function normalizeText(value: string): string {
  return value.replace(/\|/g, '｜').replace(/=/g, '＝').trim();
}

export default function ProfileForm({ initialValue, onSubmit }: ProfileFormProps) {
  const [form, setForm] = useState<StructuredProfileData>({
    school: initialValue?.school ?? '',
    major: initialValue?.major ?? '',
    stage: initialValue?.stage ?? STAGE_OPTIONS[2],
    gpa: initialValue?.gpa ?? '',
    internship: initialValue?.internship ?? '',
    research: initialValue?.research ?? '',
    competition: initialValue?.competition ?? '',
    intent: initialValue?.intent ?? '还没想好',
  });

  const canSubmit = useMemo(() => {
    return form.school.trim().length > 0 && form.major.trim().length > 0;
  }, [form.major, form.school]);

  const updateField = <K extends keyof StructuredProfileData>(key: K, value: StructuredProfileData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      school: normalizeText(form.school),
      major: normalizeText(form.major),
      stage: normalizeText(form.stage),
      gpa: normalizeText(form.gpa),
      internship: normalizeText(form.internship),
      research: normalizeText(form.research),
      competition: normalizeText(form.competition),
      intent: form.intent,
    });
  };

  return (
    <div className="message-bubble flex justify-start mb-3">
      <div className="max-w-[96%] sm:max-w-[86%] rounded-2xl rounded-bl-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-sky-50 border border-sky-200 rounded-t-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-[14px] font-semibold text-sky-700">先填一下你的画像，我会给更贴身建议</span>
          </div>
        </div>
        <div className="ai-bubble rounded-t-none border-t-0 px-4 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={form.school}
              onChange={(e) => updateField('school', e.target.value)}
              placeholder="学校名称（必填）"
              className="w-full px-3 py-2 bg-slate-50 text-slate-700 text-[13px] border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-sky-300"
            />
            <input
              value={form.major}
              onChange={(e) => updateField('major', e.target.value)}
              placeholder="专业（必填）"
              className="w-full px-3 py-2 bg-slate-50 text-slate-700 text-[13px] border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-sky-300"
            />
            <select
              value={form.stage}
              onChange={(e) => updateField('stage', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 text-slate-700 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:border-sky-300"
            >
              {STAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input
              value={form.gpa}
              onChange={(e) => updateField('gpa', e.target.value)}
              placeholder="GPA/绩点（如 3.6/4.0）"
              className="w-full px-3 py-2 bg-slate-50 text-slate-700 text-[13px] border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-sky-300"
            />
          </div>

          <textarea
            value={form.internship}
            onChange={(e) => updateField('internship', e.target.value)}
            placeholder="实习经历（可选）"
            rows={2}
            className="w-full px-3 py-2 bg-slate-50 text-slate-700 text-[13px] border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-sky-300 resize-y"
          />
          <textarea
            value={form.research}
            onChange={(e) => updateField('research', e.target.value)}
            placeholder="科研/项目经历（可选）"
            rows={2}
            className="w-full px-3 py-2 bg-slate-50 text-slate-700 text-[13px] border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-sky-300 resize-y"
          />
          <textarea
            value={form.competition}
            onChange={(e) => updateField('competition', e.target.value)}
            placeholder="竞赛/校内活动（可选）"
            rows={2}
            className="w-full px-3 py-2 bg-slate-50 text-slate-700 text-[13px] border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-sky-300 resize-y"
          />

          <div>
            <div className="text-[12px] text-slate-500 mb-1.5">目标意向</div>
            <div className="flex flex-wrap gap-2">
              {INTENT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => updateField('intent', option)}
                  className={`px-3 py-1.5 text-[12px] rounded-full border transition-colors ${
                    form.intent === option
                      ? 'bg-sky-100 text-sky-700 border-sky-300'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-2 text-[13px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-xl hover:bg-sky-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            开始分析
          </button>
        </div>
      </div>
    </div>
  );
}
