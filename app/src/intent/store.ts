import { useSyncExternalStore } from "react";
import { db, type DbError, type DbQuerySnapshot, type DbUnsubscribe } from "../channel/dbDoor";
import { INTENT_COLLECTION, readIntentDoc, type IntentDoc } from "./contract";

/* =============================================================================
   THE INTENT STORE — what is waiting, and what was taken.

   A module store rather than a slice of ViewState for the same reason the two
   room sessions are: the whisper has to be able to open a room from outside any
   provider that owns one, and an intent is not a view the cockpit persists.

   THE WATCH IS THE ONLY READ. `onSnapshot` over `status == "pending"`, newest
   first, so an intent written by another session while the banker is looking at
   the landing arrives on its own. With no `db` capability nothing is
   subscribed, `pending` stays empty for the life of the page, and every surface
   is byte-identical to the cockpit without this file.

   WRITES ARE FIRE-AND-FORGET AND NEVER GATE THE ROOM. Marking an intent opened
   is bookkeeping for whoever wrote it; a banker whose store write failed still
   gets the room. Last-writer-wins, no counters, no read-modify-update.
   ============================================================================= */

export interface IntentState {
  /** Pending intents, newest first, as the last snapshot delivered them. */
  pending: IntentDoc[];
  /** The one the banker took, for as long as this page lives. */
  consumed: IntentDoc | null;
  /** Intents the banker said Later to. Session-local: a reload offers again. */
  deferred: string[];
  /** True once a snapshot has been delivered at all. */
  watching: boolean;
}

let state: IntentState = { pending: [], consumed: null, deferred: [], watching: false };
const listeners = new Set<() => void>();

function set(next: Partial<IntentState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): IntentState => state;

export function useIntents(): IntentState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const intentState = (): IntentState => state;

/* ------------------------------------------------------------------- watch */

let unwatch: DbUnsubscribe | null = null;

/**
 * Start the live read. Idempotent, and a no-op with no store.
 *
 * PENDING ONLY, NEWEST FIRST, BOUNDED. An intent the banker already opened is
 * not offered again, and a store holding hundreds is a window of the newest
 * twenty rather than a scan of everything.
 */
export function startIntentWatch(): DbUnsubscribe {
  if (unwatch) return unwatch;
  const store = db();
  if (!store) return () => {};
  try {
    const off = store
      .collection(INTENT_COLLECTION)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(20)
      .onSnapshot(
        (snap: DbQuerySnapshot) => {
          const docs: IntentDoc[] = [];
          for (const d of snap.docs ?? []) {
            if (!d?.exists) continue;
            const intent = readIntentDoc(d.id, d.data());
            if (intent && intent.status === "pending") docs.push(intent);
          }
          set({ pending: docs, watching: true });
        },
        (_e: DbError) => {
          // A dead listener is absence, not an incident: the lane stops
          // offering and every other surface is untouched.
          set({ pending: [], watching: false });
          unwatch = null;
        },
      );
    unwatch = off;
    return off;
  } catch {
    return () => {};
  }
}

export function stopIntentWatch(): void {
  if (!unwatch) return;
  try {
    unwatch();
  } catch {
    /* an unsubscribe that throws is still an unsubscribe */
  }
  unwatch = null;
}

/* -------------------------------------------------------------- the taking */

/** The banker took this one. It leaves the offer list for this page. */
export function consumeIntent(intent: IntentDoc): void {
  set({
    consumed: intent,
    pending: state.pending.filter((p) => p.id !== intent.id),
  });
}

/** The banker said Later. Offered again on the next load, never in this one. */
export function deferIntent(intent: IntentDoc): void {
  if (state.deferred.includes(intent.id)) return;
  set({ deferred: [...state.deferred, intent.id] });
}

/** The intent this page is standing on, or null. */
export const consumedIntent = (): IntentDoc | null => state.consumed;

/**
 * The next intent to offer, given where the banker is standing.
 *
 * THE WHISPER IS NOT A NOTIFICATION CENTRE. It speaks on the landing, where an
 * intent is a thing to go and do, and on the account it names, where it is the
 * thing already in front of them. On any other relationship it holds its
 * tongue: interrupting a banker mid-file about a different borrower is exactly
 * the behaviour this cockpit refuses everywhere else.
 */
export function offerFor(view: "home" | "account", accountId: string | null): IntentDoc | null {
  for (const intent of state.pending) {
    if (state.deferred.includes(intent.id)) continue;
    if (state.consumed?.id === intent.id) continue;
    if (view === "home" || intent.accountId === accountId) return intent;
  }
  return null;
}

/* ------------------------------------------------------------- the marking */

async function mark(intent: IntentDoc, patch: Record<string, unknown>): Promise<void> {
  const store = db();
  if (!store) return;
  try {
    await store.collection(INTENT_COLLECTION).doc(intent.id).update(patch);
  } catch {
    // Bookkeeping, not the banker's business. The room is already open.
  }
}

/** The banker opened it. Stamped with the page's own clock: this is a live
 *  gesture, not a figure derived from the book. */
export function markOpened(intent: IntentDoc, openedBy?: string): Promise<void> {
  return mark(intent, { status: "opened", openedAt: new Date().toISOString(), openedBy: openedBy ?? "the signed-in banker" });
}

/** The plan was executed. The intent is spent. */
export function markDone(intent: IntentDoc): Promise<void> {
  return mark(intent, { status: "done" });
}

/* ------------------------------------------------------------ the console */

/**
 * `window.c360Intent()` — what is waiting and what was taken.
 *
 * A DEBUGGING SURFACE, NOT AN API. It prints; it opens nothing and it writes
 * nothing, so nobody can drive the cockpit from a console line and call it a
 * banker's gesture.
 */
export function installIntentReadout(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { c360Intent?: () => IntentState }).c360Intent = () => {
    const s = state;
    /* eslint-disable no-console */
    console.log(`[C360-INTENT] ${s.pending.length} pending${s.watching ? "" : " (no store on this view)"}`);
    for (const p of s.pending) {
      console.log(`  ${p.id}  ${p.accountName}  ${p.room}/${p.route}  ${p.lines.length} line(s)  ${p.createdAt}`);
    }
    console.log("[C360-INTENT] consumed:", s.consumed ? `${s.consumed.id} (${s.consumed.accountName})` : "none");
    if (s.deferred.length) console.log("[C360-INTENT] deferred this session:", s.deferred.join(", "));
    /* eslint-enable no-console */
    return s;
  };
}

/** Test seam: put the store back the way a fresh page finds it. */
export function __resetIntentsForTests(): void {
  stopIntentWatch();
  state = { pending: [], consumed: null, deferred: [], watching: false };
  for (const l of listeners) l();
}
