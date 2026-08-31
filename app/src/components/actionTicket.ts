import { useSyncExternalStore } from "react";

/* =============================================================================
   THE STAGED-ACTION TICKET, OPENED BY ID.

   The arc's Annual review and Covenant review satellites open the SAME ticket
   the Client Actions sheet used to open for those rows. The sheet has no UI
   trigger any more (founder, 2026-08-31), so the arc is now the only surface
   that opens a ticket by naming the action rather than by tapping a row, and
   that gesture is this store.

   IT IS A MODULE STORE FOR THE SAME REASON `openWorkroom` IS ONE: the ticket
   the arc opens is portalled above the whole app, and the FAB has no place in a
   provider tree that could own it. Making it a store also gives every caller
   ONE way in — including a test standing in for the arc on an action the arc
   does not carry, which is a real product path rather than a reach into a
   component's private state.
   ============================================================================= */

let open: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open the ticket for a registry action. An action with no panel schema opens
 *  nothing: the ticket renders null and the caller's gesture was a no-op, which
 *  is the honest outcome rather than an empty modal. */
export function openActionTicket(actionId: string): void {
  open = actionId;
  emit();
}

export function closeActionTicket(): void {
  if (open === null) return;
  open = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string | null {
  return open;
}

export function useActionTicket(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
