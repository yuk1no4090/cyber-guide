'use client';

import React, { useState, useRef, useEffect } from 'react';
import ChatInput from './components/ChatInput';
import ChatHeader from './components/ChatHeader';
import MessageArea from './components/MessageArea';
import Sidebar from './components/Sidebar';
import LoginModal from './components/LoginModal';
import type { StructuredProfileData } from './components/ProfileForm';
import { useSession } from './hooks/useSession';
import { usePlan } from './hooks/usePlan';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { useSidebarSessions } from './hooks/useSidebarSessions';
import { useChatFlow, type ChatMessageState, type AppMode, generateRecapAction, sendMessageAction, submitFeedbackAction } from './hooks/useChatFlow';
import { useProfileFlow, generateReportAction, handleProfileFormSubmitAction } from './hooks/useProfileFlow';
import { authFetch, unwrapEnvelope } from '@/lib/api';
import { parsePlanQuery } from '@/lib/plan';
import {
  type RelationshipScenario,
  trackScenarioScriptCopied,
} from '@/lib/scenario';
import {
  STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  ACTIVE_SESSION_KEY,
  PROFILE_DATA_PREFIX,
  WELCOME_MESSAGE,
  getWelcomeSuggestions,
  DEFAULT_WELCOME_SUGGESTIONS,
  DEFAULT_CHAT_FOLLOWUP_SUGGESTIONS,
  DEFAULT_PROFILE_FOLLOWUP_SUGGESTIONS,
  PROFILE_CHOOSE,
  PROFILE_SELF_WELCOME,
  PROFILE_OTHER_WELCOME,
  PROFILE_CHOOSE_SUGGESTIONS,
  ACTION_PROFILE_SELF,
  ACTION_PROFILE_OTHER,
  ACTION_GENERATE_REPORT,
  isAction,
  getProfileOtherSuggestions,
  saveToStorage,
  loadFromStorage,
  clearStorage,
  loadProfileFromStorage,
  saveProfileToStorage,
  serializeProfileData,
} from './constants';

type Message = ChatMessageState;

export default function HomeContent() {
  const { sessionId, dataOptIn, toggleDataOptIn } = useSession();
  const {
    user,
    isLoggedIn,
    isLoading: authLoading,
    login,
    register,
    sendRegisterCode,
    loginWithGithub,
    logout,
    upgradeAnonymousSession,
  } = useAuth(sessionId);
  const {
    mode, setMode,
    messages, setMessages,
    suggestions, setSuggestions,
    chatSuggestionsBak, setChatSuggestionsBak,
    isLoading, setIsLoading,
    showDisclaimer, setShowDisclaimer,
    showFeedback, setShowFeedback,
    feedbackDone, setFeedbackDone,
    hadCrisis, setHadCrisis,
    pendingReset, setPendingReset,
    recap, setRecap,
    recapMeta, setRecapMeta,
    isRecapLoading, setIsRecapLoading,
  } = useChatFlow([WELCOME_MESSAGE], DEFAULT_WELCOME_SUGGESTIONS);
  const {
    profileMessages, setProfileMessages,
    reportContent, setReportContent,
    selectedScenario, setSelectedScenario,
    structuredProfile, setStructuredProfile,
    showProfileForm, setShowProfileForm,
    similarCases, setSimilarCases,
    scenarioCopied, setScenarioCopied,
  } = useProfileFlow();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    plans, todayPlan, todayIndex,
    isPlanLoading, isPlanActing, planError,
    generatePlan, updateTodayPlanStatus, regenerateTodayPlan,
  } = usePlan(sessionId, messages);
  const {
    sidebarOpen, setSidebarOpen,
    sessions, setSessions,
    selectedSessionId, setSelectedSessionId,
    isSessionLoading,
    loadSessions,
    loadSessionMessages,
    createSession,
    renameSession,
    deleteSession,
  } = useSidebarSessions({
    sessionId,
    isLoggedIn,
    setMessages,
    setMode,
    welcomeMessage: WELCOME_MESSAGE,
  });

  useEffect(() => {
    setStructuredProfile(loadProfileFromStorage());
    clearStorage();
    setSuggestions(getWelcomeSuggestions());
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (!isLoggedIn) {
      setSessions([]);
      setSelectedSessionId(null);
      try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
      return;
    }
    void (async () => {
      await upgradeAnonymousSession();
      const items = await loadSessions();
      const savedActiveId = (() => {
        try { return localStorage.getItem(ACTIVE_SESSION_KEY); } catch { return null; }
      })();
      const chosen = (savedActiveId && items.some((s) => s.id === savedActiveId))
        ? savedActiveId
        : items[0]?.id || null;
      if (chosen) {
        await loadSessionMessages(chosen);
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isLoggedIn]);

  useEffect(() => {
    if (!sessionId || !isLoggedIn) return;
    void (async () => {
      try {
        const res = await authFetch(sessionId, '/api/profile', { method: 'GET' }, 8_000);
        const raw = await res.json();
        const payload = unwrapEnvelope<{ profile: StructuredProfileData }>(raw);
        if (payload?.profile) {
          setStructuredProfile(payload.profile);
          saveProfileToStorage(payload.profile);
        }
      } catch {
        // ignore profile sync errors
      }
    })();
  }, [sessionId, isLoggedIn]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const totalMsgs = messages.length + profileMessages.length;
      if (totalMsgs >= 5 && !feedbackDone) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [messages, profileMessages, feedbackDone]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, profileMessages, isLoading, suggestions, reportContent]);

  const isProfileMode = mode === 'profile' || mode === 'profile_other';
  const currentMessages = mode === 'chat' ? messages : profileMessages;

  const toApiMessages = (sourceMessages: Message[]): Array<{ role: 'user' | 'assistant'; content: string }> => {
    const payload: Array<{ role: 'user' | 'assistant'; content: string }> = sourceMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const profile = structuredProfile ?? loadProfileFromStorage();
    if (!profile) return payload;
    const serialized = serializeProfileData(profile);
    if (payload.some((m) => m.role === 'user' && m.content.startsWith(PROFILE_DATA_PREFIX))) {
      return payload;
    }
    return [{ role: 'user', content: serialized }, ...payload];
  };

  const sendSessionMetrics = async (msgs: Message[], currentMode: AppMode) => {
    if (!dataOptIn || !sessionId) return;
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return;
    const avgLen = userMsgs.reduce((sum, m) => sum + m.content.length, 0) / userMsgs.length;
    const lastUserMsg = userMsgs[userMsgs.length - 1]?.content || '';
    const summary = lastUserMsg.length > 60 ? lastUserMsg.slice(0, 60) : lastUserMsg;
    try {
      await authFetch(sessionId, '/api/metrics', {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          mode: currentMode,
          conversation_turns: Math.floor(msgs.length / 2),
          user_msg_count: userMsgs.length,
          avg_user_msg_length: Math.round(avgLen * 10) / 10,
          had_crisis: hadCrisis,
          summary,
        }),
      });
    } catch {}
  };

  const startNewChat = () => {
    if (messages.length >= 5 && !feedbackDone && !showFeedback) {
      setPendingReset(true);
      setShowFeedback(true);
      return;
    }
    doResetChat();
  };

  const doResetChat = () => {
    sendSessionMetrics(messages, mode);
    clearStorage();
    setMessages([WELCOME_MESSAGE]);
    setProfileMessages([]);
    setSuggestions(getWelcomeSuggestions());
    setMode('chat');
    setShowFeedback(false);
    setFeedbackDone(false);
    setHadCrisis(false);
    setPendingReset(false);
    setRecap(null);
    setRecapMeta(undefined);
    setSelectedScenario(null);
    setSimilarCases([]);
    setReportContent(null);
    setShowProfileForm(false);
    setIsLoading(false);
    setSelectedSessionId(null);
    try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
    if (isLoggedIn) {
      void createSession();
    }
  };

  const startProfile = () => {
    setChatSuggestionsBak(suggestions);
    setMode('profile');
    setProfileMessages([PROFILE_CHOOSE]);
    setSuggestions(PROFILE_CHOOSE_SUGGESTIONS);
    setReportContent(null);
    setSelectedScenario(null);
    setShowProfileForm(false);
    setSimilarCases([]);
  };

  const backToChat = () => {
    if (profileMessages.length >= 5 && !feedbackDone && !showFeedback) {
      setShowFeedback(true);
      return;
    }
    doBackToChat();
  };

  const doBackToChat = () => {
    sendSessionMetrics(profileMessages, mode);
    setMode('chat');
    setSuggestions(chatSuggestionsBak.length > 0 ? chatSuggestionsBak : (messages.length <= 1 ? getWelcomeSuggestions() : []));
    setReportContent(null);
    setSelectedScenario(null);
    setShowProfileForm(false);
  };

  const maybeAnswerPlanQuestion = (content: string): string | null => {
    const query = parsePlanQuery(content, todayIndex);
    if (!query) return null;
    if (isPlanLoading || plans.length === 0) return null;

    if (query.kind === 'all') {
      const lines = plans.map((plan) => `Day ${plan.day_index}/7：${plan.task_text}`);
      return `你的 7 天微行动计划是：\n${lines.join('\n')}`;
    }

    const dayIndex = query.day_index;
    if (dayIndex < 1 || dayIndex > 7) {
      return '我这套计划只有 1-7 天。你想问第几天？';
    }

    const plan = plans.find((item) => item.day_index === dayIndex);
    if (!plan) {
      return null;
    }

    const statusText = plan.status === 'done' ? '✅ 已完成' : plan.status === 'skipped' ? '⏭ 已跳过' : '🕒 待完成';
    return `Day ${plan.day_index}/7：${plan.task_text}\n状态：${statusText}\n如果你愿意，我也可以帮你把这个任务拆成更小的 2-3 步。`;
  };

  const generateRecap = async () => {
    await generateRecapAction({
      sessionId,
      messages,
      toApiMessages,
      setRecap,
      setRecapMeta,
      setSuggestions,
      setIsRecapLoading,
    });
  };

  const copyLatestScenarioScript = async () => {
    if (!selectedScenario) return;
    const latestAssistant = [...profileMessages].reverse().find(m => m.role === 'assistant');
    if (!latestAssistant?.content) return;

    const startedAt = Date.now();
    try {
      await navigator.clipboard.writeText(latestAssistant.content);
      setScenarioCopied(true);
      trackScenarioScriptCopied(selectedScenario, {
        success: true,
        latency_ms: Date.now() - startedAt,
        error_type: 'none',
      });
      setTimeout(() => setScenarioCopied(false), 1500);
    } catch {
      trackScenarioScriptCopied(selectedScenario, {
        success: false,
        latency_ms: Date.now() - startedAt,
        error_type: 'clipboard_error',
      });
    }
  };

  const generateReport = async () => {
    await generateReportAction({
      profileMessages,
      mode: mode === 'profile_other' ? 'profile_other' : 'profile',
      selectedScenario,
      sessionId,
      toApiMessages,
      setIsLoading,
      setReportContent,
      setSuggestions,
    });
  };

  const handleProfileFormSubmit = (data: StructuredProfileData) => {
    void handleProfileFormSubmitAction({
      data,
      isLoggedIn,
      sessionId,
      saveProfileToStorage,
      setStructuredProfile,
      setShowProfileForm,
      sendMessage,
    });
  };

  const sendMessage = async (content: string) => {
    // ===== Action routing =====
    if (isAction(content)) {
      if (content === ACTION_PROFILE_SELF && mode === 'profile') {
        setSelectedScenario(null);
        setProfileMessages([PROFILE_SELF_WELCOME]);
        setShowProfileForm(true);
        setSuggestions([]);
        setSimilarCases([]);
        return;
      }
      if (content === ACTION_PROFILE_OTHER && mode === 'profile') {
        setMode('profile_other');
        setSelectedScenario(null);
        setProfileMessages([PROFILE_OTHER_WELCOME]);
        setSuggestions(getProfileOtherSuggestions());
        setShowProfileForm(false);
        setSimilarCases([]);
        return;
      }
      if (content === ACTION_GENERATE_REPORT && isProfileMode) {
        generateReport();
        return;
      }
      return;
    }

    // ===== Legacy text matching =====
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('了解我自己')) {
      setSelectedScenario(null);
      setProfileMessages([PROFILE_SELF_WELCOME]);
      setShowProfileForm(true);
      setSuggestions([]);
      setSimilarCases([]);
      return;
    }
    if (mode === 'profile' && profileMessages.length === 1 && content.includes('看懂身边的人')) {
      setMode('profile_other');
      setSelectedScenario(null);
      setProfileMessages([PROFILE_OTHER_WELCOME]);
      setSuggestions(getProfileOtherSuggestions());
      setShowProfileForm(false);
      setSimilarCases([]);
      return;
    }
    if ((mode === 'profile' || mode === 'profile_other') && (content.includes('结束画像') || content.includes('生成画像') || content.includes('看看分析'))) {
      generateReport();
      return;
    }

    if (!isProfileMode) {
      const planAnswer = maybeAnswerPlanQuestion(content);
      if (planAnswer) {
        const userMessage: Message = { role: 'user', content };
        const updatedMessages = [...messages, userMessage];
        setRecap(null);
        setRecapMeta(undefined);
        setMessages([...updatedMessages, { role: 'assistant', content: planAnswer }]);
        setSuggestions([]);
        return;
      }
    }

    await sendMessageAction({
      content,
      mode,
      isProfileMode,
      selectedScenario,
      sessionId,
      isLoggedIn,
      selectedSessionId,
      createSession,
      setSelectedSessionId,
      loadSessions,
      messages,
      profileMessages,
      toApiMessages,
      setRecap,
      setRecapMeta,
      setMessages,
      setProfileMessages,
      setSuggestions,
      setIsLoading,
      setHadCrisis,
      setSimilarCases,
      defaultProfileSuggestions: DEFAULT_PROFILE_FOLLOWUP_SUGGESTIONS,
      defaultChatSuggestions: DEFAULT_CHAT_FOLLOWUP_SUGGESTIONS,
    });
  };

  const submitFeedback = async (rating: number, feedback: string | null, saveChat: boolean) => {
    await submitFeedbackAction({
      saveChat,
      sessionId,
      currentMessages,
          rating,
          feedback,
          hadCrisis,
          mode,
      setFeedbackDone,
      pendingReset,
      isProfileMode,
      doResetChat,
      doBackToChat,
    });
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    setFeedbackDone(true);
    if (pendingReset) doResetChat();
    else if (isProfileMode) doBackToChat();
  };

  const canShowFeedback = !isProfileMode && messages.length >= 9 && !showFeedback && !feedbackDone;
  const userTurnCount = messages.filter(m => m.role === 'user').length;
  const canGenerateRecap = mode === 'chat' && userTurnCount >= 2 && !isLoading && !isRecapLoading;
  const hasUserAskedInProfile = profileMessages.some(m => m.role === 'user');
  const latestScenarioAssistantMessage = hasUserAskedInProfile
    ? [...profileMessages].reverse().find(m => m.role === 'assistant' && m.content.trim().length > 0)
    : undefined;

  return (
    <>
      <div className="bg-gradient-mesh flex h-screen overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0 md:w-[260px]' : '-translate-x-full md:w-0'
          } fixed md:relative z-30 left-0 top-0 h-full w-[260px] overflow-hidden transition-[transform,width] duration-300 ease-in-out md:translate-x-0`}
        >
          <Sidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            darkMode={darkMode}
            user={user}
            onToggleDarkMode={toggleDarkMode}
            onToggleSidebar={() => setSidebarOpen(false)}
            onSelectSession={loadSessionMessages}
            onNewSession={doResetChat}
            onRenameSession={renameSession}
            onDeleteSession={deleteSession}
            onLoginClick={() => setShowLoginModal(true)}
            onLogout={logout}
          />
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ChatHeader
            mode={mode}
            darkMode={darkMode}
            isLoggedIn={isLoggedIn}
            authLoading={authLoading}
            isLoading={isLoading}
            isRecapLoading={isRecapLoading}
            isProfileMode={isProfileMode}
            canGenerateRecap={canGenerateRecap}
            showDisclaimer={showDisclaimer}
            showFeedback={showFeedback}
            feedbackDone={feedbackDone}
            dataOptIn={dataOptIn}
            reportContent={reportContent}
            profileMessages={profileMessages}
            messages={messages}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onToggleDarkMode={toggleDarkMode}
            onToggleDataOptIn={toggleDataOptIn}
            onLoginClick={() => setShowLoginModal(true)}
            onStartNewChat={startNewChat}
            onStartProfile={startProfile}
            onBackToChat={backToChat}
            onGenerateRecap={generateRecap}
            onGenerateReport={generateReport}
            onDismissDisclaimer={() => setShowDisclaimer(false)}
          />

          <MessageArea
            mode={mode}
            isProfileMode={isProfileMode}
            isLoading={isLoading}
            isSessionLoading={isSessionLoading}
            currentMessages={currentMessages}
              plans={plans}
              todayPlan={todayPlan}
              todayIndex={todayIndex}
              isPlanLoading={isPlanLoading}
              isPlanActing={isPlanActing}
              planError={planError}
              sessionId={sessionId}
            messages={messages}
            onUpdatePlanStatus={updateTodayPlanStatus}
            onRegeneratePlan={regenerateTodayPlan}
              onGeneratePlan={generatePlan}
            selectedScenario={selectedScenario}
            onSelectScenario={setSelectedScenario}
            scenarioCopied={scenarioCopied}
            onCopyScenarioScript={copyLatestScenarioScript}
            hasUserAskedInProfile={hasUserAskedInProfile}
            latestScenarioAssistantMessage={latestScenarioAssistantMessage}
            showProfileForm={showProfileForm}
            structuredProfile={structuredProfile}
            onProfileFormSubmit={handleProfileFormSubmit}
            reportContent={reportContent}
            onCloseReport={backToChat}
            similarCases={similarCases}
              recap={recap}
            recapMeta={recapMeta}
            onCloseRecap={() => setRecap(null)}
            showFeedback={showFeedback}
            feedbackDone={feedbackDone}
            canShowFeedback={canShowFeedback}
            onSubmitFeedback={submitFeedback}
            onSkipFeedback={handleFeedbackSkip}
            onShowFeedback={() => setShowFeedback(true)}
              suggestions={suggestions}
            onSelectSuggestion={sendMessage}
            messagesEndRef={messagesEndRef}
          />

          <footer className="border-t border-slate-200/80 dark:border-slate-700/80 bg-white/85 dark:bg-[#0f172a]/90 px-4 pt-3 pb-4 backdrop-blur-xl">
            <div className="max-w-3xl mx-auto">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading || isRecapLoading || !!reportContent || showProfileForm}
          />
        </div>
          </footer>
        </div>
      </div>
      <LoginModal
        open={showLoginModal}
        loading={authLoading}
        onClose={() => setShowLoginModal(false)}
        onLogin={async (email, password) => {
          const anonymousToken = await login(email, password);
          await upgradeAnonymousSession(anonymousToken);
          await loadSessions();
        }}
        onRegister={async (email, password, emailCode, nickname) => {
          const anonymousToken = await register(email, password, emailCode, nickname);
          await upgradeAnonymousSession(anonymousToken);
          await loadSessions();
        }}
        onSendCode={sendRegisterCode}
        onGithub={loginWithGithub}
      />
    </>
  );
}
