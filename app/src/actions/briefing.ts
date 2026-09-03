/* =============================================================================
   THE BRIEFING (WP7.1)

   The panel used to open on a form. It now opens on a composed proposal: two to
   four sentences of banker prose with the staged figures inline, and the values
   the banker still owns rendered as inline-editable chips inside that prose.

   PRESENTATION INVERSION, ZERO CONTRACT CHANGE. The briefing composes over the
   SAME PanelSchema the classic form renders. Field keys here are the schema's
   own keys, so a chip edit and a form edit write the identical `values` entry.
   Provenance, editability, gaps and validation are the schema's, untouched.

   Figures obey the drafting rule: every money, ratio or percent token in the
   lead is registered against a staged path, and `figureViolations` fails the
   build if one is not. The briefing may no more invent a number than a draft.
   ============================================================================= */

import type { BorrowerBundle, ReasonCode } from "../data/contract";
import type { PanelSchema } from "./panelSchema";
import { money, type DraftFigure } from "./drafts";
import { isActiveFacility } from "../data/worklist";
import { bookedFacilities, facilityLabel } from "../data/facilityStage";
import { ALLOW_NON_PENDING_WARNING, packageRecords } from "./schemas";

export type BriefingSegment =
  | { kind: "text"; text: string }
  /** Renders the schema field as an inline-editable chip, in place. */
  | { kind: "field"; fieldKey: string; prompt: string };

export interface BriefingSubject {
  /** What this action is, naming what it acts on. */
  title: string;
  /** The staged context a banker needs before touching anything. */
  context: string;
}

export interface Briefing {
  /** Identity and context for the ticket's subject card. */
  subject: BriefingSubject;
  /** The composed proposal sentences. */
  lead: BriefingSegment[];
  /** Figures rendered in `lead`, each traced to staged data. */
  figures: DraftFigure[];
  /** Field keys rendered under the lead as editable prose blocks. */
  sections: string[];
}

const t = (text: string): BriefingSegment => ({ kind: "text", text });
const f = (fieldKey: string, prompt: string): BriefingSegment => ({ kind: "field", fieldKey, prompt });

/** Why this action is on the queue, in one clause. Same vocabulary as the
 *  drafted recommendation, kept short enough to sit inside a sentence. */
const REASON_CLAUSE: Partial<Record<ReasonCode, string>> = {
  COVENANT_BREACH: "a covenant is at or past its threshold",
  COVENANT_DUE: "a covenant test falls due shortly",
  MATURITY_NEAR: "a facility matures inside the watch window",
  CLIENT_REQUEST: "the client has an open request",
  MODIFICATION_CLUSTER: "the structure has been modified repeatedly",
  GUARANTOR_SIGNAL: "a guarantor signal is on file",
  RECENTLY_MODIFIED: "the structure was modified recently",
};

/** The narrative fields, in the order the review reads. */
const REVIEW_SECTIONS = [
  "relationshipSummary",
  "strengths",
  "weaknesses",
  "recommendation",
  "collateralAnalysis",
  "financialAnalysis",
  "guarantor",
  "riskRatingComments",
  "narrative",
];

function annualReview(schema: PanelSchema, b: BorrowerBundle | null, name: string, reasons: ReasonCode[]): Briefing {
  const figures: DraftFigure[] = [];
  const active = (b?.exposure?.facilities ?? []).filter(isActiveFacility).length;
  const committed = money(b?.exposure?.totalCommitted ?? b?.snapshot?.totalCreditExposure, "borrower.exposure.totalCommitted", figures);
  const driver = reasons.map((r) => REASON_CLAUSE[r]).filter(Boolean)[0];

  const scale = committed
    ? `${name} is carried at ${committed} committed${active ? ` across ${active} active ${active === 1 ? "facility" : "facilities"}` : ""}.`
    : `${name} has no committed exposure staged in this view.`;

  const queue = driver ? ` It is on the queue because ${driver}.` : "";
  const close =
    " The narratives below are drafted from the staged figures and are yours to edit." +
    " The review is created at In Progress; the bank's own Submit for Approval process is what completes it.";

  return {
    subject: { title: `Annual credit review for ${name}`, context: `${scale}${queue}` },
    lead: [
      t("This raises a "),
      f("reviewType", "choose the review type"),
      t(` credit review for ${name}. ${scale}${queue}${close}`),
    ],
    figures,
    sections: REVIEW_SECTIONS.filter((k) => schema.fields.some((x) => x.key === k)),
  };
}

function collateralValuation(schema: PanelSchema, b: BorrowerBundle | null, name: string): Briefing {
  const figures: DraftFigure[] = [];
  const deals = packageRecords(b).length > 1;
  const anchor = schema.fields.find((x) => x.key === "collateral");
  const current = schema.fields.find((x) => x.key === "value");
  const label = typeof anchor?.value === "string" && anchor.value ? anchor.value.toLowerCase() : "pledged collateral";
  const carried = money(
    typeof current?.value === "number" ? current.value : null,
    "borrower.exposure.facilities[].collateral[].currentLendableValue",
    figures,
  );

  return {
    subject: {
      title: `Valuation of ${label}`,
      context: `Pledged by ${name}${carried ? ` and carried today at ${carried}` : ""}. Lendable value is a formula on the collateral record and is not written here.`,
    },
    lead: [
      t(`This values collateral pledged by ${name}${carried ? `, carried today at ${carried}` : ""}. `),
      // Same rule as the covenant ticket: the deal is a chip only when the
      // relationship stages more than one package.
      ...(deals ? [t("It is filed against "), f("package", "choose the deal"), t(". ")] : []),
      t("Choose what to revalue in "),
      f("records", "choose the collateral"),
      t(". The new figure is "),
      f("value", "enter the valuation"),
      t(" as at "),
      f("valuationDate", "pick the valuation date"),
      t(", sourced from "),
      f("source", "choose the source"),
      t(" and recorded as "),
      f("type", "choose the valuation type"),
      t(". It is filed as the primary valuation on the pledge. Lendable value is a formula on the collateral record and is not written here."),
    ],
    figures,
    sections: ["description"],
  };
}

function serviceRequest(b: BorrowerBundle | null, name: string): Briefing {
  const figures: DraftFigure[] = [];
  const req = (b?.requests ?? [])[0];
  const via = req?.reference?.kind ? ` It came in by ${String(req.reference.kind).toLowerCase()}.` : "";

  return {
    subject: {
      title: `Service request for ${name}`,
      context: req?.summary
        ? `The client's own words: "${req.summary}"`
        : "No client request is staged against this relationship, so this one is being raised from scratch.",
    },
    lead: [
      t(req ? `${name} has an open request on file. This logs ` : `This logs `),
      f("subject", "write the subject"),
      t(" as a "),
      f("type", "choose the request type"),
      t(" request received via "),
      f("origin", "choose the origin"),
      t(`, opened at New against the relationship.${via} The tool creates the case and performs no status transitions.`),
    ],
    figures,
    sections: ["description"],
  };
}

function newFacility(b: BorrowerBundle | null, name: string): Briefing {
  const figures: DraftFigure[] = [];
  const hasPackage = Boolean(b?.snapshot?.productPackageId);
  // A new facility JOINS a deal; it is not a floating loan. Say what it joins.
  const memberCount = (b?.exposure?.facilities ?? []).filter(isActiveFacility).length;
  const committed = money(b?.exposure?.totalCommitted, "borrower.exposure.totalCommitted", figures);
  return {
    subject: {
      title: `New facility for ${name}`,
      context: hasPackage
        ? `Filing under this relationship's credit package, joining ${memberCount} existing ${memberCount === 1 ? "facility" : "facilities"}${committed ? ` and ${committed} committed` : ""}. Salesforce names the loan itself on creation, so no name is proposed here, and the Loan Detail record follows about four seconds later.`
        : `No credit package exists yet for this relationship. One will be created first, the way Salesforce's own wizard does, and the facility filed under it. ${name} is added to the facility's borrowing structure as Borrower at 100 percent ownership, which a facility insert does not do on its own. The org names both records itself.`,
    },
    lead: [
      t("This requests a "),
      f("amount", "enter the amount"),
      t(" "),
      f("productType", "choose the product"),
      t(" facility for "),
      f("termMonths", "enter the term"),
      t(" months, for "),
      f("purpose", "choose the purpose"),
      t("."),
    ],
    figures,
    sections: [],
  };
}

function riskRating(b: BorrowerBundle | null, name: string): Briefing {
  const grade = b?.snapshot?.primaryRiskRating;
  return {
    subject: {
      title: `Risk rating review for ${name}`,
      context: grade != null ? `Carried at grade ${grade} today.` : "No risk grade is staged for this relationship.",
    },
    lead: [
      t("Leave the override empty to accept the computed grade, or set "),
      f("overrideValue", "enter the override"),
      t(" and say why. The review is filed In Review; the org's own decision path owns the outcome."),
    ],
    figures: [],
    sections: ["overrideComment"],
  };
}

/**
 * AGGREGATION FIRST. The thing under review is the covenant package of a
 * product package, so the ticket names the deal and asks which of its covenants
 * to assess. A single covenant is a member selection, not a different action.
 */
function covenantReview(b: BorrowerBundle | null): Briefing {
  const figures: DraftFigure[] = [];
  const covenants = b?.covenants?.covenants ?? [];
  const count = covenants.length;
  const nonPending = covenants.filter((c) => c.latestComplianceStatus && c.latestComplianceStatus !== "Pending").length;
  const deals = packageRecords(b).length > 1;
  return {
    subject: {
      title: count ? `Covenant review across ${count} ${count === 1 ? "covenant" : "covenants"}` : "Covenant review",
      context: [
        "Each assessment updates one existing compliance record. No compliance record is created here, and no credit decision is made or implied.",
        nonPending ? `${nonPending} of them sit on a compliance row that is not Pending.` : null,
        // The org's own account of the opt-in, stated wherever the opt-in is
        // offered — which is always. A toggle whose consequence is only
        // readable in the collapsed field list is not an informed choice.
        `${ALLOW_NON_PENDING_WARNING} Left off, such a covenant is refused by name with its reason.`,
      ]
        .filter(Boolean)
        .join(" "),
    },
    // The DEAL is a choice only when the relationship stages more than one
    // package. With exactly one there is nothing to choose, and a chip on a
    // field the banker cannot edit is a promise the ticket cannot keep.
    lead: [
      t("This assesses "),
      f("covenants", "choose the covenants"),
      ...(deals ? [t(" on "), f("package", "choose the deal")] : [t(" on this deal")]),
      t(". Recording onto rows that are not Pending is "),
      f("allowNonPending", "off"),
      t("."),
    ],
    figures,
    sections: ["assessmentNarrative"],
  };
}

function facilityChange(b: BorrowerBundle | null, name: string, kind: "modification" | "renewal"): Briefing {
  const figures: DraftFigure[] = [];
  const drawn = money(b?.exposure?.totalOutstanding, "borrower.exposure.totalOutstanding", figures);
  const held = "The plan is staged and preserved; filing it awaits Salesforce's own approval path.";
  // The facility is a CHOICE only when more than one is booked. With exactly
  // one there is nothing to choose, so the ticket names it instead of asking.
  const booked = bookedFacilities(b);
  const picks = booked.length > 1;
  const only = booked[0] ? facilityLabel(booked[0]) : null;

  if (kind === "renewal") {
    return {
      subject: {
        title: `Renewal for ${name}`,
        context: only && !picks ? `${only} is the booked facility on this relationship. ${held}` : held,
      },
      lead: [
        t("This renews "),
        f("facility", "choose the facilities"),
        t(" to "),
        f("newMaturityDate", "pick the new maturity"),
        t(" at "),
        f("requestedRate", "enter the rate"),
        t(" percent."),
      ],
      figures,
      sections: ["renewalReason"],
    };
  }

  // PACKAGE FIRST. The subject states the DEAL — what it aggregates, what it
  // carries and how much is drawn — because that is what the action runs on.
  // The facilities are member selections inside it.
  const deals = packageRecords(b);
  const members = booked.length;
  const committed = money(b?.exposure?.totalCommitted, "borrower.exposure.totalCommitted", figures);
  const scale = [
    members ? `${members} booked ${members === 1 ? "facility" : "facilities"} can carry it` : null,
    committed ? `${committed} committed` : null,
    drawn ? `${drawn} drawn` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    subject: {
      title: `Modification on ${name}'s deal`,
      context: [
        scale ? `This deal: ${scale}.` : null,
        "One plan covers every facility you select, under a single confirmation and a single decision token.",
        "Each requested change below is applied to each selected facility.",
        held,
      ]
        .filter(Boolean)
        .join(" "),
    },
    lead: [
      t("This modifies "),
      f("facility", "choose the facilities"),
      ...(deals.length > 1 ? [t(" on "), f("package", "choose the deal")] : [t(" on this deal")]),
      t(". Each selected facility moves to "),
      f("newCommitment", "enter the new commitment"),
      t(", maturing "),
      f("requestedMaturityDate", "pick the new maturity"),
      t(", over "),
      f("requestedTermMonths", "enter the term"),
      t(" months at "),
      f("requestedRate", "enter the rate"),
      t(" percent. Any one of the four is enough; the org refuses a plan that asks for none of them."),
    ],
    figures,
    sections: ["modificationReason"],
  };
}

export function buildBriefing(
  actionId: string,
  schema: PanelSchema | null,
  bundle: BorrowerBundle | null,
  accountName: string,
  reasons: ReasonCode[] = [],
): Briefing | null {
  if (!schema) return null;
  if (actionId === "annual-review") return annualReview(schema, bundle, accountName, reasons);
  if (actionId === "collateral-valuation") return collateralValuation(schema, bundle, accountName);
  if (actionId === "create-service-request") return serviceRequest(bundle, accountName);
  if (actionId === "new-facility-request") return newFacility(bundle, accountName);
  if (actionId === "risk-rating-review") return riskRating(bundle, accountName);
  if (actionId === "covenant-review") return covenantReview(bundle);
  if (actionId === "loan-modification") return facilityChange(bundle, accountName, "modification");
  if (actionId === "renewal") return facilityChange(bundle, accountName, "renewal");
  return null;
}

/** All prose in the lead, for the figure walk. */
export function briefingText(briefing: Briefing): string {
  return briefing.lead.map((s) => (s.kind === "text" ? s.text : "")).join("");
}
