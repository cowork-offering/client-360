import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApp, ACCOUNT_TABS } from "../state/appState";
import { FloatingPanel } from "./FloatingPanel";
import { ChatPanelBody } from "./ChatPanel";
import { ActionsPanelBody } from "./ActionsPanel";
import { ActionPanel } from "./ActionPanel";
import { ACTIONS_TRIGGER_ID } from "./actionsTrigger";
import { closeActionTicket, openActionTicket, useActionTicket } from "./actionTicket";
import { ActionGlyph } from "./ActionIcon";
import { BrandGlyph } from "./brand";
import { Portal } from "./Portal";
import { isTopmost, pushModal } from "./modalStack";
import { resolveBundle, type ActionIcon as IconName } from "../actions/registry";
import { openFacilityRoom } from "./workroom/roomSession";
import { smartOpeningFor } from "./workroom/route";
import { sowSeed } from "./workroom/seed";
import "../styles/fab.css";
import "../styles/chat.css";

/* =============================================================================
   SURFACE 4 — THE FAB, THE ARC, THE NARRATOR CHIP, THE CHAT LIFECYCLE.

   The mark in the corner is the app's ONE floating control. On the landing it
   opens the assist directly, because credit actions make no sense without a
   client (rule 50). On a client it fans a quarter-circle of FOUR satellites —
   the assist at the top, then the three credit actions swinging down the arc
   (rule 49) — narrated by ONE anchored chip beneath the mark (rule 54). Opening
   the assist makes the mark YIELD entirely; the panel takes its exact spot,
   minimize folds it into a glass pill holding that same spot, and close brings
   the mark back (rule 56).

   FOUR, NOT FIVE (founder, 2026-08-31). Modification and Renewal collapsed into
   ONE "Facility Actions" satellite: they are the same room now, and which of
   the three routes a session takes is the room's own first question rather than
   a decision the arc makes on the banker's behalf.

   ONE HANDLER, ONE GATE (HANDOVER §4, trap 5). Every satellite routes through
   `runArcAction`, which resolves the client ONCE and refuses to act without
   one. The bug this trap is named for was a satellite carrying its own direct
   listener straight into the room, past the gate the shared handler applies.
   No satellite here has an onClick of its own.
   ============================================================================= */

type ArcAct = "chat" | "facility" | "annual" | "covenant";

/** The arc, measured off the dummy: satellites on a 118px radius with 46px
 *  between neighbouring centres, staggered 28ms apart by index. The offsets are
 *  the dummy's literal --tx/--ty; nothing here is recomputed from trigonometry,
 *  because the founder-approved arc is these numbers and not a formula.
 *
 *  RECOMPUTED FOR FOUR FROM THE SPACING RHYTHM, not from the sweep. The dummy's
 *  five sit at 22.5° steps off vertical, which is what makes the neighbouring
 *  centres 2·118·sin(11.25°) = 46px apart. Dropping a satellite therefore drops
 *  the LAST POSITION and keeps the rhythm — the alternative, spreading four
 *  across the same 90°, opens the gaps to 61px and the arc stops reading as one
 *  swing. The four kept offsets are byte-identical to the dummy's first four. */
const ARC: {
  act: ArcAct;
  /** The narrator chip's word for it. One or two words so the centred chip can
   *  never spill the viewport at 1360w (rule 54). */
  label: string;
  aria: string;
  tx: number;
  ty: number;
  /** The registry action this satellite routes to, and its icon in the app's
   *  ONE icon language (rule 35) — the same glyph the Client Actions row for
   *  this action wears, so the two entry points read as the same thing. */
  actionId?: string;
  icon?: IconName;
  domId?: string;
}[] = [
  { act: "chat", label: "Assist", aria: "Assist chat", tx: 0, ty: -118 },
  { act: "facility", label: "Facility Actions", aria: "Facility Actions", tx: -45, ty: -109, actionId: "loan-modification", icon: "modify", domId: "actFacility" },
  { act: "annual", label: "Annual review", aria: "Annual review", tx: -83, ty: -83, actionId: "annual-review", icon: "review" },
  { act: "covenant", label: "Covenant review", aria: "Covenant review", tx: -109, ty: -45, actionId: "covenant-review", icon: "covenant" },
];

const ARC_LABEL_AT_REST = "Client actions";

/** Count of SERVER (agent-authored) messages only — the unread watermark basis.
 *  Locally echoed messages are deliberately excluded: they vanish on a full
 *  artifact replace, so counting them would inflate the watermark past the
 *  server total and swallow the next genuine reply (C7). */
function useServerMessageCount(): number {
  const { data } = useApp();
  return useMemo(() => {
    let n = 0;
    for (const t of data.aiPanel?.threads ?? []) n += (t.messages ?? []).length;
    return n;
  }, [data.aiPanel]);
}

/** One satellite. It renders and it narrates; it does not decide anything.
 *
 *  NARRATION IS A NATIVE LISTENER ON PURPOSE. React synthesises onMouseEnter
 *  from delegated mouseover/mouseout at the root and never listens for
 *  `mouseenter` itself, so a raw dispatched `mouseenter` — which is how the
 *  acceptance probe drives the chip, and how any automation would — would go
 *  unheard. The chip is the only thing that tells a banker what a bare icon
 *  does, so it answers the real event. */
function ArcSatellite({
  spec,
  index,
  open,
  onNarrate,
  onPick,
}: {
  spec: (typeof ARC)[number];
  index: number;
  open: boolean;
  onNarrate: (label: string | null) => void;
  onPick: (act: ArcAct) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const label = spec.label;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const enter = () => onNarrate(label);
    const leave = () => onNarrate(null);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    };
  }, [label, onNarrate]);

  return (
    <button
      ref={ref}
      type="button"
      id={spec.domId}
      className="arcbtn eg-glass eg-glass-satellite"
      data-act={spec.act}
      aria-label={spec.aria}
      /* Closed, the arc is not a place: it is folded into the mark, does not
         answer the pointer, and must not answer the Tab key either. */
      tabIndex={open ? 0 : -1}
      aria-hidden={open ? undefined : true}
      style={{ "--tx": `${spec.tx}px`, "--ty": `${spec.ty}px`, "--i": index } as CSSProperties}
      onClick={() => onPick(spec.act)}
    >
      {spec.icon ? (
        <ActionGlyph name={spec.icon} />
      ) : (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 7.6c0 3-2.7 5.4-6 5.4-.7 0-1.4-.1-2-.3L2.6 13.7l.8-2.5C2.5 10.2 2 9 2 7.6c0-3 2.7-5.4 6-5.4s6 2.4 6 5.4Z" />
        </svg>
      )}
    </button>
  );
}

/** The assist itself: the panel at the mark's spot, its two ghost controls, and
 *  the pill that holds the spot while the panel is folded away.
 *
 *  IT IS NEVER UNMOUNTED, and that is the point. "The conversation is kept"
 *  (rule 56) is not a promise about the thread alone — it is about the whole
 *  in-flight state of the exchange, the half-typed question, the answer still
 *  arriving, the ticket a chip just opened. React would reset every bit of that
 *  on a remount, so the assist lives exactly as the dummy's does: one element,
 *  always in the page, whose `show` class is the entire state machine. Closed
 *  it also drops its dialog role, so nothing offers a dialog that is not there.
 *
 *  All three of its effects are gated on `open` rather than on mounting, so the
 *  modal layer, the focus handoff and the Escape key still begin and end with
 *  the conversation. */
function Assist({
  open,
  subtitle,
  minimized,
  onMinimize,
  onRestore,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  subtitle: string;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  returnFocusTo: () => HTMLElement | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const layerId = useId();

  useEffect(() => (open ? pushModal(layerId) : undefined), [open, layerId]);

  // Focus enters on open and returns to the mark on close. Minimising is not a
  // close, so this does not run for it.
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    if (node && !node.contains(document.activeElement)) {
      (node.querySelector<HTMLElement>("[data-autofocus]") ?? node).focus({ preventScroll: true });
    }
    return () => returnFocusTo()?.focus?.({ preventScroll: true });
  }, [open, returnFocusTo]);

  // A folded panel is `display:none`, which drops whatever was focused inside
  // it on the floor. Focus follows the conversation into the pill and back.
  useEffect(() => {
    if (!open) return;
    const target = minimized
      ? pillRef.current
      : (panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? null);
    target?.focus({ preventScroll: true });
  }, [open, minimized]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A31.1 — Escape belongs to the innermost layer. A ticket opened from a
      // chat chip is deeper than this, and closing here would take both down.
      if (!isTopmost(layerId)) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, layerId]);

  const showPanel = open && !minimized;
  return (
    <Portal>
      <div
        ref={panelRef}
        id="chatpanel"
        {...(open ? { role: "dialog", "aria-modal": "false" as const } : { "aria-hidden": true as const })}
        aria-label="Ask the desk"
        tabIndex={-1}
        className={`chatpanel eg-glass eg-glass-panel${showPanel ? " show" : ""}`}
      >
        <div className="chatctl">
          <button type="button" className="chatx" id="chatMin" aria-label="Minimize chat" onClick={onMinimize}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="chatx" id="chatX" aria-label="Close chat" onClick={onClose}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="chathead">
          <div className="chattitle">Ask the desk</div>
          <div className="chatsub">{subtitle}</div>
        </div>
        <ChatPanelBody />
      </div>

      <button
        ref={pillRef}
        type="button"
        id="chatMini"
        className={`chatmini eg-glass${open && minimized ? " show" : ""}`}
        aria-label="Restore the assist"
        aria-hidden={open && minimized ? undefined : true}
        tabIndex={open && minimized ? 0 : -1}
        onClick={onRestore}
      >
        Assist
      </button>
    </Portal>
  );
}

/** Page-agnostic floating action surface: the mark, bottom right, present on
 *  the landing and every client tab. */
export function ChatFab() {
  const { data, state, dispatch } = useApp();
  const fabRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const serverCount = useServerMessageCount();

  const [arcOpen, setArcOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  /** The staged-action ticket a satellite opened, if any. Held in a module
   *  store so the arc's shared handler and every other caller reach it the same
   *  way (components/actionTicket.ts). */
  const panelActionId = useActionTicket();
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  const open = state.panel === "chat";
  const unread = Math.max(0, serverCount - state.seenServerCount);

  const account =
    state.view === "account" && state.accountId
      ? data.portfolio.accounts.find((a) => a.accountId === state.accountId)
      : null;
  const onClient = state.view === "account" && !!state.accountId;

  // Clamp DOWN when the server prunes its history, so a shrunken thread cannot
  // leave a stale watermark that hides the next reply (C7).
  useEffect(() => {
    if (state.seenServerCount > serverCount) dispatch({ type: "SET_SEEN", count: serverCount });
  }, [serverCount, state.seenServerCount, dispatch]);

  // Opening the panel marks everything currently on the server as seen.
  useEffect(() => {
    if (open && state.seenServerCount !== serverCount) dispatch({ type: "SET_SEEN", count: serverCount });
  }, [open, serverCount, state.seenServerCount, dispatch]);

  // The arc belongs to the client it was fanned on. Leaving takes it with you.
  useEffect(() => {
    if (!onClient) setArcOpen(false);
  }, [onClient]);

  // Folding the arc also puts the narrator back to rest. Clicking a satellite
  // closes the arc without a mouseleave ever firing, so without this the chip
  // would still be reading the last thing you touched when it next opens.
  const closeArc = useCallback(() => {
    setArcOpen(false);
    setHoverLabel(null);
  }, []);

  // Outside click and Escape collapse the arc, exactly as the dummy does. The
  // listener is always live and asks whether the click landed inside the mark's
  // corner, rather than being armed and disarmed around the open state.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) closeArc();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeArc();
    };
    document.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeArc]);

  const openAssist = useCallback(() => {
    setMinimized(false);
    dispatch({ type: "SET_PANEL", panel: "chat" });
  }, [dispatch]);

  const closeAssist = useCallback(() => {
    setMinimized(false);
    dispatch({ type: "SET_PANEL", panel: "none" });
  }, [dispatch]);

  /**
   * THE SHARED HANDLER, AND ITS CLIENT GATE (HANDOVER §4, trap 5).
   *
   * Every satellite ends here. The client is resolved once, from view state,
   * and nothing downstream of the gate runs without one — so there is exactly
   * one place where "which client is this for?" is answered, and no second path
   * that can be wired past it later.
   *
   * The three credit actions route to the surfaces the app already has:
   * Facility Actions opens the UNIFIED room, unbound, and the room's first
   * question decides whether this session is a modification, a renewal or a new
   * facility; the other two open the same staged-action ticket they always have.
   * Per-action availability is deliberately NOT re-litigated here — the
   * destination surface owns the honest reason a thing cannot be done, and a
   * second copy of that judgement in the corner would be the next thing to
   * drift out of step with it.
   */
  const runArcAction = useCallback(
    (act: ArcAct) => {
      closeArc();
      if (act === "chat") {
        openAssist();
        return;
      }
      const accountId = state.view === "account" ? state.accountId : null;
      if (!accountId) return; /* the gate */
      const accountName =
        data.portfolio.accounts.find((a) => a.accountId === accountId)?.name ??
        data.borrower?.snapshot?.name ??
        "this relationship";

      if (act === "facility") {
        // NOTHING TELEPORTS (rule 58). A glass seed circle ripples out of the
        // exact satellite that was pressed, timed with the room's opacity
        // entrance. It is sown HERE, inside the shared handler and AFTER the
        // client gate — trap 5: a second direct listener on the button would
        // fire the seed on a press the gate then refused, which is how the arc
        // opened a room on a client it had no business opening.
        sowSeed(document.querySelector('.arcbtn[data-act="facility"]'));
        // THE OPENING IS DERIVED, NEVER INVENTED. `smartOpeningFor` consults the
        // deal and hands back a signal or null; null opens on the neutral
        // three-way, and the room never suggests a route the data did not make.
        const bundle = resolveBundle(data, accountId);
        openFacilityRoom({
          accountId,
          accountName,
          opening: smartOpeningFor({ data, bundle, accountName, productPackageId: null }),
        });
        return;
      }
      const spec = ARC.find((a) => a.act === act);
      if (spec?.actionId) openActionTicket(spec.actionId);
    },
    [closeArc, openAssist, state.view, state.accountId, data],
  );

  const tabLabel =
    state.view === "account" ? (ACCOUNT_TABS.find((t) => t.id === state.tab)?.label ?? null) : "Worklist";
  const subtitle = `${account ? account.name : "Whole book"}${tabLabel ? ` · ${tabLabel}` : ""}`;

  /* The mark's own label. On a client it fans the arc, so it says so and
     announces its expanded state; on the landing it is the assist and nothing
     else. It never says "close": the mark YIELDS while the assist is open, and
     a control that has stood down is not the one that dismisses it. */
  const fabLabel = onClient
    ? ARC_LABEL_AT_REST
    : unread > 0
      ? `Open chat, ${unread} new`
      : "Open chat";

  let fabWrapClass = "fabwrap";
  if (arcOpen) fabWrapClass += " open";
  if (open) fabWrapClass += " tucked";

  return (
    <>
      <Assist
        open={open}
        subtitle={subtitle}
        minimized={minimized}
        onMinimize={() => setMinimized(true)}
        onRestore={() => setMinimized(false)}
        onClose={closeAssist}
        returnFocusTo={() => fabRef.current}
      />

      {panelActionId && (
        <ActionPanel actionId={panelActionId} onClose={closeActionTicket} returnFocusTo={() => fabRef.current} />
      )}

      {state.panel === "actions" && (
        <FloatingPanel
          title="Client Actions"
          subtitle={subtitle}
          variant="sheet"
          returnFocusTo={() => document.getElementById(ACTIONS_TRIGGER_ID)}
          onClose={() => dispatch({ type: "SET_PANEL", panel: "none" })}
        >
          <ActionsPanelBody />
        </FloatingPanel>
      )}

      {/* One floating surface at a time: the mark stands down while the Client
          Actions panel is open, and returns when it closes (founder feedback
          2026-07-25). */}
      {state.panel !== "actions" && (
        <div ref={wrapRef} className={fabWrapClass} id="fabwrap">
          {onClient &&
            ARC.map((spec, i) => (
              <ArcSatellite
                key={spec.act}
                spec={spec}
                index={i}
                open={arcOpen}
                onNarrate={setHoverLabel}
                onPick={runArcAction}
              />
            ))}

          <button
            ref={fabRef}
            id="fab"
            type="button"
            className="fab"
            aria-label={fabLabel}
            aria-expanded={onClient ? arcOpen : open}
            onClick={() => (onClient ? setArcOpen((v) => !v) : openAssist())}
          >
            <BrandGlyph className="gt" />
            {unread > 0 && !open && (
              <span
                className="c360-fab-badge absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10.5px] font-bold"
                style={{ background: "var(--critical)", color: "var(--ink-inverse)", border: "2px solid var(--surface)" }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* Rule 54 — ONE anchored narrator chip, centred under the mark. The
              satellites stay unlabeled icons; per-satellite floating labels are
              banned. It is decorative to a screen reader, which reads each
              satellite's own aria-label instead. */}
          {onClient && (
            <span className="arclbl eg-glass eg-glass-micro" id="arcLbl" aria-hidden="true">
              {hoverLabel ?? ARC_LABEL_AT_REST}
            </span>
          )}
        </div>
      )}
    </>
  );
}
