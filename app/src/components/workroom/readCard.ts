import type { BorrowerBundle, Covenant, Facility, LegalEntity } from "../../data/contract";
import { facilityProduct, shortFacilityName } from "../../data/facilityStage";
import { fmtDate, fmtMoney, fmtPct } from "../../data/format";
import { isActiveFacility } from "../../data/worklist";
import { classifyCovenant } from "../../domain/covenantStatus";
import type { IconKind } from "./TypeIcon";
import { iconForProduct } from "./TypeIcon";
import type { ReadTopic } from "./ask";

/* =============================================================================
   THE READ CARD — A QUESTION ANSWERED FROM THE PACKAGE.

   "which borrowers have we already in the package?" is a question the bundle
   answers completely: the room was holding all 21 involvements while the parser
   was refusing the sentence. This turns what the room already read into the
   room's own card language — grouped rows, type icons, one figure per row —
   and ends on the follow-up that flows into the op the banker is heading for.

   EVERY ROW IS READ, NEVER DERIVED INTO A NEW FACT. The covenants card states
   the org's own threshold, the org's own measured value and the org's own
   verdict (`classifyCovenant`, the same one the covenants tab renders). The
   structure card states the involvements as the graph read carries them. Where
   a read carries nothing, the card says so in words rather than showing an
   empty frame — the channel-none doctrine, applied to a question.

   IT ANSWERS; IT DOES NOT ACT. Nothing here stages, resolves a record id or
   composes a payload. The follow-up is a SENTENCE: the banker's own next line
   goes through the same parser every other line does.
   ============================================================================= */

export interface ReadRow {
  icon: IconKind;
  label: string;
  /** The figure, right-aligned. Empty where the row has none. */
  value: string;
  detail?: string;
  /** Status lives in the INK (rule: status as typography, never pill soup). */
  tone?: "warn" | "bad";
}

export interface ReadGroup {
  heading: string;
  rows: ReadRow[];
}

export interface ReadCardModel {
  topic: ReadTopic;
  /** The agent's own sentence above the card. */
  lede: string;
  groups: ReadGroup[];
  /** The guided next move, in credit language. Always a question the EXISTING
   *  ops can take an answer to. */
  followUp: string;
}

export interface ReadSource {
  bundle: BorrowerBundle | null;
  accountName: string;
  /** The package the room is anchored on. Null narrows nothing. */
  productPackageId: string | null;
}

/* ------------------------------------------------------------------ helpers */

/** The facilities this room is standing on: active, and scoped to the package
 *  the room is anchored on where it is anchored on one. The SAME scoping the
 *  room's own strip uses, so the card and the strip can never disagree about
 *  which facilities are in the conversation. */
function scoped(src: ReadSource): Facility[] {
  return (src.bundle?.exposure?.facilities ?? [])
    .filter(isActiveFacility)
    .filter((f) => !src.productPackageId || f.productPackageId === src.productPackageId);
}

const nameOf = (f: Facility, relationship: string) => facilityProduct(f, relationship) || "Facility";
const iconOf = (f: Facility, relationship: string) => iconForProduct(nameOf(f, relationship));

/** "$15.0M committed", or nothing where the read carries no figure. */
const money = (n: number | null | undefined) => (typeof n === "number" ? fmtMoney(n) : "");

/* ---------------------------------------------------------------- structure */

/** The role an involvement plays, in the org's own word. The graph read names
 *  it `relationshipType`; `borrowerType` is the fallback the same rows carry
 *  when the relationship type is blank, and "Involved" is the honest last
 *  resort — a role we cannot read is not a borrower by default. */
function roleOf(e: LegalEntity): string {
  return (e.relationshipType ?? "").trim() || (e.borrowerType ?? "").trim() || "Involved";
}

function structureCard(src: ReadSource): ReadCardModel | null {
  const entities = src.bundle?.graph?.legalEntities ?? [];
  if (!entities.length) return null;
  const facilities = scoped(src);
  const byLoan = new Map(facilities.map((f) => [f.loanId ?? "", f]));
  const inScope = entities.filter((e) => !e.loanId || byLoan.has(e.loanId));

  const groups: ReadGroup[] = [];
  const row = (e: LegalEntity): ReadRow => ({
    icon: "package",
    label: e.accountName ?? "Unnamed party",
    value: roleOf(e),
    detail:
      typeof e.ownershipPercent === "number"
        ? `${fmtPct(e.ownershipPercent)} ownership`
        : typeof e.contingentAmount === "number"
          ? `${fmtMoney(e.contingentAmount)} contingent`
          : undefined,
  });

  // ROLE-GROUPED, PER FACILITY. A borrower on one member and a guarantor on
  // another is two different facts about the same name, and a flat list of
  // names loses exactly the thing the question was asking about.
  for (const f of facilities) {
    const rows = inScope.filter((e) => e.loanId === f.loanId).map(row);
    if (rows.length) groups.push({ heading: nameOf(f, src.accountName), rows });
  }
  const relationshipWide = inScope.filter((e) => !e.loanId).map(row);
  if (relationshipWide.length) groups.push({ heading: "Across the relationship", rows: relationshipWide });
  if (!groups.length) return null;

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  return {
    topic: "structure",
    lede: `${total} ${total === 1 ? "party is" : "parties are"} on this package today, by facility.`,
    groups,
    followUp: "Who should be added or taken off, and on which facility?",
  };
}

/* ---------------------------------------------------------------- covenants */

function covenantRow(c: Covenant): ReadRow {
  const verdict = classifyCovenant(c);
  const type = (c.covenantType ?? "").trim() || "Covenant";
  const threshold = typeof c.thresholdValue === "number" ? `${c.thresholdValue}` : "not carried";
  const actual = typeof c.actualValue === "number" ? `, measured ${c.actualValue}` : "";
  const next = c.nextEvaluationDate ? `next test ${fmtDate(c.nextEvaluationDate)}` : "no next test carried";
  return {
    icon: "covenant",
    label: type,
    value: `${verdict.label}`,
    detail: `threshold ${threshold}${actual} · ${next}${c.frequency ? ` · ${c.frequency}` : ""}`,
    tone: verdict.severity === "breach" ? "bad" : verdict.severity === "watch" ? "warn" : undefined,
  };
}

function covenantsCard(src: ReadSource): ReadCardModel | null {
  const covenants = src.bundle?.covenants?.covenants ?? [];
  if (!covenants.length) return null;
  const facilities = scoped(src);
  const loanIds = new Set(facilities.map((f) => f.loanId).filter(Boolean));

  const groups: ReadGroup[] = [];
  let counted = 0;
  for (const f of facilities) {
    // The junction is the authority on what a covenant is attached to. An
    // ABSENT `attachedLoans` is a read that does not carry the field, which is
    // not the same fact as an empty one and must not be grouped as either.
    const rows = covenants
      .filter((c) => (c.attachedLoans ?? []).some((a) => a.loanId && a.loanId === f.loanId))
      .map(covenantRow);
    if (rows.length) {
      counted += rows.length;
      groups.push({ heading: nameOf(f, src.accountName), rows });
    }
  }
  const accountLevel = covenants
    .filter((c) => {
      const attached = c.attachedLoans;
      if (!attached) return true;
      if (!attached.length) return true;
      return !attached.some((a) => a.loanId && loanIds.has(a.loanId));
    })
    .map(covenantRow);
  if (accountLevel.length) {
    counted += accountLevel.length;
    groups.push({ heading: "Across the relationship", rows: accountLevel });
  }
  if (!groups.length) return null;

  return {
    topic: "covenants",
    lede: `${counted} ${counted === 1 ? "covenant test runs" : "covenant tests run"} against this package, with the org's own thresholds and last verdicts.`,
    groups,
    followUp: "Which test should change, and to what threshold? I can also add one to a facility.",
  };
}

/* --------------------------------------------------------------- collateral */

function collateralCard(src: ReadSource): ReadCardModel | null {
  const facilities = scoped(src);
  const groups: ReadGroup[] = [];
  let counted = 0;
  for (const f of facilities) {
    const rows: ReadRow[] = (f.collateral ?? []).map((c) => ({
      icon: "collateral",
      label: c.collateralDescription ?? c.collateralName ?? c.collateralType ?? "Collateral",
      value: money(c.amountPledged),
      detail: [
        c.collateralType,
        typeof c.advanceRate === "number" ? `${c.advanceRate}% advance` : null,
        c.lienPosition ? `lien ${c.lienPosition}` : null,
        c.pledgedStatus,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    if (rows.length) {
      counted += rows.length;
      groups.push({ heading: nameOf(f, src.accountName), rows });
    }
  }
  if (!groups.length) return null;
  return {
    topic: "collateral",
    lede: `${counted} ${counted === 1 ? "pledge is" : "pledges are"} recorded against this package, by facility, at the share each facility holds.`,
    groups,
    followUp: "What should be pledged, and to which facility?",
  };
}

/* -------------------------------------------------------------- facilities */

function facilitiesCard(src: ReadSource): ReadCardModel | null {
  const facilities = scoped(src);
  if (!facilities.length) return null;
  const row = (f: Facility): ReadRow => ({
    icon: iconOf(f, src.accountName),
    label: shortFacilityName(f.name, src.accountName) || nameOf(f, src.accountName),
    value: money(f.committed),
    detail: [
      typeof f.outstanding === "number" ? `${fmtMoney(f.outstanding)} drawn` : null,
      typeof f.interestRate === "number" ? `${f.interestRate}%` : null,
      f.maturityDate ? `matures ${fmtDate(f.maturityDate)}` : null,
      f.riskGrade ? `grade ${f.riskGrade}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
  const booked = facilities.filter((f) => (f.stage ?? "").trim().toLowerCase() === "booked");
  const rest = facilities.filter((f) => !booked.includes(f));
  const groups: ReadGroup[] = [];
  if (booked.length) groups.push({ heading: "Booked, and open to a credit action", rows: booked.map(row) });
  if (rest.length) groups.push({ heading: "Not booked, so not modifiable here", rows: rest.map(row) });
  return {
    topic: "facilities",
    lede: `This package holds ${facilities.length} ${facilities.length === 1 ? "facility" : "facilities"}.`,
    groups,
    followUp: "Which one should change, and what on it?",
  };
}

/* --------------------------------------------------------------------- fees

   NO READ TOOL CARRIES FEE ROWS onto the bundle, so the room cannot say what a
   facility already charges. That is a gap in the read, not an empty package,
   and listing "no fees" would be a claim nothing supports. The card refuses and
   says what CAN be done instead — which is the honest half of the answer.    */

function feesCard(): ReadCardModel | null {
  return null;
}

/** The honest sentence for a topic the room cannot read, keyed by topic. Used
 *  where the builder returns null: the room says WHY, never nothing. */
export function readGap(topic: ReadTopic, relationship: string): string {
  switch (topic) {
    case "fees":
      return (
        "No read on this cockpit carries the fees already on these facilities, so I cannot list them. " +
        "I can still add one: say the fee kind and either a percentage of the commitment or a flat amount."
      );
    case "structure":
      return `The relationship read for ${relationship} carries no parties on these facilities, so there is nothing for me to list. I can still put someone on the deal: name them, the role, and the facility.`;
    case "covenants":
      return `No covenant tests reach this view for ${relationship}. I can add one: name the test, the facility and the threshold.`;
    case "collateral":
      return `No collateral pledges reach this view for ${relationship}. I can pledge something: name the asset and the facility.`;
    default:
      return `No facilities reach this view for ${relationship}, so there is nothing here a credit action can change.`;
  }
}

/**
 * THE CARD FOR A TOPIC, or null when the read carries nothing to show.
 *
 * Null is answered by `readGap` rather than by an empty card. Both are honest;
 * only one of them is useful.
 */
export function buildReadCard(topic: ReadTopic, src: ReadSource): ReadCardModel | null {
  switch (topic) {
    case "structure":
      return structureCard(src);
    case "covenants":
      return covenantsCard(src);
    case "collateral":
      return collateralCard(src);
    case "facilities":
      return facilitiesCard(src);
    case "fees":
      return feesCard();
  }
}
