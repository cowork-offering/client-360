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
import { bootGlass, setGlass, type GlassMode } from "./glassMode";

/* THE GLASS MODE IS DECIDED IN ONE PLACE, AND IT IS NOT THIS ONE.

   `glassMode.ts` owns the precedence (query, then localStorage, then liquid),
   the class names and the persistence; this file only asks it to run before
   React mounts, so the first paint is already in the right material and no
   surface flashes frost on its way to glass.

   LIQUID IS THE DEFAULT AS OF 2026-09-03. `?refract=0` forces the frost the
   cockpit shipped with and `?refract=1` the subtle bend, both for previews.

   `window.c360Glass("liquid" | "subtle" | "frost")` flips it live, and
   `window.c360Refract(on, liquid)` is kept as a shim over it because it is in
   the compare-page notes and in muscle memory. Neither is how the founder
   switches mid-demo: that is the command palette. */
declare global {
  interface Window {
    c360Glass?: (mode: GlassMode) => GlassMode;
    c360Refract?: (on: boolean, liquid?: boolean) => { refract: boolean; liquid: boolean };
  }
}

bootGlass();
window.c360Glass = setGlass;
window.c360Refract = (on: boolean, liquid = false) => {
  const mode = setGlass(!on ? "frost" : liquid ? "liquid" : "subtle");
  return { refract: mode !== "frost", liquid: mode === "liquid" };
};

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
  /* THE SHARE LINK HAS NO RUNTIME, AND IT SHOULD NOT PAY FOR ONE.

     `window.claude` is injected before any script runs wherever the artifact is
     pinned, so its absence at this point is not a race, it is the answer: this
     page was opened as plain HTML (a share link, a local file, a screenshot
     harness) and every door will resolve to null. Waiting on three promises to
     be told so costs a microtask hop and a scheduler turn before the first
     pixel, on the one path where nothing can possibly come back.

     So: mount FIRST, then let the three acquisitions run behind the paint. They
     are still called, and still called in the same order, so a runtime that
     appears late is picked up exactly as it would have been; the only thing
     that changed is that the worklist is on the screen while that happens.
     Every synchronous gate downstream keeps its meaning because all three
     resolve to "absent", which is what they would have resolved to anyway.

     WHEN `window.claude` EXISTS, NOTHING BELOW CHANGES. The awaited path is the
     one it always was, character for character, because a runtime that IS there
     must settle before first render or `mcpAvailable()` lies for a frame. */
  const mount = () => {
    startIntentWatch();
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  };
  const doors = () => Promise.all([acquireMcp(), acquireSample(), acquireDb()]);
  if (typeof window !== "undefined" && (window as unknown as { claude?: unknown }).claude === undefined) {
    mount();
    /* The watch is re-armed once the doors have settled, for the one case this
       branch cannot rule out: a runtime that injects itself after the document
       has parsed. `startIntentWatch` returns its existing unsubscribe when it
       already holds one, so the second call is free. */
    void doors().finally(() => startIntentWatch());
  } else {
    void doors().finally(mount);
  }
}
