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

export type BriefingSegment =
  | { kind: "text"; text: string }
  /** Renders the schema field as an inline-editable chip, in place. */
  | { kind: "field"; fieldKey: string; prompt: string };

export interface Briefing {
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
    lead: [
      t("This raises a "),
      f("reviewType", "choose the review type"),
      t(` credit review for ${name}. ${scale}${queue}${close}`),
    ],
    figures,
    sections: REVIEW_SECTIONS.filter((k) => schema.fields.some((x) => x.key === k)),
  };
}

function collateralValuation(schema: PanelSchema, name: string): Briefing {
  const figures: DraftFigure[] = [];
  const anchor = schema.fields.find((x) => x.key === "collateral");
  const current = schema.fields.find((x) => x.key === "value");
  const label = typeof anchor?.value === "string" && anchor.value ? anchor.value.toLowerCase() : "pledged collateral";
  const carried = money(
    typeof current?.value === "number" ? current.value : null,
    "borrower.exposure.facilities[].collateral[].currentLendableValue",
    figures,
  );

  return {
    lead: [
      t(`This values the ${label} pledged by ${name}${carried ? `, carried today at ${carried}` : ""}. The new figure is `),
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

export function buildBriefing(
  actionId: string,
  schema: PanelSchema | null,
  bundle: BorrowerBundle | null,
  accountName: string,
  reasons: ReasonCode[] = [],
): Briefing | null {
  if (!schema) return null;
  if (actionId === "annual-review") return annualReview(schema, bundle, accountName, reasons);
  if (actionId === "collateral-valuation") return collateralValuation(schema, accountName);
  if (actionId === "create-service-request") return serviceRequest(bundle, accountName);
  return null;
}

/** All prose in the lead, for the figure walk. */
export function briefingText(briefing: Briefing): string {
  return briefing.lead.map((s) => (s.kind === "text" ? s.text : "")).join("");
}
