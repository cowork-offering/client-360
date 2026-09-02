import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/tailwind.css";
import { App } from "./App";
import { acquireMcp } from "./channel/mcp";
import { acquireSample } from "./channel/sampleDoor";
import { acquireDb } from "./channel/dbDoor";
import { installSampleGateReadout } from "./channel/sampleMetrics";
import { installIntentReadout, startIntentWatch } from "./intent/store";

const root = document.getElementById("root");
if (root) {
  // The 0.2.x runtime hands out the connector namespace asynchronously via
  // claude.use("mcp"). Acquire it BEFORE first render so every synchronous
  // mcpAvailable() gate downstream keeps its meaning. Resolves in microseconds
  // when the runtime is present and falls through cleanly (bounded) when not.
  // THE SESSION DOOR IS ACQUIRED THE SAME WAY, and for the same reason:
  // claude.use("sample") resolves asynchronously (null, in the worst case, about
  // ten seconds after load), so both doors settle before first render and every
  // synchronous availability gate downstream keeps its meaning. Neither can
  // fail: absence is a state, and the room renders for it.
  installSampleGateReadout();
  installIntentReadout();
  // THE THIRD DOOR, ACQUIRED THE SAME WAY AND FOR THE SAME REASON. The intent
  // store is `claude.use("db")`, which resolves asynchronously and resolves
  // NULL on most views; settling it before first render keeps `dbAvailable()`
  // meaningful everywhere downstream. The watch is opened once acquisition has
  // settled, so a page with no store never subscribes to anything and every
  // surface renders exactly as it did before the lane existed.
  void Promise.all([acquireMcp(), acquireSample(), acquireDb()]).finally(() => {
    startIntentWatch();
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
