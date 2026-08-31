import type { ReactNode } from "react";
import type { AccountTab } from "../state/appState";

/* =============================================================================
   THE WORKSPACE TAB GLYPHS — DIRECTION-LOCKED rule 29 (type-icon language).

   One 16-unit, 1.4-stroke glyph per pane, lifted from the mint. Each says what
   its pane IS rather than decorating it: a grid of facilities, a rising line, a
   shield with a tick, a pulse, a clock, three linked nodes, a star. The stroke,
   the fill and the cap are set once in client.css by `.itab svg`, so a glyph
   here carries geometry and nothing else.

   Rule 40 (mark census) forbids the ">" here: the tabs are typed icons, and the
   mark stays at the six sites the census names.
   ============================================================================= */

const PATHS: Record<AccountTab, ReactNode> = {
  activity: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5 V8 L10.6 9.6" />
    </>
  ),
  exposure: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  covenants: (
    <>
      <path d="M8 1.5 L13.5 3.8 V8 C13.5 11.4 11.2 13.6 8 14.7 C4.8 13.6 2.5 11.4 2.5 8 V3.8 Z" />
      <path d="M5.6 8 L7.4 9.8 L10.6 6.4" />
    </>
  ),
  graph: (
    <>
      <circle cx="8" cy="4" r="2.2" />
      <circle cx="3.5" cy="12" r="2.2" />
      <circle cx="12.5" cy="12" r="2.2" />
      <path d="M6.9 5.9 L4.5 10 M9.1 5.9 L11.5 10" />
    </>
  ),
  opportunities: <path d="M8 2 L9.7 6 L14 6.4 L10.8 9.3 L11.8 13.6 L8 11.3 L4.2 13.6 L5.2 9.3 L2 6.4 L6.3 6 Z" />,
  signals: <path d="M2 8 H4.5 L6.5 3.5 L9.5 12.5 L11.5 8 H14" />,
  financials: (
    <>
      <path d="M2 13 L6 8 L9 10.5 L14 3.5" />
      <path d="M10.5 3.5 H14 V7" />
    </>
  ),
};

export function TabIcon({ tab }: { tab: AccountTab }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {PATHS[tab]}
    </svg>
  );
}
