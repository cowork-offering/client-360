/* =============================================================================
   WHERE A COVENANT IS ATTACHED, AND WHAT THE FACILITY BEHIND IT LOOKS LIKE.

   Salesforce holds a covenant on the ACCOUNT (`LLC_BI__Account_Covenant__c`) and
   associates it to loans through `LLC_BI__Loan_Covenant__c`. A covenant is
   never only on a loan, so "which loans does this one bind" is a question the
   surface has to answer per covenant rather than a grouping it can do once.

   THREE STATES, NOT TWO. `attachedLoans` absent means the read does not carry
   the junction; empty means the read carries it and says account only. Merging
   those two is how a cockpit ends up asserting "no facilities" about data it
   never received, so they stay apart all the way to the screen.

   The figures come from the EXPOSURE read, matched by loan id. A junction that
   names a loan the exposure read does not carry is rendered by name with its
   figures absent — never with a number borrowed from somewhere else.
   ============================================================================= */

import type { Covenant, Facility } from "../data/contract";
import { facilityProduct, shortFacilityName } from "../data/facilityStage";
import { covenantUnit } from "../data/finance";

export type AttachmentKind = "loans" | "account" | "unread";

export interface CovenantLoanRow {
  loanId?: string;
  /** The product, out of the org's own loan name ("Line of Credit"). */
  facility: string;
  /** The org's full loan name, for the title attribute. */
  fullName: string;
  committed: number | null;
  outstanding: number | null;
  maturityDate?: string;
  /** TRUE when the junction names a loan the exposure read does not carry. */
  unresolved: boolean;
}

export interface CovenantAttachment {
  kind: AttachmentKind;
  /** The count badge, in words. */
  badge: string;
  /** The sentence the expanded block leads with when there are no loan rows. */
  emptyLine: string | null;
  rows: CovenantLoanRow[];
}

const ACCOUNT_LINE =
  "Not associated to any facility. This covenant sits on the account, which is where Salesforce adds one by default.";
const UNREAD_LINE =
  "This read does not carry the loan junction for this covenant, so which facilities it binds is unknown rather than none.";

const money = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) ? n : null);

/**
 * The loans one covenant is associated to, with each facility's own figures.
 *
 * Pure and total: a covenant with no junction, a junction with no facility
 * behind it and an empty exposure read all resolve rather than throw.
 */
export function covenantAttachment(
  cov: Covenant,
  facilities: readonly Facility[] | undefined,
  relationship?: string | null,
): CovenantAttachment {
  if (!Array.isArray(cov.attachedLoans)) {
    return { kind: "unread", badge: "—", emptyLine: UNREAD_LINE, rows: [] };
  }
  if (cov.attachedLoans.length === 0) {
    return { kind: "account", badge: "Account only", emptyLine: ACCOUNT_LINE, rows: [] };
  }

  const byId = new Map<string, Facility>();
  for (const f of facilities ?? []) if (f.loanId) byId.set(f.loanId, f);

  const rows: CovenantLoanRow[] = cov.attachedLoans.map((a) => {
    const f = a.loanId ? byId.get(a.loanId) : undefined;
    if (!f) {
      return {
        loanId: a.loanId,
        facility: shortFacilityName(a.loanName, relationship) || a.loanName || a.loanId || "Facility",
        fullName: a.loanName ?? a.loanId ?? "Facility",
        committed: null,
        outstanding: null,
        unresolved: true,
      };
    }
    return {
      loanId: f.loanId,
      facility: facilityProduct(f, relationship),
      fullName: f.name ?? f.loanId ?? "Facility",
      committed: money(f.committed),
      outstanding: money(f.outstanding),
      maturityDate: f.maturityDate,
      unresolved: false,
    };
  });

  return {
    kind: "loans",
    badge: `${rows.length} ${rows.length === 1 ? "loan" : "loans"}`,
    emptyLine: null,
    rows,
  };
}

/**
 * WHAT KIND OF TEST this is, from the unit its threshold is stated in.
 *
 * nCino's own covenant family (`Acnpex_Category__c`) is not carried by this
 * read, so this is derived and labelled as the measure rather than claimed as
 * the org's category. A covenant with neither a threshold nor an actual is a
 * milestone: there is no measured test to state a unit for.
 */
export function covenantMeasure(cov: Covenant): string {
  const t = typeof cov.thresholdValue === "number" ? cov.thresholdValue : null;
  const a = typeof cov.actualValue === "number" ? cov.actualValue : null;
  if (t === null && a === null) return "Milestone";
  switch (covenantUnit(cov.covenantType, t ?? a)) {
    case "currency":
      return "Currency";
    case "percent":
      return "Percent";
    default:
      return "Ratio";
  }
}

/** The status on the LATEST compliance row, when the read carries one. This is
 *  the open test PERIOD, distinct from the verdict on the last completed test,
 *  and the two are shown side by side rather than one standing in for the
 *  other. */
export function openTestPeriod(cov: Covenant): string | null {
  const s = typeof cov.latestComplianceStatus === "string" ? cov.latestComplianceStatus.trim() : "";
  return s || null;
}
