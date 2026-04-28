import React, { useState } from "react";
import { User, ChevronRight, Sparkles } from "lucide-react";
import { useChat } from "../context/ChatContext";

const gradeOptions = ["大一", "大二", "大三", "大四", "研一", "研二", "已毕业"];
const intentionOptions = [
  "申请美国 CS 硕士",
  "申请美国 CS 博士",
  "申请英国/欧洲硕士",
  "国内保研/考研",
  "求职（互联网）",
  "求职（金融科技）",
  "转行/职业转型",
];

export function UserProfileForm() {
  const { submitProfile } = useChat();
  const [form, setForm] = useState({
    school: "",
    major: "",
    grade: "",
    gpa: "",
    targetSchool: "",
    targetMajor: "",
    intention: "",
    extraInfo: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.school || !form.major || !form.gpa) return;
    setSubmitted(true);
    submitProfile(form);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 mt-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
        <span className="text-emerald-500 text-lg">✅</span>
        <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          信息已提交，正在为你生成个性化方案...
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 flex items-center gap-2">
        <User size={16} className="text-white" />
        <span className="text-sm font-semibold text-white">用户画像表单</span>
        <Sparkles size={14} className="text-sky-200 ml-auto" />
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              当前学校 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="如：北京大学"
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100 transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              当前专业 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="如：计算机科学"
              value={form.major}
              onChange={(e) => setForm({ ...form, major: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100 transition-all"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              年级
            </label>
            <select
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent text-slate-800 dark:text-slate-100 transition-all"
            >
              <option value="">请选择</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              GPA <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="如：3.7 / 4.0"
              value={form.gpa}
              onChange={(e) => setForm({ ...form, gpa: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100 transition-all"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            意向目标
          </label>
          <select
            value={form.intention}
            onChange={(e) => setForm({ ...form, intention: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent text-slate-800 dark:text-slate-100 transition-all"
          >
            <option value="">请选择意向方向</option>
            {intentionOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              目标学校（选填）
            </label>
            <input
              type="text"
              placeholder="如：CMU, Stanford"
              value={form.targetSchool}
              onChange={(e) => setForm({ ...form, targetSchool: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              目标专业（选填）
            </label>
            <input
              type="text"
              placeholder="如：MSCS, MIS"
              value={form.targetMajor}
              onChange={(e) => setForm({ ...form, targetMajor: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            补充说明（选填���
          </label>
          <textarea
            placeholder="其他相关经历、特殊情况或具体问题..."
            value={form.extraInfo}
            onChange={(e) => setForm({ ...form, extraInfo: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500 text-slate-800 dark:text-slate-100 transition-all resize-none"
          />
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-semibold transition-colors duration-200 shadow-sm shadow-sky-200 dark:shadow-sky-900/30"
        >
          <Sparkles size={14} />
          生成个性化规划方案
          <ChevronRight size={14} />
        </button>
      </form>
    </div>
  );
}
