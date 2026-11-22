import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { toast } from "./components/ui";
import { applyTheme, getTheme } from "./lib/theme";
import "./index.css";

applyTheme(getTheme());

// a failed database write would otherwise go unnoticed
window.addEventListener("unhandledrejection", (e) =>
  toast(`Fehler: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`),
);

// no browser menu (reload, inspect …) on right-click, like Slate; text fields keep copy/paste
window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("input, textarea, [contenteditable], .selectable")) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
