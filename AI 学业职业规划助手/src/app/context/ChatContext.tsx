import React, { createContext, useContext, useRef, useState } from "react";
import {
  type Message,
  type Session,
  type StudyTask,
  getAIResponse,
  historySessions,
  initialSession,
  initialStudyPlan,
} from "../data/mockData";

interface ChatContextType {
  sessions: Session[];
  currentSessionId: string;
  messages: Message[];
  isTyping: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  switchSession: (id: string) => void;
  createNewSession: () => void;
  sendMessage: (content: string) => void;
  submitProfile: (data: Record<string, string>) => void;
  toggleTask: (taskId: string) => void;
  studyPlanTasks: StudyTask[];
}

const ChatContext = createContext<ChatContextType>({} as ChatContextType);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([
    initialSession,
    ...historySessions,
  ]);
  const [currentSessionId, setCurrentSessionId] = useState(initialSession.id);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [studyPlanTasks, setStudyPlanTasks] = useState<StudyTask[]>(initialStudyPlan);
  const msgCounter = useRef(100);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = currentSession?.messages ?? [];

  const switchSession = (id: string) => {
    setCurrentSessionId(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const createNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession: Session = {
      id: newId,
      title: "新建会话",
      preview: "开始新的规划对话...",
      timestamp: new Date(),
      messages: [
        {
          id: `msg-new-${Date.now()}`,
          type: "ai",
          content:
            "你好！这是一个全新的对话。请告诉我你想探讨的学业或职业规划问题 🎯",
          timestamp: new Date(),
        },
      ],
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const updateCurrentSession = (updater: (msgs: Message[]) => Message[]) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, messages: updater(s.messages) }
          : s
      )
    );
  };

  const sendMessage = (content: string) => {
    if (!content.trim()) return;
    const userMsgId = `msg-${++msgCounter.current}`;
    const userMsg: Message = {
      id: userMsgId,
      type: "user",
      content,
      timestamp: new Date(),
    };

    updateCurrentSession((msgs) => [...msgs, userMsg]);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, preview: content.slice(0, 40) + (content.length > 40 ? "..." : "") }
          : s
      )
    );

    setIsTyping(true);
    const delay = 1200 + Math.random() * 800;

    setTimeout(() => {
      const response = getAIResponse(content);
      const aiMsg: Message = {
        id: `msg-${++msgCounter.current}`,
        type: "ai",
        content: response.content,
        timestamp: new Date(),
        cardType: response.cardType,
        cardData: response.cardType === "study-plan" ? initialStudyPlan : response.cardData,
        similarCases: response.similarCases,
      };
      updateCurrentSession((msgs) => [...msgs, aiMsg]);
      setIsTyping(false);
    }, delay);
  };

  const submitProfile = (data: Record<string, string>) => {
    const userMsg: Message = {
      id: `msg-${++msgCounter.current}`,
      type: "user",
      content: `✅ 已提交个人信息\n学校：${data.school} | 专业：${data.major} | GPA：${data.gpa} | 意向：${data.intention}`,
      timestamp: new Date(),
    };

    updateCurrentSession((msgs) => [...msgs, userMsg]);
    setIsTyping(true);

    setTimeout(() => {
      const aiMsg: Message = {
        id: `msg-${++msgCounter.current}`,
        type: "ai",
        content: `## 个性化规划方案

感谢你提供详细信息！根据你的背景分析：

**优势亮点** ✨
- ${data.school} 的学历背景在申请中具有竞争力
- ${data.major} 专业与目标方向高度匹配

**需要加强** 🔧
- GPA ${data.gpa} ${parseFloat(data.gpa) >= 3.7 ? "表现优秀，请继续保持" : parseFloat(data.gpa) >= 3.5 ? "良好，建议冲刺几门高分课程" : "有提升空间，重点攻克专业核心课"}
- 建议增加 1-2 段科研或实习经历

**推荐方向**：${data.intention || "综合评估后建议申请 Top 30-50 的项目"}

我已为你生成了一份详细的学习计划，请参考下方的时间表 📅`,
        timestamp: new Date(),
        cardType: "study-plan",
        cardData: initialStudyPlan,
      };
      updateCurrentSession((msgs) => [...msgs, aiMsg]);
      setIsTyping(false);
    }, 1500);
  };

  const toggleTask = (taskId: string) => {
    setStudyPlanTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  return (
    <ChatContext.Provider
      value={{
        sessions,
        currentSessionId,
        messages,
        isTyping,
        sidebarOpen,
        setSidebarOpen,
        switchSession,
        createNewSession,
        sendMessage,
        submitProfile,
        toggleTask,
        studyPlanTasks,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => useContext(ChatContext);