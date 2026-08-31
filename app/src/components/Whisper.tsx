import { useEffect, useState } from "react";
import { useApp } from "../state/appState";
import type { WorklistRow } from "../data/worklistRows";
import { BrandGlyph } from "./brand";

/* =============================================================================
   THE WHISPER — DIRECTION-LOCKED rule 59, AGENT PRESENCE.

   ONE whisper, ONCE per session. After ~3.2s idle on the landing the mark
   breathes twice and a glass chip floats up off it: ink text, a purple mark, a
   ghost dismiss. Clicking it opens the client. Never a badge, never a count,
   never more than one. It yields to the chat.

   ONCE PER SESSION, LITERALLY. The flag is module-level, not component state:
   the landing unmounts every time the banker opens a relationship, and a
   per-component flag would re-arm the whisper on every trip home. That is the
   difference between an agent leaning in and an agent nagging.
   ============================================================================= */

const IDLE_MS = 3200;
/* The dummy's number: the class comes off a beat before the second cycle would
   have ended, by which point the curve is already back within a hair of rest. */
const BREATHE_MS = 5400;

let whisperSpent = false;

/** What the agent noticed. The loudest row on the queue, said in its own real
 *  numbers: a whisper that invents its reason is worse than no whisper. */
function noticeFor(r: WorklistRow): { lead: string; strong: string; tail: string } {
  if (r.maturityDays != null && r.maturityDays >= 0) {
    return { lead: `${r.name} renewal window · `, strong: `${r.maturityDays} days`, tail: ". Open the client?" };
  }
  if (r.nextTestDays != null && r.nextTestDays < 0) {
    return { lead: `${r.name} covenant test · `, strong: `${Math.abs(r.nextTestDays)} days overdue`, tail: ". Open the client?" };
  }
  if (r.nextTestDays != null) {
    return { lead: `${r.name} covenant test · `, strong: `${r.nextTestDays} days`, tail: ". Open the client?" };
  }
  return { lead: "", strong: r.name, tail: " is top of the queue. Open the client?" };
}

export function Whisper({ row }: { row: WorklistRow | undefined }) {
  const { state, dispatch } = useApp();
  const [shown, setShown] = useState(false);
  const [breathing, setBreathing] = useState(false);

  const onLanding = state.view === "home";
  const chatOpen = state.panel !== "none";

  useEffect(() => {
    if (!row || whisperSpent || !onLanding || chatOpen) return;
    const t = window.setTimeout(() => {
      whisperSpent = true;
      setShown(true);
      setBreathing(true);
      window.setTimeout(() => setBreathing(false), BREATHE_MS);
    }, IDLE_MS);
    return () => window.clearTimeout(t);
  }, [row, onLanding, chatOpen]);

  /* The mark's beat rides the FAB itself rather than a second element in the
     corner: one object, breathing, with the chip hanging off it. */
  useEffect(() => {
    const fab = document.getElementById("fab");
    if (!fab) return;
    fab.classList.toggle("breathe", breathing);
    return () => fab.classList.remove("breathe");
  }, [breathing]);

  useEffect(() => {
    if (chatOpen) setShown(false); /* the whisper yields to the assist */
  }, [chatOpen]);

  if (!row) return null;
  const notice = noticeFor(row);

  return (
    <div className={`whisper${shown ? " show" : ""}`} id="whisper" role="status">
      {/* The chip is a live region that ANNOUNCES and a control that OPENS, and
          those are two different elements: a role="status" div is not focusable,
          so hanging the click on it would put the whisper out of reach of a
          keyboard entirely. The glass stays the outer surface. */}
      <button
        type="button"
        className="wbody"
        onClick={() => {
          setShown(false);
          /* THE WHISPER RIDES THE FLIGHT (rule 58). It clicks the row it is
             talking about rather than navigating on its own, so the client name
             flies out of that row exactly as it does when the banker clicks it,
             and the whisper stays one way IN rather than a second way in. If the
             row is not on screen the navigation still has to happen. */
          const rowEl = document.querySelector<HTMLElement>(`[data-open="${CSS.escape(row.accountId)}"]`);
          if (rowEl) rowEl.click();
          else dispatch({ type: "OPEN_ACCOUNT", accountId: row.accountId });
        }}
      >
        <BrandGlyph />
        <span>
          {notice.lead}
          <b>{notice.strong}</b>
          {notice.tail}
        </span>
      </button>
      <button type="button" className="wx" id="whisperX" aria-label="Dismiss" onClick={() => setShown(false)}>
        ✕
      </button>
    </div>
  );
}
