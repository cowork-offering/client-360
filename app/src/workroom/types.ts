import type { StagedOutput } from "../actions/stagedPlan";

/* =============================================================================
   THE WORKROOM, IN TYPES.

   ONE room, THREE modes. The mode changes the vocabulary, the checks, and what
   the manifest files. It does not change the shell: the entry scene, the step
   spine, the windowed thread, the peek primitive, the manifest rail and the
   approval under it are the same room in all three.

   The blessed design is design/workroom-mock/index.html (v2.2, commit 511b01e).
   Everything here is named after something visible in it.
   ============================================================================= */

/** modify — reshape an existing package (the mock's storyline verbatim).
 *  renew   — compose a renewal on maturing facilities and hand INTO approval.
 *  create  — compose a new package, or add a facility inside an existing one. */
export type WorkroomMode = "modify" | "renew" | "create";

/** TWO DOORS, ONE ROOM (create only, and it only ever changes what is pinned).
 *  `account` composes the package from scratch; `package` adds a member to a
 *  package that is already on the table, so the package arrives pre-pinned. */
export type WorkroomDoor = "account" | "package";

/** What the room is opened ON. Everything the shell needs to name the place it
 *  is working in, resolved by the caller from the cockpit's own read. */
export interface WorkroomContext {
  mode: WorkroomMode;
  door: WorkroomDoor;
  accountId: string;
  accountName: string;
  /** Null on the `account` door of create: there is no package yet. */
  productPackageId: string | null;
  packageName: string;
  /** The banker in the room. The approval names them, so the room must know. */
  approver: string;
}

/** The four columns a credit committee reads a change set in. The manifest
 *  groups by these and in this order, whatever the mode. */
export type ManifestGroupId = "structure" | "terms" | "covenants" | "security";

export const MANIFEST_GROUPS: { id: ManifestGroupId; label: string }[] = [
  { id: "structure", label: "Package structure" },
  { id: "terms", label: "Member terms" },
  { id: "covenants", label: "Package covenants" },
  { id: "security", label: "Security" },
];

/** The check that a confirmed change trips, delivered back into the thread as
 *  an agent message with its verdict on the face. Never a separate tab. */
export interface WorkroomChallenge {
  id: string;
  verdict: string;
  tone: "ok" | "warn";
  /** The provenance line beside the verdict chip. */
  kicker: string;
  line: string;
  /** The arithmetic, opened as a peek. `[label, value, rowClass?]`. */
  rows: [string, string, string?][];
  /** What the banker can say about it, in the agent's own words. */
  say: string;
}

/** ONE proposed change: a delta chip in the thread, a manifest entry once it is
 *  confirmed, and a filed row once the plan runs. */
export interface WorkroomDelta {
  id: string;
  group: ManifestGroupId;
  /** "Term change", "New covenant" — the chip's category badge. */
  kind: string;
  /** Which badge colour the kind carries. Absent is the accent default. */
  kindTone?: "new" | "collateral" | "refusal";
  /** The line the arrival toast says on the right. */
  badge: string;
  title: string;
  target: string;
  before: string;
  after: string;
  /** The package member this touches, for the "N of M members" count. */
  member?: string;
  /** True when this delta ADDS a member, which moves the member count. */
  newMember?: boolean;
  /** Millions added to the package's committed figure. Walked back on remove. */
  committedDeltaMM?: number;
  /** The org records this writes, `[label, value]`, shown on the chip's info. */
  map: [string, string][];
  /** Wire field names only. Never values: those live in the plan hash. */
  fields: string[];
  /** An org constraint the banker must read before confirming. Verbatim. */
  caveat?: string;
  /** The check this confirm trips, the moment it lands. */
  challenge?: WorkroomChallenge;
  /** What the filed state shows once execution verifies it by re-query. */
  filed: { recordId: string; verification: string };
}

/** An ask the room will not stage, answered with the reason rather than a
 *  fabricated chip. The mock's refusal beat, generalised. */
export interface WorkroomRefusal {
  id: string;
  target: string;
  title: string;
  /** The org's reason, in banker language. */
  reason: string;
  /** The longer account, opened as a peek. */
  detail: string;
}

/** What `parseIntent` gives back. Three outcomes and no fourth: deltas the
 *  banker can confirm, an honest refusal, or "I did not understand that". */
export type IntentResult =
  | { kind: "deltas"; reply: string; deltas: WorkroomDelta[] }
  | { kind: "refusal"; reply: string; refusal: WorkroomRefusal }
  | { kind: "unparsed"; reply: string };

/**
 * THE STAGED PLAN, AT THE SEAM.
 *
 * `plan` is the cockpit's own `StagedOutput`, so a real engine hands the
 * `stage_*` response straight through with nothing to translate. The three ids
 * beside it are that plan's own, lifted once at the seam so the shell never
 * reaches into a plan to find the token it must not touch.
 */
export interface StagedWorkroomPlan {
  plan: StagedOutput;
  planHash: string;
  stagingId: string;
  decisionToken: string | null;
}

/** The four fields `execute_*` reads, exactly as ConfirmGate passes them. */
export interface WorkroomApproval {
  stagingId: string;
  planHash: string;
  decisionToken: string;
  approverUserId: string;
}

/** One manifest entry after the plan ran, with the id the org gave it and the
 *  re-query that proves it landed. */
export interface FiledEntry {
  deltaId: string;
  recordId: string;
  verification: string;
}

/** The closing move: the reply to the client, drafted, never sent. */
export interface DraftedReply {
  subject: string;
  lede: string;
  body: string;
}

/** What `execute` gives back. Verified, or it does not come back. */
export interface WorkroomExecution {
  filed: FiledEntry[];
  /** The single-use token line under the approve button. */
  tokenNote: string;
  /** RENEW: booking runs through the bank's own approval process, and the room
   *  says so rather than implying it booked. Absent where filing is terminal. */
  handoff?: string;
  reply?: DraftedReply;
}
