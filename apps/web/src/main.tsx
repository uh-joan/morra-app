import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./react/App.js";
import { store } from "./appSingletons.js";
import "./style.css";

// Test-only hook for the M4 integration harness: exposes the store so a
// headless test can inject synthetic recognizer results
// (onHandOnset/onAudioWindowResult/onWordResult) instead of driving real
// camera/mic/MediaPipe/vosk devices end to end — per the M4 dispatch's
// "fake devices + injected recognizer results via the platform-web test
// seams". Gated behind an explicit ?e2e query param so it's never present
// during normal use.
if (new URLSearchParams(window.location.search).has("e2e")) {
  (window as unknown as { __morraTestHooks: { store: typeof store } }).__morraTestHooks = { store };
}

const container = document.getElementById("root");
if (!container) throw new Error("main.tsx: #root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
