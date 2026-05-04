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
  const hasChatUserMessages = messages.some((message) => message.role === 'user' && message.content.trim().length > 0);
  const showWelcomeHero = mode === 'chat' && !hasChatUserMessages && !isLoading && !isSessionLoading;
  const visibleMessages = showWelcomeHero
    ? currentMessages.filter((message, index) => !(index === 0 && message.role === 'assistant'))
    : currentMessages;

  return (
    <main className="cg-chat-viewport flex min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label="对话消息">
      <div className="mx-auto flex w-full max-w-[880px] min-w-0 flex-col gap-3 px-3 pb-6 pt-4 sm:gap-4 sm:px-5 sm:pb-8 sm:pt-6 lg:px-6 xl:px-8">
        {isSessionLoading && (
          <div className="surface-card rounded-2xl border border-sky-100/80 px-3 py-2.5 text-xs text-sky-700 dark:border-sky-900/60 dark:text-sky-100">
            正在加载会话内容...
          </div>
        )}

        {showWelcomeHero && (
          <div className="surface-card fade-in-up overflow-hidden rounded-[30px] border border-sky-100/80 p-5 shadow-xl shadow-sky-100/60 dark:border-sky-900/50 dark:shadow-black/25 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-blue-600 shadow-lg shadow-sky-200/70 dark:shadow-sky-950/60">
                    <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.42A12.08 12.08 0 0118 14.5c0 1.8-2.69 3.25-6 3.25s-6-1.45-6-3.25c0-1.35.11-2.65-.16-3.92L12 14z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-[22px]">
                        开始你的规划工作台
                      </h2>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                        已接入真实案例库
                      </span>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      说出你的学校、成绩、经历和目标，我会结合真实案例帮你拆解考研、保研、留学和就业路径，并把证据来源一起给你。
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {[
                    ['方向判断', '帮你快速判断适合的升学或求职路径'],
                    ['案例对比', '直接给出相似背景与去向证据'],
                    ['持续追问', '支持连续对话，不用每次重头讲'],
                  ].map(([title, description]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-3 text-left dark:border-slate-700/80 dark:bg-slate-900/50"
                    >
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full max-w-full lg:max-w-[320px]">
                <div className="rounded-[26px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/55">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">试试这些开场问题</div>
                  <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-1 sm:overflow-visible sm:px-0">
                    {[
                      '双非 GPA 3.5 想保研',
                      'GPA 3.2 申请 QS100',
                      '普通一本有实习怎么秋招',
                    ].map((item) => (
                      <button
                        key={item}
                        onClick={() => onSelectSuggestion(item)}
                        className="min-w-[210px] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-sky-950/40 dark:hover:text-sky-200 sm:min-w-0"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
            hasUserMessages={hasChatUserMessages}
            onUpdateStatus={onUpdatePlanStatus}
            onRegenerate={onRegeneratePlan}
            onGeneratePlan={onGeneratePlan}
          />
        )}

        {mode === 'profile_other' && !reportContent && (
          <div className="space-y-2">
            <ScenarioPicker
              value={selectedScenario}
              onChange={onSelectScenario}
              disabled={isLoading}
            />
            {selectedScenario && latestScenarioAssistantMessage && (
              <div className="flex justify-end">
                <button
                  onClick={onCopyScenarioScript}
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[12px] text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-800/70 dark:text-sky-50 dark:hover:bg-sky-700/80"
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

        {visibleMessages.map((message, index) => (
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
          <div className="mt-2 flex justify-center">
            <button
              onClick={onShowFeedback}
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[12px] text-sky-500 transition-colors hover:bg-sky-100 hover:text-sky-600 dark:border-sky-600 dark:bg-sky-800/70 dark:text-sky-50 dark:hover:bg-sky-700/80 dark:hover:text-white"
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
