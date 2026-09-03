import type { BrainMail } from "../channel/brainLane";

/* =============================================================================
   THE MAIL THE ROOM WAS OPENED ON.

   A leaf module with one type import and nothing else, for one reason: the
   room's session (`components/workroom/roomSession.ts`) clears this when the
   room closes, and the activity feed sets it when the banker opens a message.
   Anything richer here would put a cycle between those two.

   WHY IT EXISTS AT ALL. The greeting already reads the client's mail off the
   bundle and off the mailbox, and picks the richer of the two. Neither of those
   knows WHICH message the banker just clicked. A relationship carrying three
   open messages would open the room on whichever the sweep landed first, which
   is the room talking past the banker, which is the failure the intent handoff
   fixed for a carried-in instruction.

   IT CARRIES A NOTE, NEVER A FIGURE. What is stored is the same `BrainMail`
   shape the swept and live reads produce, built from the message and from the
   request already derived from it. Every number the room prints still comes
   from the book.
   ============================================================================= */

let carried: { accountId: string; note: BrainMail } | null = null;

/** The banker opened the room on this message. Replaces any earlier one: one
 *  room is open at a time, and it is standing on one message. */
export function carryMail(accountId: string, note: BrainMail): void {
  carried = { accountId, note };
}

/** The message this room was opened on, or null for every other way in. */
export function carriedMailFor(accountId: string | null | undefined): BrainMail | null {
  return carried && accountId && carried.accountId === accountId ? carried.note : null;
}

/** The room closed. The next one is not standing on this message. */
export function clearCarriedMail(): void {
  carried = null;
}
