/* =============================================================================
   KYC + ONBOARDING — shape and derivation.

   Field names mirror the org's own vocabulary so a future wiring is a rename of
   nothing (BUILD-SPEC-V1 §2.1, §2.8.1, §2.8.3):

     stage / status / type / lookupKey  → LLC_BI__Onboarding__c
     documents[]                        → FinServ__IdentificationDocument__c
                                          (+ VerifiedBy__c / VerifiedOn__c)
     parties[]                          → FinServ__AccountAccountRelation__c
                                          (typed FinServ__ReciprocalRole__c pairs)
     screenings[]                       → KYC_Screening__c (immutable evidence)
     clearance                          → KYC_Clearance__c

   PROVENANCE. Every case in this artifact is `_sample_only`, every screening
   result is labelled `Simulated (demo)` and carries `simulated: true`, and that
   label propagates to the row that renders it (§3.4). Nothing here came from a
   screening provider and nothing here pretends it did.
   ============================================================================= */

import type { C360Data, Id } from "./contract";
import { dayDiff } from "./time";

/** LLC_BI__Stage__c — the four org values, in the org's order. */
export const ONBOARDING_STAGES = ["CustomerEngagement", "DueDiligence", "Validation", "Complete"] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

/** LLC_BI__Type__c. */
export type OnboardingType =
  | "NewCustomer"
  | "NewProduct"
  | "KybAndKycOnly"
  | "RiskAssessmentOnly"
  | "AmendMandate"
  | "SmallBusiness";

/** LLC_BI__Status__c. */
export type OnboardingStatus = "Open" | "InProgress" | "Complete" | "Cancelled" | "Declined";

export type ScreeningType = "Sanctions" | "PEP" | "AdverseMedia" | "KYB";
export type ScreeningResult = "Clear" | "PotentialMatch" | "Hit" | "Pending" | "NotRun";
export type DocumentStatus = "Verified" | "Pending" | "Outstanding";

/** Banker-facing labels for the org's camel-case picklist values. */
export const STAGE_LABEL: Record<OnboardingStage, string> = {
  CustomerEngagement: "Customer engagement",
  DueDiligence: "Due diligence",
  Validation: "Validation",
  Complete: "Complete",
};

export const TYPE_LABEL: Record<OnboardingType, string> = {
  NewCustomer: "New customer",
  NewProduct: "New product",
  KybAndKycOnly: "KYB and KYC only",
  RiskAssessmentOnly: "Risk assessment only",
  AmendMandate: "Amend mandate",
  SmallBusiness: "Small business",
};

export const SCREENING_LABEL: Record<ScreeningType, string> = {
  Sanctions: "Sanctions",
  PEP: "PEP",
  AdverseMedia: "Adverse media",
  KYB: "KYB",
};

export const RESULT_LABEL: Record<ScreeningResult, string> = {
  Clear: "Clear",
  PotentialMatch: "Potential match",
  Hit: "Hit",
  Pending: "Pending",
  NotRun: "Not run",
};

/** The two front doors, made visible: a case that arrived from the client-facing
 *  intake service carries what the prospect CLAIMED, never what the bank knows. */
export interface OnboardingIntake {
  submissionId: string;
  claimedEmail: string;
  claimedContact?: string;
  receivedAt: string;
  channel: string;
  note?: string;
}

export interface OnboardingParty {
  partyId: string;
  name: string;
  partyType: "Entity" | "Individual";
  /** FinServ__Role__c — the role this party holds toward the prospect. */
  role: string;
  /** FinServ__ReciprocalRole__c — the inverse the catalog pairs it with. */
  reciprocalRole: string;
  ownershipPercent: number | null;
  /** Which system the edge came from, per §2.8.3's union rule. */
  source: "fsc" | "ncino" | "intake";
  /** Pre-seeded edges are READ and confirmed by a human; the agent never writes one. */
  confirmed: boolean;
  externalId?: string;
  note?: string;
}

export interface OnboardingDocument {
  documentId: string;
  partyName: string;
  /** FinServ__DocumentType__c — restricted picklist. */
  documentType: string;
  documentNumberMasked: string | null;
  issuingCountry: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  status: DocumentStatus;
  /** FinServ__VerifiedBy__c / FinServ__VerifiedOn__c — the org's own named-human pair. */
  verifiedBy: string | null;
  verifiedOn: string | null;
  source: "banker" | "intake";
  note?: string;
}

export interface OnboardingScreening {
  screeningId: string;
  partyName: string;
  screeningType: ScreeningType;
  result: ScreeningResult;
  /** `Simulated (demo)` on every row in this artifact. */
  provider: string;
  screenedOn: string | null;
  simulated: boolean;
  findings: string | null;
  /** FinServ__Alert__c severity when the result raised the surfacing alert. */
  alertSeverity?: "Error" | "Warning" | "Info" | null;
  /** The blocking item this evidence drives, when it drives one. */
  blockingItemId?: string | null;
}

export interface OnboardingBlockingItem {
  itemId: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  /** The stage this item holds the case out of. */
  blocksStage: OnboardingStage;
}

export interface OnboardingClearance {
  /** KYC_Clearance__c exists or it does not. There is no third state. */
  present: boolean;
  clearedBy: string | null;
  clearedOn: string | null;
  basis: string | null;
  clientAttestationReceived?: boolean;
  clientAttestationOn?: string | null;
}

export interface OnboardingStageEvent {
  stage: OnboardingStage;
  enteredAt: string | null;
  advancedBy?: string;
  note?: string;
}

export interface OnboardingTargetDeal {
  headline: string;
  amount: number | null;
  product: string;
}

export interface OnboardingCase {
  onboardingId: string;
  accountId: Id;
  name: string;
  /** LLC_BI__lookupKey__c — unique, externalId, the idempotency anchor. */
  lookupKey: string;
  type: OnboardingType;
  stage: OnboardingStage;
  status: OnboardingStatus;
  startedAt: string;
  completedAt: string | null;
  industry?: string;
  jurisdiction?: string;
  owner?: string;
  targetDeal?: OnboardingTargetDeal;
  intake?: OnboardingIntake | null;
  stageHistory?: OnboardingStageEvent[];
  parties?: OnboardingParty[];
  documents?: OnboardingDocument[];
  screenings?: OnboardingScreening[];
  blockingItems?: OnboardingBlockingItem[];
  clearance: OnboardingClearance;
  verdict?: string;
  note?: string;
  _sample_only?: boolean;
}

export interface OnboardingBook {
  cases?: OnboardingCase[];
  note?: string;
}

/* ------------------------------------------------------------- selectors */

export function onboardingCases(data: C360Data | null | undefined): OnboardingCase[] {
  const raw = data?.onboarding?.cases;
  if (!Array.isArray(raw)) return [];
  // Same defensive posture as readAnchors: a malformed row is not a row.
  return raw.filter((c): c is OnboardingCase => !!c && typeof c === "object" && typeof c.accountId === "string");
}

export function findOnboardingCase(data: C360Data | null | undefined, accountId: Id | null): OnboardingCase | null {
  if (!accountId) return null;
  return onboardingCases(data).find((c) => c.accountId === accountId) ?? null;
}

/** Days since the case entered its CURRENT stage, against meta.generatedAt (A10 —
 *  never Date.now, so the figure is reproducible against the staged snapshot). */
export function daysInStage(c: OnboardingCase, generatedAt: string): number | null {
  const entered = (c.stageHistory ?? []).find((e) => e.stage === c.stage)?.enteredAt ?? c.startedAt;
  if (!entered) return null;
  const d = dayDiff(entered, generatedAt);
  return d === null ? null : Math.abs(d);
}

const RESULT_RANK: Record<ScreeningResult, number> = {
  Hit: 4,
  PotentialMatch: 3,
  Pending: 2,
  NotRun: 1,
  Clear: 0,
};

/** The worst screening outcome across the case — what the pipeline row shows.
 *  Absent screenings read as "Not run", which is a fact, not a clear. */
export function worstScreening(c: OnboardingCase): ScreeningResult {
  const rows = c.screenings ?? [];
  if (!rows.length) return "NotRun";
  return rows.reduce<ScreeningResult>((worst, r) => (RESULT_RANK[r.result] > RESULT_RANK[worst] ? r.result : worst), "Clear");
}

export function documentCounts(c: OnboardingCase): { verified: number; pending: number; total: number } {
  const docs = c.documents ?? [];
  return {
    verified: docs.filter((d) => d.status === "Verified").length,
    pending: docs.filter((d) => d.status !== "Verified").length,
    total: docs.length,
  };
}

/**
 * Why the case cannot reach Complete.
 *
 * The attestation gate is not one blocking item among many — it is the terminal
 * condition. A case with every other item cleared still cannot complete, because
 * only a named human writing KYC_Clearance__c can move it, and this artifact
 * never writes one. So a clean case returns exactly this reason, and that is the
 * honest answer, not an empty list that would read as "ready to go".
 */
export const ATTESTATION_REASON =
  "Complete requires a human KYC clearance attestation. No clearance record exists on this case, and nothing in this cockpit can mint one.";

export function completionBlockers(c: OnboardingCase): string[] {
  const reasons = (c.blockingItems ?? []).map((b) => b.title);
  if (!c.clearance?.present) reasons.push("Awaiting human KYC clearance attestation");
  return reasons;
}

export function canComplete(c: OnboardingCase): boolean {
  return completionBlockers(c).length === 0;
}

/** True when the case is still in onboarding — derived from data, never stored
 *  in UI state (§6.3). Stage Complete moves the relationship to the book. */
export function isInOnboarding(c: OnboardingCase): boolean {
  return c.stage !== "Complete";
}

export function stageIndex(stage: OnboardingStage): number {
  const i = ONBOARDING_STAGES.indexOf(stage);
  return i < 0 ? 0 : i;
}

/* ----------------------------------------------------------------- L1 rows */

export interface OnboardingRow {
  accountId: Id;
  onboardingId: string;
  name: string;
  type: OnboardingType;
  stage: OnboardingStage;
  status: OnboardingStatus;
  daysInStage: number | null;
  blockingCount: number;
  screening: ScreeningResult;
  documentsVerified: number;
  documentsTotal: number;
  attested: boolean;
  targetDeal: string | null;
  sample: boolean;
  fromIntake: boolean;
}

/** Pipeline rows for the "In onboarding" zone, ordered the way a banker triages:
 *  furthest along first, then longest waiting. */
export function buildOnboardingRows(data: C360Data | null | undefined): OnboardingRow[] {
  const generatedAt = data?.meta?.generatedAt ?? "";
  return onboardingCases(data)
    .filter(isInOnboarding)
    .map((c) => {
      const docs = documentCounts(c);
      return {
        accountId: c.accountId,
        onboardingId: c.onboardingId,
        name: c.name,
        type: c.type,
        stage: c.stage,
        status: c.status,
        daysInStage: daysInStage(c, generatedAt),
        blockingCount: (c.blockingItems ?? []).length,
        screening: worstScreening(c),
        documentsVerified: docs.verified,
        documentsTotal: docs.total,
        attested: c.clearance?.present === true,
        targetDeal: c.targetDeal?.headline ?? null,
        sample: c._sample_only === true,
        fromIntake: !!c.intake,
      };
    })
    .sort((a, b) => stageIndex(b.stage) - stageIndex(a.stage) || (b.daysInStage ?? 0) - (a.daysInStage ?? 0));
}
