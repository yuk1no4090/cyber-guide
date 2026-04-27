import React from 'react';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import SuggestionChips from './SuggestionChips';
import ProfileReport from './ProfileReport';
import FeedbackCard from './FeedbackCard';
import RecapCard from './RecapCard';
import ScenarioPicker from './ScenarioPicker';
import PlanCard from './PlanCard';
import ProfileForm, { type StructuredProfileData } from './ProfileForm';
import SimilarCasesCard, { type SimilarCaseItem } from './SimilarCasesCard';
import type { AppMode, ChatMessageState } from '../hooks/useChatFlow';
import type { PlanItem, PlanStatus } from '../hooks/usePlan';
import type { Recap } from '@/lib/recap';
import type { RelationshipScenario } from '@/lib/scenario';

interface MessageAreaProps {
  mode: AppMode;
  isProfileMode: boolean;
  isLoading: boolean;
  isSessionLoading: boolean;
  currentMessages: ChatMessageState[];
  // Plan
  plans: PlanItem[];
  todayPlan: PlanItem | null;
  todayIndex: number;
  isPlanLoading: boolean;
  isPlanActing: boolean;
  planError: string | null;
  sessionId: string;
  messages: ChatMessageState[];
  onUpdatePlanStatus: (status: Extract<PlanStatus, 'done' | 'skipped'>) => void;
  onRegeneratePlan: () => void;
  onGeneratePlan: () => void;
  // Scenario
  selectedScenario: RelationshipScenario | null;
  onSelectScenario: (s: RelationshipScenario | null) => void;
  scenarioCopied: boolean;
  onCopyScenarioScript: () => void;
  hasUserAskedInProfile: boolean;
  latestScenarioAssistantMessage: ChatMessageState | undefined;
  // Profile form
  showProfileForm: boolean;
  structuredProfile: StructuredProfileData | null;
  onProfileFormSubmit: (data: StructuredProfileData) => void;
  // Report
  reportContent: string | null;
  onCloseReport: () => void;
  // Similar cases
  similarCases: SimilarCaseItem[];
  // Recap
  recap: Recap | null;
  recapMeta: Record<string, unknown> | undefined;
  onCloseRecap: () => void;
  // Feedback
  showFeedback: boolean;
  feedbackDone: boolean;
  canShowFeedback: boolean;
  onSubmitFeedback: (rating: number, feedback: string | null, saveChat: boolean) => Promise<void>;
  onSkipFeedback: () => void;
  onShowFeedback: () => void;
  // Suggestions
  suggestions: string[];
  onSelectSuggestion: (s: string) => void;
  // Ref
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function MessageArea({
  mode,
  isProfileMode,
  isLoading,
  isSessionLoading,
  currentMessages,
  plans,
  todayPlan,
  todayIndex,
  isPlanLoading,
  isPlanActing,
  planError,
  sessionId,
  messages,
  onUpdatePlanStatus,
  onRegeneratePlan,
  onGeneratePlan,
  selectedScenario,
  onSelectScenario,
  scenarioCopied,
  onCopyScenarioScript,
  hasUserAskedInProfile,
  latestScenarioAssistantMessage,
  showProfileForm,
  structuredProfile,
  onProfileFormSubmit,
  reportContent,
  onCloseReport,
  similarCases,
  recap,
  recapMeta,
  onCloseRecap,
  showFeedback,
  feedbackDone,
  canShowFeedback,
  onSubmitFeedback,
  onSkipFeedback,
  onShowFeedback,
  suggestions,
  onSelectSuggestion,
  messagesEndRef,
}: MessageAreaProps) {
  return (
    <main className="flex-1 overflow-y-auto overscroll-contain cg-chat-shell" role="log" aria-live="polite" aria-label="对话消息">
      <div className="mx-auto max-w-3xl px-3 sm:px-5 py-4 sm:py-6 space-y-1">
        {isSessionLoading && (
          <div className="rounded-lg border border-sky-100 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-900/40 px-3 py-2 text-xs text-sky-700 dark:text-sky-100">
            正在加载会话内容...
          </div>
        )}

        {/* 欢迎态：有初始欢迎语时也展示视觉入口 */}
        {mode === 'chat' && !messages.some((m) => m.role === 'user') && !isLoading && !isSessionLoading && (
          <div className="mb-5 rounded-[28px] border border-sky-100/80 dark:border-sky-900/50 bg-white/80 dark:bg-slate-900/70 p-5 sm:p-6 shadow-xl shadow-sky-100/60 dark:shadow-black/25 backdrop-blur-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-blue-600 shadow-lg shadow-sky-200/70 dark:shadow-sky-950/60">
                <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.42A12.08 12.08 0 0118 14.5c0 1.8-2.69 3.25-6 3.25s-6-1.45-6-3.25c0-1.35.11-2.65-.16-3.92L12 14z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-xl">
                    开始你的规划之旅
                  </h2>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                    已接入真实案例库
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-300">
                  告诉我你的学校、成绩、经历和目标，我会帮你找相似背景的考研、保研、留学或就业路径，并附上原文案例。
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {['双非 GPA 3.5 想保研', 'GPA 3.2 申请 QS100', '普通一本有实习怎么秋招'].map((item) => (
                <button
                  key={item}
                  onClick={() => onSelectSuggestion(item)}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'chat' && (
          <PlanCard
            plans={plans}
            todayPlan={todayPlan}
            todayIndex={todayIndex}
            isPlanLoading={isPlanLoading}
            isPlanActing={isPlanActing}
            planError={planError}
            sessionId={sessionId}
            hasUserMessages={messages.some((m) => m.role === 'user' && m.content.trim().length > 0)}
            onUpdateStatus={onUpdatePlanStatus}
            onRegenerate={onRegeneratePlan}
            onGeneratePlan={onGeneratePlan}
          />
        )}

        {mode === 'profile_other' && !reportContent && (
          <div className="mb-2">
            <ScenarioPicker
              value={selectedScenario}
              onChange={onSelectScenario}
              disabled={isLoading}
            />
            {selectedScenario && latestScenarioAssistantMessage && (
              <div className="flex justify-end mt-1">
                <button
                  onClick={onCopyScenarioScript}
                  className="px-2.5 py-1.5 text-[12px] text-sky-700 dark:text-sky-50 bg-sky-50 dark:bg-sky-800/70 border border-sky-200 dark:border-sky-600 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-700/80 transition-colors"
                >
                  {scenarioCopied ? '✅ 已复制话术' : '📋 复制上一条话术'}
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'profile' && showProfileForm && (
          <ProfileForm
            initialValue={structuredProfile ?? undefined}
            onSubmit={onProfileFormSubmit}
          />
        )}

        {currentMessages.map((message, index) => (
          <ChatMessage
            key={`${mode}-${index}`}
            role={message.role}
            content={message.content}
            isCrisis={message.isCrisis}
            evidence={message.evidence}
            animationDelayMs={Math.min(index * 24, 260)}
          />
        ))}

        {!reportContent && similarCases.length > 0 && (
          <SimilarCasesCard cases={similarCases} />
        )}

        {isLoading && <TypingIndicator />}

        {reportContent && (
          <ProfileReport content={reportContent} onClose={onCloseReport} isOtherMode={mode === 'profile_other'} />
        )}

        {mode === 'chat' && recap && (
          <RecapCard
            recap={recap}
            generationMeta={recapMeta}
            onClose={onCloseRecap}
          />
        )}

        {showFeedback && !feedbackDone && (
          <FeedbackCard
            onSubmit={onSubmitFeedback}
            onSkip={onSkipFeedback}
          />
        )}

        {!isLoading && !reportContent && !showFeedback && suggestions.length > 0 && (
          <SuggestionChips
            suggestions={suggestions}
            onSelect={onSelectSuggestion}
            disabled={isLoading}
          />
        )}

        {canShowFeedback && !isLoading && (
          <div className="flex justify-center mt-3">
            <button
              onClick={onShowFeedback}
              className="px-3 py-1.5 text-[12px] text-sky-500 dark:text-sky-50 bg-sky-50 dark:bg-sky-800/70 border border-sky-200 dark:border-sky-600 rounded-full hover:bg-sky-100 dark:hover:bg-sky-700/80 hover:text-sky-600 dark:hover:text-white transition-colors"
            >
              💬 聊完了？给我打个分吧
            </button>
          </div>
        )}

        <div ref={messagesEndRef} className="h-1" />
      </div>
    </main>
  );
}
