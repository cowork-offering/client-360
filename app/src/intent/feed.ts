import { useEffect, useRef, useSyncExternalStore } from "react";

/* =============================================================================
   THE LINE FEED — an intent's instructions, said one at a time.

   THE ROOM IS NOT AUTOMATED. Every line an intent carries goes through the
   room's OWN `say`: the same parser, the same brain lane, the same refusals,
   the same one-decision-at-a-time gate a typed line meets. What this module
   adds is a queue and a rule about when the next one may be said.

   THE RULE IS: ONLY WHEN THE ROOM IS NOT HOLDING ANYTHING. A line that staged a
   card leaves that card open and the feed STOPS until the banker confirms it. A
   line that raised chips stops the feed until they pick. A line the room
   refused settles nothing, so the feed carries straight on. The banker is never
   racing the queue, and the queue never answers a question on their behalf.

   THE ROOM OWNS THE READINESS. It is the only thing that knows whether it is
   holding a gate, thinking, or mid-flow, so it passes that in; nothing here
   inspects room state. That keeps this module true for both rooms and keeps the
   two rooms' own gate rules where they already live.
   ============================================================================= */

export type FeedRoom = "facility" | "relationship";

export interface FeedState {
  room: FeedRoom;
  accountId: string;
  lines: string[];
  /** How many have been said. `index === lines.length` is a spent feed. */
  index: number;
  /** The intent that staged it, for the surfaces that name it. */
  intentId: string;
}

let feed: FeedState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): FeedState | null => feed;

/** Stage an intent's lines against a room. Replaces any earlier feed: one
 *  intent is being acted on at a time, exactly as one room is open at a time. */
export function stageFeed(args: { room: FeedRoom; accountId: string; lines: string[]; intentId: string }): void {
  feed = { room: args.room, accountId: args.accountId, lines: args.lines.slice(), index: 0, intentId: args.intentId };
  emit();
}

export function clearFeed(): void {
  if (!feed) return;
  feed = null;
  emit();
}

export const feedSnapshot = (): FeedState | null => feed;

function advance(): void {
  if (!feed) return;
  feed = { ...feed, index: feed.index + 1 };
  emit();
}

/** How long the room is given to land what a line produced before the feed
 *  looks at the readiness again. The room's own composed beat is 460ms; this
 *  only has to outlast the commit that renders the card. */
const SETTLE_MS = 320;

/**
 * DRAIN THE FEED INTO A ROOM.
 *
 * Called by the room with its own account, its own `say` and its own honest
 * answer to "am I free". Returns what is left, for a room that wants to say so.
 *
 * @param ready TRUE only when the room is awake and holding nothing at all.
 */
export function useRoomFeed(args: {
  room: FeedRoom;
  accountId: string;
  ready: boolean;
  say: (line: string) => Promise<void> | void;
}): { total: number; index: number; active: boolean } {
  const { room, accountId, ready, say } = args;
  const live = useSyncExternalStore(subscribe, snapshot, snapshot);
  const busy = useRef(false);

  /* THE ROOM'S `say` IS NOT A DEPENDENCY, ON PURPOSE. It is rebuilt whenever
     the room's own state moves, and the room's state moves BECAUSE of the line
     being said — so depending on its identity would tear down the effect
     mid-line and leave the queue latched. It is read through a ref, which is
     always the current one at the moment it is called. */
  const sayRef = useRef(say);
  sayRef.current = say;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mine = live && live.room === room && live.accountId === accountId ? live : null;

  useEffect(() => {
    if (!ready || busy.current || !mine) return;
    const line = mine.lines[mine.index];
    if (line === undefined) return;
    busy.current = true;
    void (async () => {
      try {
        await sayRef.current(line);
      } catch {
        // A line that threw is a line the room did not take. It still advances:
        // a feed that retried would say the same thing forever.
      }
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      busy.current = false;
      // A room that closed mid-line takes the queue with it rather than
      // marching on into a room nobody is looking at.
      if (mounted.current) advance();
    })();
  }, [ready, mine]);

  return {
    total: mine?.lines.length ?? 0,
    index: mine?.index ?? 0,
    active: !!mine && mine.index < mine.lines.length,
  };
}

/** Test seam. */
export function __resetFeedForTests(): void {
  feed = null;
  emit();
}
