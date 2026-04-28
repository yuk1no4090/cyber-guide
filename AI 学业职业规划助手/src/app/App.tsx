import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ThemeProvider } from "./context/ThemeContext";
import { ChatProvider } from "./context/ChatContext";

export default function App() {
  return (
    <ThemeProvider>
      <ChatProvider>
        <RouterProvider router={router} />
      </ChatProvider>
    </ThemeProvider>
  );
}
