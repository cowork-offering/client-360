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

     ?refract=1  (or #refract)   THE BEND. Every glass surface including the
                                 workroom pane, which the founder approved on
                                 2026-09-03 after seeing it, plus the pane's
                                 depth pass. The headless fps numbers in the
                                 addendum still stand and are still worth
                                 reading; the call on them is his to make on
                                 his own machine.
     ?refract=2  (or #refract2)  KEPT AS AN ALIAS of 1. It used to be the only
                                 way to get the pane on the bend; every link
                                 already written with it lands where it did.
     ?refract=3  (or #refract3)  LIQUID. The bend turned up until it is the
                                 point rather than a suggestion: clearer glass
                                 over a thinner frost, an edge lens instead of
                                 a uniform wobble, chromatic fringe at the rim,
                                 a ground that drifts, and a specular sweep.

   `window.c360Refract(on, liquid)` flips the same classes live, which is how
   the A/B gets judged side by side in one tab instead of three. */
declare global {
  interface Window {
    c360Refract?: (on: boolean, liquid?: boolean) => { refract: boolean; liquid: boolean };
  }
}

const REFRACT_CLASS = "eg-refract";
/* The pane class survives its own promotion. The stylesheet still branches on
   it, and holding it means an old ?refract=2 link and the live A/B helper both
   keep working without a second code path. */
const PANE_CLASS = "eg-refract-pane";
const LIQUID_CLASS = "eg-liquid";

function setRefract(on: boolean, liquid = false) {
  const root = document.documentElement;
  root.classList.toggle(REFRACT_CLASS, on);
  root.classList.toggle(PANE_CLASS, on);
  root.classList.toggle(LIQUID_CLASS, on && liquid);
  return { refract: on, liquid: on && liquid };
}

/** "" | "1" | "2" | "3", read off the query string first and the hash second. */
function refractRequested() {
  try {
    const q = new URLSearchParams(window.location.search).get("refract");
    const h = window.location.hash.replace(/^#/, "");
    const v =
      q != null
        ? q
        : h === "refract"
          ? "1"
          : h === "refract2"
            ? "2"
            : h === "refract3"
              ? "3"
              : "";
    if (v === "" || v === "0" || v === "false") return { on: false, liquid: false };
    return { on: true, liquid: v === "3" || v === "liquid" };
  } catch {
    return { on: false, liquid: false };
  }
}

const requested = refractRequested();
setRefract(requested.on, requested.liquid);
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
