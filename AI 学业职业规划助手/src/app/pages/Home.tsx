import React from "react";
import { Sidebar } from "../components/Sidebar";
import { TopNav } from "../components/TopNav";
import { ChatArea } from "../components/ChatArea";
import { InputArea } from "../components/InputArea";

export function Home() {
  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#0f172a]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav />
        <ChatArea />
        <InputArea />
      </div>
    </div>
  );
}
