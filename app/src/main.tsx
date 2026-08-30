import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/tailwind.css";
import { App } from "./App";
import { acquireMcp } from "./channel/mcp";

const root = document.getElementById("root");
if (root) {
  // The 0.2.x runtime hands out the connector namespace asynchronously via
  // claude.use("mcp"). Acquire it BEFORE first render so every synchronous
  // mcpAvailable() gate downstream keeps its meaning. Resolves in microseconds
  // when the runtime is present and falls through cleanly (bounded) when not.
  void acquireMcp().finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
