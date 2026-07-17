import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/app-error-boundary";

// KaTeX CSS is loaded lazily by markdown.ts when math is first detected.
// Do NOT import it here — it blocks the initial JS parse.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
