/* =============================================================================
   THE PUBLISH SEAM (phase D, 2026-09-04).

   The memo room (phase C) holds the draft and the gesture; this module holds
   the shapes both sides agree on, so the room can be built against a stub that
   returns `{ status: "not-wired" }` and the real writeback can land underneath
   it without either side changing.

   ONE ENTRY POINT:
     publishMemo(draft, ctx) -> MemoPublication

   FOUR SYSTEMS, EACH ITS OWN LANE (founder, 2026-09-04). A publish touches the
   nCino package, the nFORMS document, the Experience decision/audit ledger and
   the AFS servicing queue. They fail independently, so one failure degrades its
   own step and nothing else: there is no all-or-nothing transaction across four
   systems and pretending otherwise would either hide a partial write or throw
   away three that worked. The report is per STEP, and every step names the
   system it wrote to, because "the narrative synced but the approval did not"
   is the sentence a banker needs and "the nCino lane failed" is not.

   PREREQUISITES ARE DECLARED, NOT IMPLIED. The only one is the document before
   the approval: the submit locks the package, and a memo that was never
   published has nothing for the committee to read. Everything else runs on its
   own account.

   WRITES ARE NEVER RETRIED. `callTool` retries reads only, and a rejection on a
   write is not proof the tool did not run (mcp.ts, ambiguous-outcome doctrine).
   A lane whose failure was ambiguous says so, and the decision to re-fire it
   belongs to the banker, behind a fresh gesture.
   ============================================================================= */

import type { AfsCoordinates } from "../data/contract";

/* ------------------------------------------------------------- the request */

/** What the room asks for. Carried for the seam; the publish itself reads the
 *  draft, which already resolved every one of these. */
export interface MemoRequest {
  accountId: string;
  /** The package VERSION under review. */
  packageId: string;
  trigger: "modify" | "renew" | "create" | "adhoc";
  /** Staging ids of the executed plans this memo speaks for. */
  filedPlans: string[];
  /** Salesforce user id (005...). */
  requestedBy: string;
  source?: { kind: string; subject?: string; from?: string; received?: string };
}

/* --------------------------------------------------------------- the draft */

export interface MemoProvenance {
  system: string;
  id?: string;
  label?: string;
}

/** nCino's own section ids, which are also `ncino_sync_memo_sections`' keys.
 *  The room keys by section id and never by `cm_*` field: the field map belongs
 *  to the connector, and a client that hard-codes it drifts the day nCino
 *  renames one. */
export const MEMO_SECTION_IDS = [
  "deal_summary",
  "relationship_overview",
  "background",
  "financial_analysis",
  "covenant_analysis",
  "collateral_analysis",
  "risk_assessment",
] as const;

export type MemoSectionId = (typeof MEMO_SECTION_IDS)[number];

export function isMemoSectionId(id: string): id is MemoSectionId {
  return (MEMO_SECTION_IDS as readonly string[]).includes(id);
}

export interface MemoSection {
  id: string;
  title: string;
  /** The section's own rendered HTML. Sanitised to the RTE subset on the way
   *  out; what the reading pane shows is the memo's full markup. */
  html: string;
  provenance?: MemoProvenance[];
  status?: "draft" | "approved" | "flagged";
  note?: string;
}

/** One human sign-off. The publish does NOT interrogate these: the room owns
 *  the attestation state and the publish gesture is itself the submit request.
 *  Carried here so both sides name the same shape. */
export interface MemoAttestation {
  memoId: string;
  sectionId: string;
  decision: "approved" | "flagged";
  note?: string;
  /** Salesforce user id (005...). */
  by: string;
  at: string;
}

/** Where a borrower's servicing lives in AFS. Declared on the bundle contract,
 *  because it is a property of the relationship rather than of this gesture.
 *  Absent means we do not know, and the servicing module renders its gap marker
 *  rather than the AFS sample loan, which belongs to a different borrower. */
export type { AfsCoordinates };

/** One facility on a staged servicing workpackage. The room composes these from
 *  the package; nothing here is defaulted, because `create_workpackage`'s own
 *  defaults are a sample term loan and revolver that belong to no borrower. */
export interface AfsFacilityRequest {
  name: string;
  amount: number;
  currency?: string;
  revolvingType?: "R" | "N";
  maturityDate?: string;
  effectiveDate?: string;
}

export interface MemoDraft {
  memoId: string;
  packageId: string;
  renderPlan?: {
    modules: Array<{ id: string; on: boolean; reason?: string }>;
    suppressed: Array<{ id: string; reason: string }>;
  };
  sections: MemoSection[];
  /** The whole memo, memo-shell rendered. Converted to nCino-safe HTML on the
   *  way to nFORMS; never published as-is. */
  html: string;
  dossierHash?: string;
  generatedAt?: string;
  generator?: "cockpit" | "mcp";
  /** Resolved by `afsMapping.ts` from the bundle at draft time. Absent is the
   *  normal state for a borrower with no AFS obligation. */
  afs?: AfsCoordinates;
  /** What the servicing workpackage should carry. Absent (or empty) skips the
   *  servicing lane rather than letting AFS fill in its sample facilities. */
  servicingFacilities?: AfsFacilityRequest[];
}

/* ------------------------------------------------------------- the context */

/** The publish gesture: who is publishing, on what, and who gets told. */
export interface MemoPublishContext {
  packageId: string;
  accountId: string;
  /** Salesforce user id (005...), for hybrid-auth attribution on every write. */
  actingUserId: string;
  actingUserName: string;
  /** Matched on Salesforce `User.Email`, not username. At least one required. */
  approverEmails: string[];
  /** Where the "submitted for approval" notice goes. At least one required. */
  notificationEmails: string[];
  /** Submission comments; the connector appends its own attribution. */
  comments?: string;
  /** nFORMS template to find-or-create. The connector defaults it. */
  templateName?: string;
}

/* --------------------------------------------------------------- the lanes */

/** One step of the sequence. The order here IS the sequence. */
export const LANE_IDS = [
  "sections",
  "document",
  "finalize",
  "approval",
  "notify",
  "ledger",
  "servicing",
] as const;

export type LaneId = (typeof LANE_IDS)[number];

/** The system of record a lane writes to. Four, and they fail independently. */
export type LaneSystem = "ncino" | "nforms" | "ledger" | "afs";

export const LANE_SYSTEM: Record<LaneId, LaneSystem> = {
  sections: "ncino",
  document: "nforms",
  finalize: "ncino",
  approval: "ncino",
  notify: "ncino",
  ledger: "ledger",
  servicing: "afs",
};

/** Which lanes must have completed before a lane may run. The document before
 *  the approval, and nothing else: a failed narrative sync must not stop the
 *  committee being convened, and the ledger and AFS answer to nobody. */
export const LANE_REQUIRES: Partial<Record<LaneId, LaneId[]>> = {
  approval: ["document"],
};

export type LaneStatus = "done" | "skipped" | "failed";

export interface LaneOutcome {
  lane: LaneId;
  system: LaneSystem;
  status: LaneStatus;
  /** One sentence, in the connector's own words where it gave any. */
  detail: string;
  /** What the write created, when it named something. */
  recordId?: string;
  url?: string;
  /**
   * The connector answered from FIXTURES: it reported the write and wrote
   * nothing. Surfaced because a room that says "published" over a simulated
   * write tells a banker something untrue about the system of record.
   */
  simulated?: boolean;
  /**
   * Outcome genuinely unknown: the tool may still have run. Never retried
   * unattended; re-firing is the banker's gesture (mcp.ts).
   */
  ambiguous?: boolean;
}

/* --------------------------------------------------------- the publication */

export interface MemoPublication {
  memoId: string;
  packageId: string;
  /**
   * `published` when every lane that ran landed, `partial` when some did and
   * some did not, `failed` when none did, and `not-wired` for the phase C stub
   * that stands in for this module until it is merged.
   */
  status: "published" | "partial" | "failed" | "not-wired";
  publishedAt?: string;
  /** The nFORMS document, when the document lane landed. */
  nforms?: { templateId?: string; templateName?: string; generateUrl?: string; bytes?: number };
  sections?: { synced: string[]; unmapped: string[]; truncated: string[] };
  approval?: { submittedAt: string; queue?: string; processInstanceId?: string; notified: string[] };
  afs?: { workpackageId: string };
  ledger?: { decisionAt?: string; auditAt?: string };
  /** Per step, in sequence order. The report the room shows. */
  lanes: LaneOutcome[];
  /** True when ANY lane was answered from fixtures. */
  simulated?: boolean;
}

/** The stub phase C builds against, so the room compiles before this lands. */
export function notWired(memoId: string, packageId: string): MemoPublication {
  return { memoId, packageId, status: "not-wired", lanes: [] };
}

/** Roll the lane outcomes up into the publication's own status. */
export function publicationStatus(lanes: LaneOutcome[]): MemoPublication["status"] {
  const ran = lanes.filter((l) => l.status !== "skipped");
  if (!ran.length) return "failed";
  const done = ran.filter((l) => l.status === "done");
  if (done.length === ran.length) return "published";
  return done.length ? "partial" : "failed";
}
