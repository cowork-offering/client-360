import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =============================================================================
   THE ENTRY CHOREOGRAPHY - progressive reveal, one grammar, both rooms.

   Founder, 2026-09-01 (design/ENTRY-CHOREOGRAPHY-INTENT-20260901.md). Entering
   an action dumped the routing question, the package header and the whole
   facility list on the banker in one frame. This is the "content is earned" law
   of the morning's empty lane, moved from the room's at-rest state to its
   ENTRY.

   THREE TIERS, IN ORDER:

     question   the opening bubble. What do you want to do, on a calm stage,
                with nothing competing.
     identity   what the action runs against. The product package in the
                facility room; the review's own scope brief in the relationship
                room.
     detail     what the banker is deciding on. The facilities in the facility
                room; the first collected question in the relationship room.

   AS EACH TIER ARRIVES, THE TIER ABOVE LEAVES THE STAGE. It is never lost: it
   stays MOUNTED, carries `data-tier-state="faded"`, and a quiet summon brings
   it back. That is the whole reason this is a state machine and not an unmount:
   an absence contract must be able to tell "faded out" from "gone", and only a
   node that is still there can say which one it is.

   THE EXITS SPEAK THE ROOM'S OWN MOTION LANGUAGE. The leave is the arrival run
   backwards with the word-speech's blur on it (`wk-tier-out` in workroom.css):
   the same family as the draw-in, the seed entrance and the odometer, never a
   new vocabulary and never a hard cut.

   REDUCED MOTION IS AN INSTANT SWAP. No leaving beat at all: the tier above
   goes straight to faded, which is also what every jsdom test sees, because
   jsdom has no matchMedia and `prefersReducedMotion` is true there.
   ============================================================================= */

export type EntryTier = "question" | "identity" | "detail";

/**
 * WHERE A TIER STANDS.
 *
 * `waiting` a tier whose content has not been pushed into the thread yet. It is
 *           genuinely absent: no node, nothing to summon.
 * `on`      on stage. The tier the banker is reading.
 * `leaving`  mid-exit. Still mounted, still laid out, shimmering out.
 * `faded`   off stage and summonable. Mounted, not rendered, aria-hidden.
 */
export type TierState = "waiting" | "on" | "leaving" | "faded";

/** The tiers, in arrival order. A tier retires every tier BEFORE it here. */
export const TIER_ORDER: readonly EntryTier[] = ["question", "identity", "detail"] as const;

/** The beat between one tier landing and the next. Long enough that the two
 *  arrivals read as a sequence rather than as one delayed dump. */
export const TIER_STAGGER_MS = 620;

/** How long the exit takes. Must match `wk-tier-out`'s duration in
 *  workroom.css, or a tier would collapse while it is still visible. */
export const TIER_EXIT_MS = 520;

export interface EntryChoreography {
  /** Where a tier stands right now. */
  stateOf: (tier: EntryTier) => TierState;
  /** A tier's content just landed. Everything above it leaves the stage. */
  arrive: (tier: EntryTier) => void;
  /**
   * EVERY TIER LEAVES (founder, 2026-09-03).
   *
   * The tiers retire each other in order, so the LAST one - the facilities in
   * the facility room, the first collected question in the relationship room -
   * had nothing above it to push it off and stayed on the stage under every
   * card the banker went on to stage. The first card is what earns its exit:
   * from that moment the banker is deciding on the card, not on the strip, and
   * the greeting, the package and the facilities are all one summon away.
   */
  retire: () => void;
  /** Back to the calm stage: nothing has arrived, nothing has left. */
  reset: () => void;
  /** The tiers that have left the stage and can be brought back. */
  left: EntryTier[];
  /** The banker asked for them back. */
  summoned: boolean;
  setSummoned: (on: boolean) => void;
}

export function useEntryChoreography(reduced: boolean): EntryChoreography {
  const [states, setStates] = useState<Record<EntryTier, TierState>>(() => ({
    question: "waiting",
    identity: "waiting",
    detail: "waiting",
  }));
  const [summoned, setSummoned] = useState(false);
  const timers = useRef<number[]>([]);
  /* THE ENTRY IS OVER (founder drive, 2026-09-03). Once the room has retired
     its tiers, a tier still on its arrival beat must not walk back onto the
     stage behind the card the banker is now deciding on. An intent that feeds
     its first line while the facility strip is still on its 620ms beat did
     exactly that, and the strip stood under every card of the drive. A tier
     that arrives after the retirement arrives ALREADY FADED: mounted,
     summonable, and off the stage where it belongs. */
  const retired = useRef(false);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const arrive = useCallback(
    (tier: EntryTier) => {
      setStates((prev) => {
        if (prev[tier] === "on") return prev;
        if (retired.current) return prev[tier] === "faded" ? prev : { ...prev, [tier]: "faded" as TierState };
        const next = { ...prev, [tier]: "on" as TierState };
        for (const above of TIER_ORDER.slice(0, TIER_ORDER.indexOf(tier))) {
          // A tier that never landed has nothing to retire, and one already
          // faded stays faded: the exit runs once per tier, never on a loop.
          if (next[above] === "on" || next[above] === "leaving") {
            next[above] = reduced ? "faded" : "leaving";
          }
        }
        return next;
      });
      if (reduced) return;
      const t = window.setTimeout(() => {
        setStates((prev) => {
          if (!TIER_ORDER.some((k) => prev[k] === "leaving")) return prev;
          const next = { ...prev };
          for (const k of TIER_ORDER) if (next[k] === "leaving") next[k] = "faded";
          return next;
        });
      }, TIER_EXIT_MS);
      timers.current.push(t);
    },
    [reduced],
  );

  const retire = useCallback(() => {
    retired.current = true;
    setStates((prev) => {
      if (!TIER_ORDER.some((k) => prev[k] === "on")) return prev;
      const next = { ...prev };
      for (const k of TIER_ORDER) if (next[k] === "on") next[k] = reduced ? "faded" : "leaving";
      return next;
    });
    if (reduced) return;
    const t = window.setTimeout(() => {
      setStates((prev) => {
        if (!TIER_ORDER.some((k) => prev[k] === "leaving")) return prev;
        const next = { ...prev };
        for (const k of TIER_ORDER) if (next[k] === "leaving") next[k] = "faded";
        return next;
      });
    }, TIER_EXIT_MS);
    timers.current.push(t);
  }, [reduced]);

  const reset = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    retired.current = false;
    setStates({ question: "waiting", identity: "waiting", detail: "waiting" });
    setSummoned(false);
  }, []);

  const left = useMemo(() => TIER_ORDER.filter((t) => states[t] === "leaving" || states[t] === "faded"), [states]);
  const stateOf = useCallback((tier: EntryTier) => states[tier], [states]);

  return { stateOf, arrive, retire, reset, left, summoned, setSummoned };
}

/**
 * HOW A TIER'S WRAPPER RENDERS.
 *
 * `data-tier-state` is the contract the absence tests read: `faded` means off
 * stage AND still summonable, and it only ever appears on a node that is in the
 * document. Content that was never earned has no wrapper at all.
 */
export function tierAttrs(
  tier: EntryTier,
  state: TierState,
  summoned: boolean,
): { className: string; "data-tier": EntryTier; "data-tier-state": string; "aria-hidden"?: "true" } {
  const off = state === "leaving" || state === "faded";
  if (off && summoned) {
    return { className: "wk-tier wk-tier-back", "data-tier": tier, "data-tier-state": "summoned" };
  }
  if (state === "leaving") {
    return { className: "wk-tier wk-tier-out", "data-tier": tier, "data-tier-state": "leaving", "aria-hidden": "true" };
  }
  if (state === "faded") {
    return { className: "wk-tier wk-tier-gone", "data-tier": tier, "data-tier-state": "faded", "aria-hidden": "true" };
  }
  return { className: "wk-tier wk-tier-in", "data-tier": tier, "data-tier-state": "on" };
}

/** What the summon chip says. Never "tiers": the banker's word for what left
 *  the stage is what the room read. */
export function summonLabel(count: number, open: boolean): string {
  return open ? "↓ hide what the room read" : `↑ show what the room read (${count})`;
}
