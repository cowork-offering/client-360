import type { WorkroomContext, WorkroomDoor, WorkroomMode } from "./types";

/* =============================================================================
   ONE ROOM, THREE VOCABULARIES.

   Every word that differs between modify, renew and create lives here, once. A
   component that hard-codes "modification" anywhere is a component that will be
   wrong in two of the three modes, so nothing downstream writes these strings.

   The FOURTH STEP is the tell. Modify approves and files. Create files. Renew
   SUBMITS: a renewal is never booked by this room, it is handed into the bank's
   own approval process, and the copy says so at the moment it happens rather
   than letting the filed state imply a booking that did not occur.
   ============================================================================= */

export interface ModeVocabulary {
  /** The room's own name, in the top bar beside the brand lockup. */
  title: string;
  /** The step spine, left to right. Four, always: the shell's state machine is
   *  a four-stage machine and the fourth is the one that differs. */
  steps: [string, string, string, string];
  /** The manifest rail's kicker. */
  manifestHeading: string;
  /** What the rail says while it is still empty — the signature moment's
   *  starting position (law 8). */
  emptyLine: string;
  /** What one thing in the rail is CALLED, singular and plural. The rail count,
   *  the plan summary and the approve action all read from this pair, so a
   *  renewal never counts "changes" and a creation never counts "terms". */
  changeWord: [string, string];
  /** The sentence under the plan card, above the approve action. */
  planTitle: string;
  /** The approve action, given how many changes are stacked above it. */
  approveLabel: (count: number) => string;
  /** The gate hint on the scene bar while the approval is the open move. */
  approveHint: string;
  /** The word the filed state uses for what just happened. */
  filedWord: string;
}

const COMMON_STEPS: [string, string, string] = ["Understand", "Compose", "Checks"];

const VOCABULARY: Record<WorkroomMode, ModeVocabulary> = {
  modify: {
    title: "Modification Workroom",
    steps: [...COMMON_STEPS, "Approve"],
    manifestHeading: "This modification",
    emptyLine: "Nothing staged yet. Confirmed changes land here, grouped.",
    changeWord: ["change", "changes"],
    planTitle: "One clone. One single use token. One approval.",
    approveLabel: (n) => `Approve and file ${n} ${n === 1 ? "change" : "changes"}`,
    approveHint: "Approve to file the plan",
    filedWord: "Filed",
  },
  renew: {
    title: "Renewal Workroom",
    steps: [...COMMON_STEPS, "Submit"],
    manifestHeading: "This renewal",
    emptyLine: "Nothing staged yet. Confirmed renewal terms land here, grouped.",
    changeWord: ["term", "terms"],
    planTitle: "One renewal plan. One single use token. One submission.",
    approveLabel: (n) => `Approve and submit ${n} ${n === 1 ? "term" : "terms"}`,
    approveHint: "Approve to submit the renewal plan",
    filedWord: "Submitted",
  },
  create: {
    title: "New Facility Workroom",
    steps: [...COMMON_STEPS, "File"],
    manifestHeading: "This package",
    emptyLine: "Nothing staged yet. Confirmed structure lands here, grouped.",
    changeWord: ["record", "records"],
    planTitle: "One package. One single use token. One filing.",
    approveLabel: (n) => `File ${n} ${n === 1 ? "record" : "records"}`,
    approveHint: "File to write the package",
    filedWord: "Filed",
  },
};

/** The room's vocabulary for a context. The `create` door changes two words and
 *  nothing else: composing a package from an account and adding a member to a
 *  package on the table are the same room with a different thing pinned. */
export function vocabularyFor(context: Pick<WorkroomContext, "mode" | "door">): ModeVocabulary {
  const base = VOCABULARY[context.mode];
  if (context.mode !== "create" || context.door !== "package") return base;
  return { ...base, title: "New Facility Workroom", manifestHeading: "This addition" };
}

/** The door a mode opens on, given whether a package is on the table. Modify
 *  and renew are always package-anchored: there is nothing to reshape or renew
 *  without one. */
export function doorFor(mode: WorkroomMode, productPackageId: string | null): WorkroomDoor {
  if (mode !== "create") return "package";
  return productPackageId ? "package" : "account";
}
