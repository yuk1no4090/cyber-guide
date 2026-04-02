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
    <main className="flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label="对话消息">
      <div className="px-3 sm:px-5 lg:px-8 py-4 sm:py-6 space-y-1">
        {isSessionLoading && (
          <div className="rounded-lg border border-sky-100 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-900/40 px-3 py-2 text-xs text-sky-700 dark:text-sky-100">
            正在加载会话内容...
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
