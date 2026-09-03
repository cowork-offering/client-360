import { useCallback, useEffect, useRef, useState } from "react";

/* =============================================================================
   THE STAGE CAP - at most two live exchanges, ever.

   FOUNDER, 2026-09-03: nothing new enters while two things are already waiting
   on the banker. A confirm used to land its answer, the check it tripped AND
   the pricing question it made necessary in one commit, so the room asked three
   things at once and then waited. That is not a conversation, it is a form.

   A LIVE EXCHANGE IS SOMETHING WAITING ON THE BANKER: a card with an open chip,
   a check that has not been acknowledged, a question with its answers on the
   table. A sentence is not one. A settled row is not one. The cap counts what
   the banker still has to do, because that is the thing that gets heavy.

   WHAT DOES NOT FIT WAITS ITS TURN, IN ORDER. The queue releases as the stage
   clears - which, with the settle choreography, is the moment the banker
   decides something - and it releases ONE AT A TIME with a beat between, so
   arrivals read as a sequence rather than as the dump this exists to prevent.

   THE CAP IS A CONTENT RULE AND THE BEAT IS A MOTION ONE. Under reduced motion
   the beat is zero and the queue drains as fast as the stage clears; the cap
   still holds, because a reader who asked for no animation did not ask for
   three questions at once.
   ============================================================================= */

/** How many things may be waiting on the banker at once. */
export const STAGE_CAP = 2;

/** The beat between one queued moment landing and the next being considered.
 *  Founder's own range is 250 to 400ms; this is the middle of it. */
export const REVEAL_MS = 320;

export interface StageGate {
  /**
   * Land this moment now if the stage has room, or hold it until it does.
   *
   * `liveAfter` is what the stage will hold once the CALLER'S OWN commit has
   * landed, and the caller is the only thing that can know it: a confirm that
   * settles its card and raises a check in one gesture has already changed the
   * count by the time this is called, and reading it off a render that has not
   * happened yet would hold back a question the stage has room for.
   */
  enqueue: (land: () => void, liveAfter?: number) => void;
  /** How many moments are waiting. The room may say so; nothing here does. */
  queued: number;
  /** Drop everything waiting. A room that restarted owes nobody its old queue. */
  reset: () => void;
}

/**
 * @param live how many exchanges are waiting on the banker right now. The ROOM
 *             owns this count: it is the only thing that knows what its own
 *             items mean, and keeping the reading there is what lets both rooms
 *             share one gate.
 */
export function useStageGate(args: { live: number; reduced: boolean }): StageGate {
  const { live, reduced } = args;
  const queue = useRef<Array<() => void>>([]);
  const timer = useRef(0);
  const holding = useRef(false);
  const [queued, setQueued] = useState(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const drain = useCallback(() => {
    if (holding.current) return;
    if (!queue.current.length) return;
    if (live >= STAGE_CAP) return;
    const next = queue.current.shift()!;
    setQueued(queue.current.length);
    next();
    if (reduced || !queue.current.length) return;
    /* ONE AT A TIME, WITH A BEAT. Without it a stage that cleared by two would
       land two moments in one frame, which is the simultaneous dump from the
       other direction. */
    holding.current = true;
    timer.current = window.setTimeout(() => {
      holding.current = false;
      setQueued((n) => n);
    }, REVEAL_MS);
  }, [live, reduced]);

  /* THE QUEUE IS LOOKED AT WHENEVER THE STAGE MOVES. `live` changing is the
     room settling something, which is the only thing that can make room. */
  useEffect(() => {
    drain();
  }, [drain, queued]);

  const enqueue = useCallback(
    (land: () => void, liveAfter?: number) => {
      const standing = liveAfter ?? live;
      if (!holding.current && !queue.current.length && standing < STAGE_CAP) {
        land();
        return;
      }
      queue.current.push(land);
      setQueued(queue.current.length);
    },
    [live],
  );

  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    holding.current = false;
    queue.current = [];
    setQueued(0);
  }, []);

  return { enqueue, queued, reset };
}
