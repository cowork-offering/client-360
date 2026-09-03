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

/* REFRACTION IS A TOGGLE, AND IT IS OFF BY DEFAULT.

   The bend is a founder decision that has not been taken yet, so nothing about
   the shipped cockpit changes until the class is on <html>. It is read ONCE at
   boot rather than watched, because the class drives a static stylesheet branch
   and re-reading it would only invite a surface to depend on the query string.

     ?refract=1  (or #refract)  the bend on the static surfaces. This is the
                                configuration the performance gate allows.
     ?refract=2  (or #refract2) the same, PLUS the workroom pane, which the
                                gate took off by default. See the pane note in
                                electric-glass.css.

   `window.c360Refract(on, pane)` flips the same classes live, which is how the
   A/B gets judged side by side in one tab instead of two. */
declare global {
  interface Window {
    c360Refract?: (on: boolean, pane?: boolean) => { refract: boolean; pane: boolean };
  }
}

const REFRACT_CLASS = "eg-refract";
const PANE_CLASS = "eg-refract-pane";

function setRefract(on: boolean, pane = false) {
  const root = document.documentElement;
  root.classList.toggle(REFRACT_CLASS, on);
  root.classList.toggle(PANE_CLASS, on && pane);
  return { refract: on, pane: on && pane };
}

/** "" | "1" | "2", read off the query string first and the hash second. */
function refractRequested() {
  try {
    const q = new URLSearchParams(window.location.search).get("refract");
    const h = window.location.hash.replace(/^#/, "");
    const v = q != null ? q : h === "refract" ? "1" : h === "refract2" ? "2" : "";
    if (v === "" || v === "0" || v === "false") return { on: false, pane: false };
    return { on: true, pane: v === "2" || v === "pane" };
  } catch {
    return { on: false, pane: false };
  }
}

const requested = refractRequested();
setRefract(requested.on, requested.pane);
window.c360Refract = setRefract;

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
