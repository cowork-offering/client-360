import { useSyncExternalStore } from "react";
import type { MemoChange } from "../../memo/types";

/* =============================================================================
   THE CREDIT MEMO ROOM'S SESSION.

   The third of three, and the same store as the other two for the same reason
   (`workroom/roomSession.ts`, `relationship/relSession.ts`): the doors that open
   this room sit outside any provider that owns it, and an open memo is not a
   view the cockpit persists.

   WHAT DIFFERS FROM THE OTHER TWO. There is no route to bind. A memo room has
   one job from the moment it opens, so it never asks which room it is; what it
   asks is whether to draft now or be steered first, which is a question about
   the memo and not about the engine behind it.

   WHAT IT CARRIES. A memo opened from a FINALE knows exactly what was just
   filed, because the room that filed it is handing over its own ledger. A memo
   opened from the FAB knows nothing but the package, and reads what was done
   from the ORG. Both are legitimate; the greeting says which one it is standing
   on, because a banker has to know whether the memo is reading the trail or a
   handover (requirements, non-negotiable 1).
   ============================================================================= */

/** What opened the room. It becomes the memo's type on the cover. */
export type MemoTrigger = "modify" | "renew" | "create" | "adhoc";

/** Where the request came from, where it came from anywhere. The intent's own
 *  shape, carried through rather than re-derived. */
export interface MemoRequestSource {
  kind: string;
  subject?: string;
  from?: string;
  received?: string;
}

export interface MemoSession {
  accountId: string;
  accountName: string;
  /** THE VERSION UNDER REVIEW. A memo is always about one package version, so
   *  this is the anchor and not an option; the doors resolve it before opening. */
  productPackageId: string | null;
  trigger: MemoTrigger;
  /** The finale's ledger, where a finale opened this. Null from the FAB. */
  carried: MemoChange[] | null;
  source: MemoRequestSource | null;
}

let session: MemoSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open the memo room on a package. */
export function openMemoRoom(args: {
  accountId: string;
  accountName: string;
  productPackageId: string | null;
  trigger?: MemoTrigger;
  /** The filed changes, where the caller is a finale that just filed them. */
  carried?: readonly MemoChange[] | null;
  source?: MemoRequestSource | null;
}): void {
  session = {
    accountId: args.accountId,
    accountName: args.accountName,
    productPackageId: args.productPackageId,
    trigger: args.trigger ?? "adhoc",
    carried: args.carried?.length ? [...args.carried] : null,
    source: args.source ?? null,
  };
  emit();
}

export function closeMemoRoom(): void {
  if (!session) return;
  session = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): MemoSession | null {
  return session;
}

/** The open memo session, or null. One mount reads this. */
export function useMemoRoom(): MemoSession | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
