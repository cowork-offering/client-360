import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { WorkroomChallenge, WorkroomDelta } from "../../workroom/types";

/* =============================================================================
   THE SETTLE CHOREOGRAPHY - what happens to an exchange after it is decided.

   FOUNDER, 2026-09-03, on the live cockpit: the room reads like two chats. It
   works, and it accumulates. After a Confirm the banker's line, the parser's
   preamble, the card, the room's sentence, the model's remark and the chips are
   ALL still on the glass, and the next question lands on top of them.

   THE RULE: WHEN AN EXCHANGE SETTLES, IT LEAVES. Everything that belonged to it
   goes out together in the room's own exit - the tier fade, shimmer out with the
   word-speech's blur, {@link SETTLE_EXIT_MS} - and one compact row takes its
   place: what settled and how. "$15M to $20M, confirmed". The next step arrives
   AFTER the exit, never on top of it.

   NOTHING IS LOST, AND THAT IS WHY THIS IS A STATE MACHINE RATHER THAN A SPLICE.
   A settled exchange stays MOUNTED, carries `data-settle-state="settled"`, and
   the row above it is a button that brings the whole thing back. An absence
   contract must be able to tell "settled away" from "never happened", and only a
   node that is still in the document can say which one it is. That is the same
   argument the entry choreography makes for its tiers, and it is the same
   grammar: this module is that one, applied to the exchange instead of the tier.

   REDUCED MOTION IS AN INSTANT SWAP. No leaving beat: the exchange goes straight
   to settled, and the next step lands in the same commit. That is also what
   every jsdom test sees, because jsdom has no matchMedia.

   THE MANIFEST RAIL IS UNTOUCHED BY ALL OF THIS. It already carries the ledger,
   and it is the durable record; the settled row is the CONVERSATION's own note
   that this exchange is over, which is a different thing and lives in the thread.
   ============================================================================= */

/**
 * HOW LONG THE EXIT TAKES, fade and collapse together.
 *
 * The founder's own range for the glide is 380 to 460ms; this is the middle of
 * it, and it is shorter than the tier fade's 520ms on purpose: a tier leaving is
 * the room changing subject, an exchange leaving is one decision closing, and
 * the second should feel quicker than the first.
 *
 * THE STYLESHEET READS IT FROM HERE. `settleAttrs` writes it onto the wrapper as
 * `--wk-settle-ms`, so the height transition and the timer that flips the state
 * cannot drift apart: an exchange that collapsed before it finished fading, or
 * kept its height after, is the snap this exists to remove.
 */
export const SETTLE_EXIT_MS = 420;

/**
 * WHERE AN EXCHANGE STANDS.
 *
 * `on`       on the stage. The exchange the banker is reading.
 * `leaving`  mid-exit. Still mounted, still laid out, shimmering out.
 * `settled`  off stage and summonable. Mounted, not rendered, aria-hidden.
 * `shown`    brought back by the banker, from its own settled row.
 */
export type SettleState = "on" | "leaving" | "settled" | "shown";

/**
 * THE COMPACT ROW AN EXCHANGE BECOMES.
 *
 * Two fields and no prose: WHAT settled and HOW. "$15.0MM to $20.0MM" and
 * "confirmed"; "Coverage thins" and "acknowledged". The row is not a summary of
 * the exchange, it is a receipt for it - the exchange itself is one click away
 * and is the only place the detail lives.
 */
export interface SettledRow {
  what: string;
  how: string;
  /** WHERE IN THE RITUAL THIS WAS, where the room numbers its steps. The
   *  relationship room's questions arrive as "Step 3 of 6"; a settled row that
   *  dropped the number would leave the banker counting rows to find out how
   *  far through the review they are. The facility room sets none. */
  kicker?: string;
}

/** The arrow the room prints between a before and an after. The same glyph the
 *  cards and the rail already use, so a settled row reads as the room's. */
const TO = "→";

/**
 * THE ROW A CONFIRMED OR DISCARDED CARD BECOMES.
 *
 * Both figures where the card carried both, because that is the change; the
 * title and the new figure where there was nothing before it (an add); the
 * title alone where the entry carries no figure at all (a removal, a pledge).
 */
/** The longest a "before" may be and still read as a FIGURE. Past this it is
 *  the engine explaining that it has no value to show ("this read does not
 *  carry today's value"), which is a sentence, and a receipt is not a place for
 *  a sentence. */
const BEFORE_MAX = 24;

export function rowForDelta(delta: WorkroomDelta, how: string): SettledRow {
  const before = (delta.before ?? "").trim();
  const after = (delta.after ?? "").trim();
  /* THE FIELD'S NAME, WITHOUT ITS PARENTHETICAL. "Amortisation term (months)"
     is the manifest's heading; on a row that already prints "240 months" the
     unit in brackets is the same word twice. */
  const field = delta.title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (before && before.length <= BEFORE_MAX && after && before !== after) {
    return { what: `${before} ${TO} ${after}`, how };
  }
  if (after) return { what: `${field} ${after}`.trim(), how };
  return { what: field || delta.title, how };
}

/** The row an acknowledged check becomes. The VERDICT is the check's own short
 *  form ("Coverage thins"); the arithmetic behind it is in the exchange, one
 *  click away, exactly where it was. */
export function rowForChallenge(challenge: WorkroomChallenge): SettledRow {
  return { what: challenge.verdict, how: "acknowledged" };
}

export interface SettleChoreography {
  /** Where a thread item stands. Anything this has never settled is `on`. */
  stateOf: (itemId: string) => SettleState;
  /**
   * An exchange settled: these items leave the stage together, under one row.
   *
   * `land` is what comes NEXT, and it runs in the SAME TASK as the exit
   * completing. Two timers at the same delay are two tasks with a render
   * between them, and in that render the room has no open gate and no exit in
   * flight - which is precisely the window the intent feed used to say its next
   * line straight over the confirm the banker had just made.
   */
  settle: (itemIds: readonly string[], rowId: string, land?: () => void) => void;
  /** The banker asked for a settled exchange back, or put it away again. */
  toggle: (rowId: string) => void;
  /** Is this row's exchange currently back on the stage? */
  isOpen: (rowId: string) => boolean;
  /** Anything on the stage that is on its way out. The room waits for this
   *  before it lands the next step. */
  leaving: boolean;
  reset: () => void;
}

interface Tracked {
  rowId: string;
  state: "leaving" | "settled";
}

export function useSettleChoreography(reduced: boolean): SettleChoreography {
  const [tracked, setTracked] = useState<Record<string, Tracked>>({});
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set<string>());
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const settle = useCallback(
    (itemIds: readonly string[], rowId: string, land?: () => void) => {
      if (!itemIds.length) {
        land?.();
        return;
      }
      const state: Tracked["state"] = reduced ? "settled" : "leaving";
      setTracked((prev) => {
        const next = { ...prev };
        for (const id of itemIds) {
          // AN EXCHANGE SETTLES ONCE. A second settle over the same item would
          // restart its exit and re-point its row at a receipt it never had.
          if (next[id]) continue;
          next[id] = { rowId, state };
        }
        return next;
      });
      if (reduced) {
        land?.();
        return;
      }
      const t = window.setTimeout(() => {
        setTracked((prev) => {
          if (!itemIds.some((id) => prev[id]?.state === "leaving")) return prev;
          const next = { ...prev };
          for (const id of itemIds) if (next[id]?.state === "leaving") next[id] = { ...next[id], state: "settled" };
          return next;
        });
        land?.();
      }, SETTLE_EXIT_MS);
      timers.current.push(t);
    },
    [reduced],
  );

  const toggle = useCallback((rowId: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setTracked({});
    setOpen(new Set<string>());
  }, []);

  const stateOf = useCallback(
    (itemId: string): SettleState => {
      const held = tracked[itemId];
      if (!held) return "on";
      return open.has(held.rowId) ? "shown" : held.state;
    },
    [open, tracked],
  );

  const leaving = useMemo(() => Object.values(tracked).some((t) => t.state === "leaving"), [tracked]);
  const isOpen = useCallback((rowId: string) => open.has(rowId), [open]);

  return { stateOf, settle, toggle, isOpen, leaving, reset };
}

/**
 * HOW A SETTLED EXCHANGE'S WRAPPER RENDERS.
 *
 * `data-settle-state` is the contract an absence test reads. `settled` means off
 * stage AND still summonable, and it only ever appears on a node that is in the
 * document. An exchange still on the stage carries `on` rather than nothing, so
 * the wrapper is one shape at every moment and React never remounts the bubble
 * (which would restart its word speech in the middle of a conversation).
 */
export interface SettleAttrs {
  className: string;
  "data-settle-state": SettleState;
  /** The glide's own clock, so the stylesheet and {@link SETTLE_EXIT_MS} are
   *  one number rather than two that have to be kept equal by hand. */
  style: CSSProperties;
  "aria-hidden"?: "true";
}

const CLOCK = { "--wk-settle-ms": `${SETTLE_EXIT_MS}ms` } as CSSProperties;

export function settleAttrs(state: SettleState): SettleAttrs {
  if (state === "shown") return { className: "wk-ex wk-ex-back", "data-settle-state": "shown", style: CLOCK };
  if (state === "leaving")
    return { className: "wk-ex wk-ex-out", "data-settle-state": "leaving", style: CLOCK, "aria-hidden": "true" };
  if (state === "settled")
    return { className: "wk-ex wk-ex-gone", "data-settle-state": "settled", style: CLOCK, "aria-hidden": "true" };
  return { className: "wk-ex", "data-settle-state": "on", style: CLOCK };
}

/**
 * THE ROW AN ANSWERED REVIEW STEP BECOMES.
 *
 * The relationship room's ritual is numbered, so the number travels: "Step 3 of
 * 6", then what the banker answered. The question itself is in the exchange
 * under it, which is where a question belongs once it has been answered.
 */
export function rowForStep(kicker: string | undefined, said: string): SettledRow {
  return { what: said, how: "recorded", kicker };
}

/** What the expand affordance on a settled row says. The banker's word for what
 *  it brings back is the exchange, never "the items". */
export function expandLabel(open: boolean): string {
  return open ? "hide" : "show";
}
