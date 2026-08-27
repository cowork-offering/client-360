import { useSyncExternalStore } from "react";
import { packageRecords } from "../actions/schemas";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { doorFor } from "./modes";
import type { WorkroomContext, WorkroomMode } from "./types";

/* =============================================================================
   OPENING THE ROOM.

   TWO ENTRY POINTS, ONE CALL. Client Actions opens the workroom for the three
   registry actions that ARE workroom work, and the natural-language path that
   lands in a later wave opens it the same way — `openWorkroom(mode, context)`
   from anywhere, with no component tree between the caller and the room.

   That is why this is a small module store rather than a slice of ViewState: a
   chat chip, a deep link or an activity next-step must be able to open the room
   without first being somewhere in the provider tree that owns it, and the room
   is a full-surface overlay with no place in the persisted view state.
   ============================================================================= */

/** The registry actions that are workroom work. ONE map: taking an action back
 *  off the workroom is deleting a line here, not unpicking a component. */
const WORKROOM_ACTION_MODES: Record<string, WorkroomMode> = {
  "loan-modification": "modify",
  renewal: "renew",
  "new-facility-request": "create",
};

export function workroomModeFor(actionId: string): WorkroomMode | null {
  return WORKROOM_ACTION_MODES[actionId] ?? null;
}

/**
 * The room's context, resolved from the cockpit's OWN read.
 *
 * The package is resolved the same way every ticket resolves it, through
 * `packageRecords`, so the room and the tickets can never disagree about which
 * package a banker is standing in. No package on the account is a fact, not a
 * failure: it is the `account` door of create.
 *
 * MORE THAN ONE PACKAGE IS ALSO A FACT, and it is the one this used to lose.
 * Taking `packages[0]` silently anchored the whole session — one plan, one
 * approval, one credit action — on whichever package the read happened to list
 * first. A relationship carrying several is now opened UNANCHORED and the room
 * asks; `productPackageId` names one where the caller already knows it, which is
 * both the single-package case and the banker's own choice coming back in.
 */
export function workroomContextFor(args: {
  mode: WorkroomMode;
  data: C360Data;
  bundle: BorrowerBundle | null;
  accountId: string;
  accountName: string;
  /** The package the caller is already standing in, where there is one. */
  productPackageId?: string | null;
}): WorkroomContext {
  const packages = packageRecords(args.bundle);
  const named = args.productPackageId ? packages.find((p) => p.id === args.productPackageId) : null;
  const pkg = named ?? (packages.length === 1 ? packages[0] : null);
  const productPackageId = pkg?.id ?? null;
  return {
    mode: args.mode,
    door: doorFor(args.mode, productPackageId),
    accountId: args.accountId,
    accountName: args.accountName,
    productPackageId,
    packageName:
      pkg?.label ?? (packages.length > 1 ? `${args.accountName} · ${packages.length} packages` : `${args.accountName} · no package yet`),
    approver: args.data.meta?.user ?? "the signed-in banker",
  };
}

/* ------------------------------------------------------------------- store */

let open: WorkroomContext | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open the workroom on a context. Replacing an open room with another context
 *  is a legitimate move (a banker switching packages), so this does not guard. */
export function openWorkroom(context: WorkroomContext): void {
  open = context;
  emit();
}

export function closeWorkroom(): void {
  if (!open) return;
  open = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): WorkroomContext | null {
  return open;
}

/** The open room, or null. One mount reads this; everything else calls
 *  `openWorkroom`. */
export function useWorkroom(): WorkroomContext | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
