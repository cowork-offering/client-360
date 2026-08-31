import { useEffect } from "react";
import { useApp } from "../state/appState";
import { mcpAvailable } from "../channel/mcp";
import { BrandGlyph } from "./brand";
import { CMDK_OPEN_EVENT } from "./CommandPalette";

/* =============================================================================
   THE APP HEADER — DIRECTION-LOCKED rule 45.

   MINIMAL. The original ">" alone carries the brand (no "accenture" wordmark,
   no divider), then "Credit 360", then the workspace capsule dead-centre, then
   a spacer, a live dot, the cmd-K chip and the avatar. 52px slim glass bar. The
   spelled-out "accenture / Commercial Credit 360 / Live · nCino + AFS" header
   is retired, and the user's name and snapshot date went with it: the briefing
   kicker carries the date now, and the avatar carries the name.

   THE CAPSULE IS SURFACE 2. It is rendered here, empty and inert, because its
   RESTING state is the header's business: absolutely centred, invisible on the
   landing, `display:block` throughout so the nav can breathe in instead of
   popping. Surface 2 fills it with the seven tabs.

   THE LIVE DOT IS HONEST. The dummy's dot is always green because the dummy has
   nothing behind it. Here it reports the actual connector state: green and
   "Live · nCino + AFS" when the MCP surface is present, quiet and "Snapshot"
   when the artifact is running on baked data. A green light over a static
   snapshot is a claim this app does not get to make.
   ============================================================================= */

/** rule 70.5 / INTENT-OVERRIDES #2 — the header knows when content slides
 *  beneath it. `body.scrolled` past 8px, and the bar's shadow eases in and back
 *  out over .4s (the dummy writes that transition and then loses it to a later
 *  lens rule; the port implements the written intent). */
function useScrolledFlag() {
  useEffect(() => {
    const onScroll = () => document.body.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.body.classList.remove("scrolled");
    };
  }, []);
}

export function TopBar() {
  const { data } = useApp();
  const user = data.meta?.user ?? "Credit Officer";
  const initials = user.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const live = mcpAvailable();
  useScrolledFlag();

  return (
    <header className="topbar">
      <div className="topbar-in">
        <BrandGlyph className="brandmark" label="accenture" />
        <span className="apptitle">Credit 360</span>
        <div className="topnav">
          <nav className="icotabs" id="tabs" aria-label="Workspace" />
        </div>
        <span className="spacer" />
        <span
          className="dot-live"
          style={live ? undefined : { background: "var(--ink-faint)" }}
          title={live ? "Live · nCino + AFS" : "Snapshot · no live connection"}
        />
        <button
          type="button"
          className="kbd"
          id="cmdkOpen"
          aria-label="Search clients, actions, records"
          onClick={() => window.dispatchEvent(new CustomEvent(CMDK_OPEN_EVENT))}
        >
          ⌘K
        </button>
        <span className="avatar" title={user}>
          {initials}
        </span>
      </div>
    </header>
  );
}
