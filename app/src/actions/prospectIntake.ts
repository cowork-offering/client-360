/* =============================================================================
   PROSPECT INTAKE — how a relationship STARTS.

   Every other action in this cockpit acts on something that already exists. This
   one opens the door: a banker who has an inquiry in their inbox, or nothing but
   a name and a conversation, walks a guided flow and files a prospect.

   THREE RULES, and they are the same three the rest of the app lives by.

   1. NOTHING IS INVENTED. The mail path reuses the deterministic reader the
      mail-to-action feature already uses — the same amount grammar, the same
      intent verbs, no model in the loop. A fact the message does not state is
      absent, not guessed.
   2. EXTRACTED IS NOT VERIFIED. Everything lifted from a client email is what
      the prospect CLAIMED. It is marked claimed on the field, in the plan and on
      the review, exactly as the intake-sourced cases already are (§2.8.1).
   3. THE VOCABULARY IS OBSERVED. Industries, jurisdictions, party roles and
      legal forms are read off the staged book, not authored here. When the
      staged file holds none, the field is free text and says so, because a
      suggestion list this cockpit made up is worse than no list.

   The plan this produces is a PREVIEW built client-side, exactly like the
   onboarding ticket's: `Customer360Write` carries no CreateProspect stage tool,
   so the staging id, plan hash and decision token all read `pending deployment`
   and the ceremony stops at the honest gate.
   ============================================================================= */

import type { AccountRow, C360Data } from "../data/contract";
import type { MailHit } from "../channel/cockpitTools";
import { extractAmounts, extractIntent, type RequestIntent } from "./mailIntake";
import { onboardingCases, STAGE_LABEL, TYPE_LABEL, type OnboardingType } from "../data/onboarding";
import type { PlanStep, StagedOutput } from "./stagedPlan";
import { PENDING_DEPLOYMENT } from "./onboardingTicket";
import { OBSERVED_PICKLISTS } from "./observedPicklists";
import type { OnboardingAction } from "./onboardingActions";
import { fmtMoney } from "../data/format";

/* --------------------------------------------------------------- the action */

/** The seam, declared the same way every other onboarding write is. */
export const CREATE_PROSPECT_ACTION: OnboardingAction = {
  id: "create-prospect",
  label: "Open a new onboarding case",
  // Not listed in the actions panel: it opens a case rather than acting on one,
  // so its entry point is the pipeline, not a case workspace.
  category: "Process",
  icon: "facility",
  description:
    "Creates the prospect account and the onboarding case that tracks its KYC, with the intake provenance linked to whichever door it came through.",
  target: "Account + LLC_BI__Onboarding__c",
  note: "This case will appear in KYC & ONBOARDING once Customer360Write ships. Nothing has been added to the pipeline below.",
};

/** A new case opens at the FIRST stage. There is no fast lane, and offering one
 *  would be the same lie as advancing a case without the evidence for it. */
export const OPENING_STAGE = "CustomerEngagement" as const;

/** The four case types a NEW relationship can legitimately open as. `AmendMandate`
 *  and `SmallBusiness` are real LLC_BI__Type__c values, and neither describes a
 *  relationship the bank has never onboarded, so neither is offered here. */
export const PROSPECT_CASE_TYPES: OnboardingType[] = [
  "NewCustomer",
  "NewProduct",
  "KybAndKycOnly",
  "RiskAssessmentOnly",
];

/* ------------------------------------------------------------- the vocabulary
   Read off the staged book. `complete: false` everywhere by construction: the
   book is a sample of an org, never its value set, so every one of these fields
   is a free-text entry with suggestions rather than a closed select. */

const uniqueSorted = (values: Array<string | undefined | null>): string[] =>
  [...new Set(values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()))].sort();

const portfolioRows = (data: C360Data | null | undefined): AccountRow[] =>
  Array.isArray(data?.portfolio?.accounts) ? data!.portfolio!.accounts! : [];

export function observedIndustries(data: C360Data | null | undefined): string[] {
  return uniqueSorted([
    ...portfolioRows(data).map((a) => a.industry),
    ...onboardingCases(data).map((c) => c.industry),
  ]);
}

export function observedCountries(data: C360Data | null | undefined): string[] {
  return uniqueSorted([
    ...onboardingCases(data).map((c) => c.jurisdiction),
    ...onboardingCases(data).flatMap((c) => (c.documents ?? []).map((d) => d.issuingCountry)),
  ]);
}

/** The typed roles the book actually uses on its ownership edges. */
export function observedPartyRoles(data: C360Data | null | undefined): string[] {
  return uniqueSorted(onboardingCases(data).flatMap((c) => (c.parties ?? []).map((p) => p.role)));
}

/** Legal forms, taken from the wrappers the staged names already carry. */
const LEGAL_FORM = /\b(Inc|LLC|L\.L\.C|Ltd|Co|Corp|Corporation|Company|PLC|LP|LLP|SA|NV|BV|GmbH|AG)\b\.?$/i;

export function observedEntityForms(data: C360Data | null | undefined): string[] {
  const names = [...portfolioRows(data).map((a) => a.name), ...onboardingCases(data).map((c) => c.name)];
  return uniqueSorted(names.map((n) => LEGAL_FORM.exec((n ?? "").trim())?.[1]));
}

/** Indicative product lines. The record-type-scoped set the loan picklist was
 *  observed to carry — real values, offered here only as an indication of what
 *  the prospect is asking about, never as a product decision. */
export function indicativeProductLines(): string[] {
  return OBSERVED_PICKLISTS["LLC_BI__Loan__c.LLC_BI__Product__c"]?.values ?? [];
}

export const PRODUCT_LINE_CAVEAT =
  "Indicative only. This records what the prospect is asking about; the product a facility is booked under is decided in credit, not here.";

/* --------------------------------------------------------------- extraction */

/** Draft keys that can be filled from a message, so the wizard can mark exactly
 *  those as claimed rather than tracking it field by field. */
export type ProspectField = "legalName" | "entityForm" | "contact" | "amount" | "intent";

export interface ProspectExtraction {
  legalName?: string;
  entityForm?: string;
  contact?: string;
  amount?: number | null;
  amountLiteral?: string;
  intent?: RequestIntent | null;
  /** Which fields this message actually filled. Empty is a real answer. */
  filled: ProspectField[];
  /** The message, named the way a provenance line names its source. */
  citation: string;
}

/**
 * A legal entity name, only when the text states one.
 *
 * A capitalised run ending in a legal form IS a company name; a capitalised run
 * without one is a sentence opening, a person, or a city. Requiring the wrapper
 * is what keeps "Following our call" out of the legal-name field.
 */
const ENTITY_NAME =
  /\b((?:[A-Z][\w&'’.-]*\s+){0,4}[A-Z][\w&'’.-]*\s+(?:Inc|LLC|L\.L\.C|Ltd|Co|Corp|Corporation|Company|PLC|LP|LLP|SA|NV|BV|GmbH|AG)\.?)/;

export function extractEntityName(text: string): string | undefined {
  const m = ENTITY_NAME.exec(text);
  return m ? m[1].replace(/\s+/g, " ").trim() : undefined;
}

/**
 * Read one inbox hit as the start of a case.
 *
 * DETERMINISTIC, and the same reader the mail-to-action path uses: the amount
 * grammar and the intent verbs are imported, not reimplemented, so a message
 * that proposes a facility increase on a booked relationship and one that opens
 * a prospect are read by identical rules.
 */
export function extractProspect(hit: MailHit): ProspectExtraction {
  const text = `${hit.subject ?? ""} ${hit.preview ?? ""}`.trim();
  const filled: ProspectField[] = [];

  const legalName = extractEntityName(text);
  if (legalName) filled.push("legalName");

  const entityForm = legalName ? (LEGAL_FORM.exec(legalName)?.[1] ?? undefined) : undefined;
  if (entityForm) filled.push("entityForm");

  const contact = hit.from?.trim() || undefined;
  if (contact) filled.push("contact");

  const amounts = extractAmounts(text);
  // The LAST amount is what the client is asking for: "from $2M to $5M" asks
  // for five. One amount is itself the ask.
  const last = amounts.at(-1);
  if (last) filled.push("amount");

  const intent = extractIntent(text);
  if (intent) filled.push("intent");

  return {
    legalName,
    entityForm,
    contact,
    amount: last?.value ?? null,
    amountLiteral: last?.literal,
    intent,
    filled,
    citation: `m365 message${hit.id ? ` ${hit.id}` : ""}${hit.subject ? ` — “${hit.subject}”` : ""}`,
  };
}

/** The mail reader's verbs, as a banker says them. */
export const INTENT_LABEL: Record<RequestIntent, string> = {
  increase: "an increase",
  decrease: "a reduction",
  extend: "an extension",
  renew: "a renewal",
  payoff: "a payoff",
  new_facility: "a new facility",
};

/** The provenance line a prefilled field carries. Named once so the wizard, the
 *  review and the plan cannot describe the same fact three ways. */
export const CLAIMED_PROVENANCE = "prefilled from email, claimed identity";

/** What the banker is told when a message yielded nothing. Not a failure. */
export const NOTHING_EXTRACTED =
  "This message names no entity, amount or request this cockpit can read. It is still the case's origin — fill the rest in yourself.";

/* -------------------------------------------------------------------- draft */

export interface DraftParty {
  id: string;
  name: string;
  role: string;
  ownershipPercent: number | null;
}

export interface ProspectDraft {
  origin: "email" | "manual" | null;
  legalName: string;
  entityForm: string;
  industry: string;
  country: string;
  contact: string;
  parties: DraftParty[];
  caseType: OnboardingType | "";
  productLine: string;
  amount: number | null;
  /** What the message asked for, in the mail reader's verbs. Never mapped onto
   *  a case type: "extend a facility" and `NewProduct` are not the same claim,
   *  and inferring one from the other would put a value on the record that the
   *  client never made. */
  statedIntent: RequestIntent | null;
  rationale: string;
  /** Field keys taken from a message rather than typed. Drives the claimed mark. */
  claimed: ProspectField[];
  /** The message this case came from, when it came from one. */
  source?: { id?: string; subject?: string; from?: string; receivedAt?: string; webLink?: string };
}

export function emptyDraft(): ProspectDraft {
  return {
    origin: null,
    legalName: "",
    entityForm: "",
    industry: "",
    country: "",
    contact: "",
    parties: [],
    caseType: "",
    productLine: "",
    amount: null,
    statedIntent: null,
    rationale: "",
    claimed: [],
  };
}

/** Fold an extraction onto a draft. Only fields the message actually filled are
 *  touched, and each one is recorded as claimed. */
export function applyExtraction(draft: ProspectDraft, hit: MailHit, x: ProspectExtraction): ProspectDraft {
  return {
    ...draft,
    origin: "email",
    legalName: x.legalName ?? draft.legalName,
    entityForm: x.entityForm ?? draft.entityForm,
    contact: x.contact ?? draft.contact,
    amount: x.amount ?? draft.amount,
    statedIntent: x.intent ?? draft.statedIntent,
    claimed: x.filled,
    source: { id: hit.id, subject: hit.subject, from: hit.from, receivedAt: hit.receivedAt, webLink: hit.webLink },
  };
}

/* ---------------------------------------------------------------- ownership */

export interface OwnershipReadout {
  total: number;
  /** True when the stated percentages do not resolve to a whole entity. */
  off: boolean;
  line: string;
}

/**
 * What the stated ownership adds up to.
 *
 * IT DOES NOT BLOCK, deliberately. A prospect who has not yet disclosed a minor
 * shareholder is the normal case at intake, and refusing to open a file until
 * the arithmetic closes would push the banker to type a number that makes the
 * sum work. Resolving ownership is a due-diligence job with its own evidence,
 * and the readout says so.
 */
export function ownershipReadout(parties: DraftParty[]): OwnershipReadout {
  const stated = parties.filter((p) => typeof p.ownershipPercent === "number");
  const total = stated.reduce((sum, p) => sum + (p.ownershipPercent ?? 0), 0);
  const rounded = Math.round(total * 10) / 10;
  if (!stated.length) {
    return { total: 0, off: false, line: "No ownership percentages stated yet." };
  }
  if (rounded === 100) {
    return { total: rounded, off: false, line: "Stated ownership totals 100%." };
  }
  return {
    total: rounded,
    off: true,
    line:
      rounded < 100
        ? `Stated ownership totals ${rounded}%, leaving ${Math.round((100 - rounded) * 10) / 10}% unaccounted for. That is normal at intake and does not block the case — resolving it is a due-diligence job.`
        : `Stated ownership totals ${rounded}%, which is more than the whole entity. That does not block the case — reconciling it is a due-diligence job.`,
  };
}

/* ------------------------------------------------------------- completeness */

/** What each step still needs, in banker language. Empty means the step is done. */
export function stepGaps(draft: ProspectDraft, step: "origin" | "entity" | "parties" | "intent"): string[] {
  if (step === "origin") return draft.origin ? [] : ["Choose where this case is coming from."];
  if (step === "entity") {
    const gaps: string[] = [];
    if (!draft.legalName.trim()) gaps.push("the legal name");
    if (!draft.country.trim()) gaps.push("the country");
    return gaps.length ? [`Still needed: ${gaps.join(" and ")}.`] : [];
  }
  // Parties are genuinely optional at intake: a prospect who has not yet named
  // its owners is a case waiting on due diligence, not an invalid case.
  if (step === "parties") return [];
  return draft.caseType ? [] : ["Choose the case type."];
}

/* ------------------------------------------------------------------ plan */

export const PROSPECT_PLAN_STEPS = [
  "verify_no_duplicate",
  "create_account",
  "create_onboarding_case",
  "link_intake_provenance",
  "audit_event",
] as const;

/**
 * The plan a filing WOULD run, in the write engine's own step conventions.
 *
 * It opens on a verification for the same reason every other plan does: the
 * write must prove the world is what the plan thinks it is before it changes it,
 * and here that means proving this prospect is not already in the book under a
 * name somebody typed slightly differently.
 *
 * Nothing here is minted. `stagingId`, `planHash` and `decisionToken` read
 * PENDING_DEPLOYMENT because no tool produced them.
 */
export function buildProspectPlan(draft: ProspectDraft): StagedOutput {
  const name = draft.legalName.trim() || "the prospect";
  const typeLabel = draft.caseType ? TYPE_LABEL[draft.caseType] : "an onboarding case";
  const fromEmail = draft.origin === "email";

  const steps: PlanStep[] = [
    {
      id: "verify_no_duplicate",
      type: "verification",
      label: `Check the book for an existing ${name}`,
      verification: "SELECT Id, Name FROM Account WHERE Name LIKE :legalName",
    },
    {
      id: "create_account",
      type: "write",
      label: `Create the prospect account for ${name}`,
      objectName: "Account",
      fields: ["Name", "Industry", "BillingCountry"],
      dependsOn: ["verify_no_duplicate"],
    },
    {
      id: "create_onboarding_case",
      type: "write",
      label: `Open ${typeLabel} at ${STAGE_LABEL[OPENING_STAGE]}`,
      objectName: "LLC_BI__Onboarding__c",
      fields: ["LLC_BI__Account__c", "LLC_BI__Type__c", "LLC_BI__Stage__c", "LLC_BI__lookupKey__c"],
      // No `transition`: a transition names a move between two states, and this
      // record has no prior state. It is created at the opening stage.
      dependsOn: ["create_account"],
    },
    {
      id: "link_intake_provenance",
      type: "write",
      label: fromEmail
        ? "Link the client message the case came from, as a claim"
        : "Record that the desk opened this case",
      objectName: "LLC_BI__Onboarding__c",
      fields: ["Intake_Source__c", "Intake_Reference__c", "Intake_Received_On__c"],
      dependsOn: ["create_onboarding_case"],
    },
    {
      id: "audit_event",
      type: "write",
      label: "Write the audit row for the case being opened",
      objectName: "Onboarding_Audit_Event__c",
      fields: ["Action__c", "Actor__c", "Occurred_On__c"],
      dependsOn: ["link_intake_provenance"],
    },
  ];

  const warnings: string[] = [
    `The case opens at ${STAGE_LABEL[OPENING_STAGE]} and nowhere further. Stage is earned by evidence, and this plan files none.`,
  ];
  if (fromEmail) {
    warnings.push(
      "Everything read out of the client message is what the prospect CLAIMED. Nothing here is verified, and the case records it as a claim so a later reader cannot mistake it for a check that was run.",
    );
  }
  if (draft.parties.length) {
    warnings.push(
      `The ${draft.parties.length} ${draft.parties.length === 1 ? "party" : "parties"} you listed are carried as intake detail. Ownership edges are confirmed against evidence during due diligence; this plan creates none.`,
    );
  }
  const ownership = ownershipReadout(draft.parties);
  if (ownership.off) warnings.push(ownership.line);
  if (draft.productLine) warnings.push(PRODUCT_LINE_CAVEAT);

  const ask = draft.amount !== null ? ` The stated ask is ${fmtMoney(draft.amount)}, as written by the client.` : "";

  return {
    stagingId: PENDING_DEPLOYMENT,
    planHash: PENDING_DEPLOYMENT,
    decisionToken: null,
    summary: `Creates ${name} as a prospect account and opens ${typeLabel} against it at ${STAGE_LABEL[OPENING_STAGE]}, with the intake provenance linked.${ask}`,
    steps,
    warnings,
    suggestions: [],
  };
}
