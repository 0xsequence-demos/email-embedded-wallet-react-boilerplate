import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { SequenceConnect } from "@0xsequence/connect";
import { config } from "./config.ts";
import { ToastProvider } from "./components/ToastProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SequenceConnect config={config}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </SequenceConnect>
  </StrictMode>
);
