/* =============================================================================
   THE ONBOARDING TICKET

   The onboarding actions get the SAME object as the credit actions: a subject
   card, selection steps, a rationale, a staged-plan preview and the confirm
   ceremony. Not a parallel implementation — this module produces a `PanelSchema`
   and a `Briefing`, which is exactly what `DealTicket` already renders, and a
   `StagedOutput`, which is exactly what `ConfirmGate` already renders.

   WHAT IS DIFFERENT, and it is the only thing: `Customer360Write` does not carry
   these tools yet. So the plan is built HERE, client-side, and labelled a
   preview, and where the org's decision token would be redeemed the banker meets
   the honest ONBOARDING_TOOLS_PENDING gate. Nothing on this path fabricates a
   staging id, a plan hash or a token — those render as `PENDING_DEPLOYMENT`.
   ============================================================================= */

import type { PanelField, PanelSchema } from "./panelSchema";
import type { Briefing, BriefingSegment } from "./briefing";
import type { PlanStep, StagedOutput } from "./stagedPlan";
import {
  ONBOARDING_STAGES,
  STAGE_LABEL,
  TYPE_LABEL,
  RESULT_LABEL,
  documentCounts,
  worstScreening,
  type OnboardingCase,
  type OnboardingStage,
} from "../data/onboarding";
import { PREFILL_PROVENANCE } from "./panelSchema";

/** The only onboarding action ids the ticket knows. */
export const ONBOARDING_ACTION_IDS = ["advance-stage", "record-screening", "attach-document", "attest-clearance"] as const;
export type OnboardingActionId = (typeof ONBOARDING_ACTION_IDS)[number];

export function isOnboardingActionId(id: string): id is OnboardingActionId {
  return (ONBOARDING_ACTION_IDS as readonly string[]).includes(id);
}

/** Where a staging id, plan hash or decision token would be. There is no tool to
 *  mint one, so the cockpit says so rather than inventing a value that looks
 *  like the real thing. */
export const PENDING_DEPLOYMENT = "pending deployment";

/** The screening types this ticket offers, per the founder's spec. Not the full
 *  `ScreeningType` union: KYB is an entity check the intake service runs, and it
 *  is not something a banker files by hand here. */
export const TICKET_SCREENING_TYPES = ["Sanctions", "AdverseMedia", "HighRiskCountry"] as const;

/** Result and provider carry this in the prototype, and the fields are read-only
 *  so nobody can type a real provider's name against a result nobody ran. */
export const SIMULATED_LABEL = "Simulated (demo)";

const f = (x: Omit<PanelField, "prefill"> & { prefill: PanelField["prefill"] }): PanelField => ({
  ...x,
  prefill: { ...x.prefill, provenance: x.prefill.provenance ?? PREFILL_PROVENANCE[x.prefill.source] ?? undefined },
});

const text = (t: string): BriefingSegment => ({ kind: "text", text: t });
const chip = (fieldKey: string, prompt: string): BriefingSegment => ({ kind: "field", fieldKey, prompt });

/* -------------------------------------------------------------- lifecycle */

/**
 * The one stage this case may legally move to, or null.
 *
 * TERMINAL RULE. `Complete` is never a choice. A case reaches Complete by a
 * named human attesting KYC clearance, and no advance-stage gesture — here or in
 * the org — substitutes for that. So a case sitting at Validation has NO next
 * stage on this ticket, and the ticket says why instead of offering a button
 * that would be a lie.
 */
export function legalNextStage(kase: OnboardingCase): OnboardingStage | null {
  const i = ONBOARDING_STAGES.indexOf(kase.stage);
  if (i < 0) return null;
  const next = ONBOARDING_STAGES[i + 1];
  if (!next || next === "Complete") return null;
  return next;
}

export const TERMINAL_STAGE_RULE =
  "Complete is not offered here. A case reaches Complete only when a named human attests KYC clearance, so this ticket can never advance into it.";

/* ------------------------------------------------------- attestation state */

export interface ReadinessItem {
  label: string;
  detail: string;
  ok: boolean;
}

/**
 * What attesting asserts, checked against the case's own data.
 *
 * Every line is derived, never stored: a green line means the staged case says
 * so, and a red line names what it says instead.
 */
export function readinessChecklist(kase: OnboardingCase): ReadinessItem[] {
  const docs = documentCounts(kase);
  const worst = worstScreening(kase);
  const parties = kase.parties ?? [];
  const unconfirmed = parties.filter((p) => !p.confirmed);
  const blocking = kase.blockingItems ?? [];

  return [
    {
      label: "Screening reviewed",
      detail:
        worst === "Clear"
          ? "Every screening on this case reads Clear."
          : `The worst screening result on this case is ${RESULT_LABEL[worst]}.`,
      ok: worst === "Clear",
    },
    {
      label: "Documents verified",
      detail:
        docs.total === 0
          ? "No identity documents are recorded against this case."
          : `${docs.verified} of ${docs.total} identity documents are verified.`,
      ok: docs.total > 0 && docs.pending === 0,
    },
    {
      label: "Ownership resolved",
      detail:
        parties.length === 0
          ? "No parties are recorded against this case."
          : unconfirmed.length === 0
            ? `${parties.length} ${parties.length === 1 ? "party is" : "parties are"} confirmed.`
            : `${unconfirmed.length} of ${parties.length} parties are unconfirmed: ${unconfirmed.map((p) => p.name).join(", ")}.`,
      ok: parties.length > 0 && unconfirmed.length === 0,
    },
    {
      label: "No open blocking items",
      detail:
        blocking.length === 0
          ? "Nothing is holding this case out of its next stage."
          : `${blocking.length} blocking ${blocking.length === 1 ? "item is" : "items are"} open.`,
      ok: blocking.length === 0,
    },
  ];
}

/**
 * Why this case cannot be attested, in banker language, or an empty list.
 *
 * The MISSING CLEARANCE is deliberately not a refusal: recording the clearance
 * is what this ticket is for. What refuses is an open blocking item, because
 * attesting over one asserts something the case's own record contradicts.
 */
export function attestationRefusals(kase: OnboardingCase): string[] {
  return (kase.blockingItems ?? []).map((b) => `${b.title} — ${b.detail}`);
}

export const ATTESTATION_ASSERTS =
  "Attesting asserts three things in your own name: that you reviewed the screening evidence, that the identity documents on file are verified, and that ownership is resolved.";

/* ------------------------------------------------------------------ schema */

const OBJECTS: Record<OnboardingActionId, { object: string; label: string }> = {
  "advance-stage": { object: "LLC_BI__Onboarding__c", label: "onboarding stage change" },
  "record-screening": { object: "KYC_Screening__c", label: "screening record" },
  "attach-document": { object: "FinServ__IdentificationDocument__c", label: "identity document" },
  "attest-clearance": { object: "KYC_Clearance__c", label: "KYC clearance attestation" },
};

/** The document types the baked cases actually use. Read from the case, not
 *  hardcoded: an org that stages a different set gets that set. */
function documentTypes(kase: OnboardingCase): string[] {
  return [...new Set((kase.documents ?? []).map((d) => d.documentType).filter(Boolean))].sort();
}

function issuingCountries(kase: OnboardingCase): string[] {
  return [...new Set((kase.documents ?? []).map((d) => d.issuingCountry).filter((c): c is string => !!c))].sort();
}

function partyNames(kase: OnboardingCase): string[] {
  return (kase.parties ?? []).map((p) => p.name);
}

function caseAnchor(kase: OnboardingCase): PanelField {
  return f({
    key: "case",
    label: "Onboarding case",
    type: "readonly",
    value: `${kase.name} · ${STAGE_LABEL[kase.stage]} · ${TYPE_LABEL[kase.type]}`,
    prefill: { source: "NCINO_RECORD", citation: kase.lookupKey },
    editable: false,
    editableReason: "the case is the subject, not a choice",
    required: false,
    target: { object: "LLC_BI__Onboarding__c", field: "LLC_BI__lookupKey__c" },
  });
}

function rationaleField(label: string, help: string): PanelField {
  return f({
    key: "rationale",
    label,
    type: "longtext",
    value: "",
    prefill: { source: "BANKER" },
    editable: true,
    required: true,
    target: { staging: true },
    help,
  });
}

export function buildOnboardingSchema(actionId: string, kase: OnboardingCase): PanelSchema | null {
  if (!isOnboardingActionId(actionId)) return null;
  const { object, label } = OBJECTS[actionId];

  if (actionId === "advance-stage") {
    const next = legalNextStage(kase);
    return {
      writeObject: object,
      writeObjectLabel: label,
      intro: `Moves ${kase.name} one stage along its onboarding lifecycle. ${TERMINAL_STAGE_RULE}`,
      fields: [
        caseAnchor(kase),
        f({
          key: "nextStage",
          label: "Next stage",
          type: "picklist",
          value: next ?? "",
          prefill: { source: "COMPUTED", citation: "LLC_BI__Stage__c — lifecycle order" },
          editable: next !== null,
          editableReason: next ? undefined : "there is no legal next stage from here",
          required: true,
          options: next ? [next] : [],
          optionLabels: next ? [STAGE_LABEL[next]] : [],
          optionDetails: next ? [`The only stage this case may move to from ${STAGE_LABEL[kase.stage]}.`] : [],
          target: { object, field: "LLC_BI__Stage__c" },
          help: TERMINAL_STAGE_RULE,
          gap: next
            ? undefined
            : {
                reason: `${kase.name} is at ${STAGE_LABEL[kase.stage]}, and the only stage after it is Complete. ${TERMINAL_STAGE_RULE}`,
                blocksStaging: true,
              },
        }),
        rationaleField("Why this case moves on", "Recorded against the stage change, in your own words."),
      ],
    };
  }

  if (actionId === "record-screening") {
    const parties = kase.parties ?? [];
    return {
      writeObject: object,
      writeObjectLabel: label,
      intro:
        "Files an immutable screening row against the parties you choose. In this prototype the result and the provider are simulated, and they say so on the record.",
      fields: [
        caseAnchor(kase),
        f({
          key: "parties",
          label: "Parties to screen",
          type: "multiselect",
          value: [],
          prefill: { source: "NCINO_RECORD", citation: "FinServ__AccountAccountRelation__c" },
          editable: parties.length > 0,
          required: true,
          optionsAreRecords: true,
          options: parties.map((p) => p.partyId),
          optionLabels: parties.map((p) => p.name),
          optionDetails: parties.map((p) =>
            [p.role, p.ownershipPercent === null ? null : `${p.ownershipPercent} percent`, p.confirmed ? "confirmed" : "unconfirmed"]
              .filter(Boolean)
              .join(" · "),
          ),
          target: { object, field: "Party__c" },
          gap: parties.length
            ? undefined
            : { reason: "No parties are staged on this case, so there is nothing to screen.", blocksStaging: true },
        }),
        f({
          key: "screeningType",
          label: "Screening type",
          type: "picklist",
          value: "",
          prefill: { source: "BANKER" },
          editable: true,
          required: true,
          options: [...TICKET_SCREENING_TYPES],
          optionLabels: ["Sanctions", "Adverse media", "High-risk country"],
          target: { object, field: "Screening_Type__c" },
        }),
        f({
          key: "result",
          label: "Result",
          type: "readonly",
          value: SIMULATED_LABEL,
          prefill: { source: "COMPUTED", citation: "prototype — no screening provider is connected" },
          editable: false,
          editableReason: "no provider is connected in this prototype",
          required: false,
          target: { object, field: "Result__c" },
        }),
        f({
          key: "provider",
          label: "Provider",
          type: "readonly",
          value: SIMULATED_LABEL,
          prefill: { source: "COMPUTED", citation: "prototype — no screening provider is connected" },
          editable: false,
          editableReason: "no provider is connected in this prototype",
          required: false,
          target: { object, field: "Provider__c" },
        }),
        rationaleField("Why this screening is being run", "Recorded alongside the screening evidence."),
      ],
    };
  }

  if (actionId === "attach-document") {
    const types = documentTypes(kase);
    const countries = issuingCountries(kase);
    const names = partyNames(kase);
    return {
      writeObject: object,
      writeObjectLabel: label,
      intro:
        "Records an identity document against a party. Verification is a separate, named act: filing the document does not verify it, and nothing here sets VerifiedBy.",
      fields: [
        caseAnchor(kase),
        f({
          key: "documentType",
          label: "Document type",
          type: "picklist",
          value: "",
          prefill: { source: "NCINO_RECORD", citation: "FinServ__IdentificationDocument__c.FinServ__DocumentType__c" },
          editable: types.length > 0,
          required: true,
          options: types,
          target: { object, field: "FinServ__DocumentType__c" },
          gap: types.length
            ? undefined
            : {
                reason: "No document types have been observed on this case, and this view does not invent a value set.",
                blocksStaging: true,
              },
        }),
        f({
          key: "party",
          label: "Party it belongs to",
          type: "picklist",
          value: "",
          prefill: { source: "NCINO_RECORD", citation: "FinServ__AccountAccountRelation__c" },
          editable: names.length > 0,
          required: true,
          options: names,
          target: { object, field: "FinServ__Contact__c" },
          gap: names.length
            ? undefined
            : { reason: "No parties are staged on this case, so there is nobody to attach a document to.", blocksStaging: true },
        }),
        f({
          key: "issuingCountry",
          label: "Issuing country",
          type: "picklist",
          value: "",
          prefill: { source: "NCINO_RECORD", citation: "FinServ__IdentificationDocument__c.FinServ__IssuingAuthority__c" },
          editable: countries.length > 0,
          required: true,
          options: countries,
          target: { object, field: "FinServ__IssuingAuthority__c" },
          gap: countries.length
            ? undefined
            : { reason: "No issuing country has been observed on this case, and this view does not invent one.", blocksStaging: true },
        }),
        f({
          key: "documentNumberMasked",
          label: "Document number (masked)",
          type: "longtext",
          value: "",
          prefill: { source: "BANKER" },
          editable: true,
          required: true,
          target: { object, field: "FinServ__DocumentNumber__c" },
          help: "Masked on entry and stored masked. The full number never enters this cockpit.",
        }),
        rationaleField("Why this document is being filed", "Recorded against the document, in your own words."),
      ],
    };
  }

  // attest-clearance
  return {
    writeObject: object,
    writeObjectLabel: label,
    intro: ATTESTATION_ASSERTS,
    fields: [
      caseAnchor(kase),
      rationaleField(
        "What you are attesting, and on what basis",
        "Recorded verbatim as the basis of the attestation, under your own name.",
      ),
    ],
  };
}

/* ---------------------------------------------------------------- briefing */

export function buildOnboardingBriefing(actionId: string, kase: OnboardingCase, schema: PanelSchema): Briefing | null {
  if (!isOnboardingActionId(actionId)) return null;
  // Typed entry lives in the ticket's prose cards, the same place the credit
  // actions put everything the banker writes rather than chooses.
  const sections = ["documentNumberMasked", "rationale"].filter((k) => schema.fields.some((x) => x.key === k));
  const blocking = (kase.blockingItems ?? []).length;
  const context =
    `${TYPE_LABEL[kase.type]} at ${STAGE_LABEL[kase.stage]}` +
    (blocking ? `, with ${blocking} blocking ${blocking === 1 ? "item" : "items"} open.` : ", with nothing blocking it.");

  if (actionId === "advance-stage") {
    const next = legalNextStage(kase);
    return {
      subject: {
        title: next ? `Advance ${kase.name} to ${STAGE_LABEL[next]}` : `${kase.name} has no next stage`,
        context,
      },
      lead: [
        text(`This moves ${kase.name} from ${STAGE_LABEL[kase.stage]} to `),
        chip("nextStage", "choose the next stage"),
        text(`. ${TERMINAL_STAGE_RULE}`),
      ],
      figures: [],
      sections,
    };
  }

  if (actionId === "record-screening") {
    return {
      subject: { title: `Screening on ${kase.name}`, context },
      lead: [
        text("This files a "),
        chip("screeningType", "choose the screening type"),
        text(" screening against "),
        chip("parties", "choose the parties"),
        text(`. The result and the provider read ${SIMULATED_LABEL} and cannot be edited: no screening provider is connected to this cockpit.`),
      ],
      figures: [],
      sections,
    };
  }

  if (actionId === "attach-document") {
    return {
      subject: { title: `Identity document for ${kase.name}`, context },
      lead: [
        text("This records a "),
        chip("documentType", "choose the document type"),
        text(" for "),
        chip("party", "choose the party"),
        text(", issued by "),
        chip("issuingCountry", "choose the issuing country"),
        text(". Verification is a separate, named act and is not performed here."),
      ],
      figures: [],
      sections,
    };
  }

  return {
    subject: { title: `KYC clearance attestation for ${kase.name}`, context },
    lead: [text(ATTESTATION_ASSERTS)],
    figures: [],
    sections,
  };
}

/* ------------------------------------------------------------ plan preview */

export const PLAN_PREVIEW_BANNER =
  "Plan preview (prototype). Built in this cockpit from the case, not returned by a staging tool. Nothing has been sent and nothing will be written.";

/**
 * The plan this action WOULD file, in the same shape the credit actions render.
 *
 * Step names follow the write-engine's own conventions — a verification that
 * proves the subject is what the plan thinks it is, the write itself, the audit
 * row, then the handoff that notifies. The plan is honest about being local:
 * `stagingId`, `planHash` and `decisionToken` all read PENDING_DEPLOYMENT,
 * because no tool minted them and no invented value belongs here.
 */
export function buildOnboardingPlan(
  actionId: string,
  kase: OnboardingCase,
  values: Record<string, unknown>,
): StagedOutput | null {
  if (!isOnboardingActionId(actionId)) return null;
  const { object } = OBJECTS[actionId];
  const steps: PlanStep[] = [
    {
      id: "verify_case",
      type: "verification",
      label: `Re-read ${kase.name} to confirm it is still at ${STAGE_LABEL[kase.stage]}`,
      verification: "SELECT LLC_BI__Stage__c, LLC_BI__Status__c FROM LLC_BI__Onboarding__c",
    },
  ];
  let summary = "";
  const warnings: string[] = [];

  if (actionId === "advance-stage") {
    const next = legalNextStage(kase);
    summary = next
      ? `Moves ${kase.name} from ${STAGE_LABEL[kase.stage]} to ${STAGE_LABEL[next]} on its onboarding record.`
      : `${kase.name} has no legal next stage, so this plan writes nothing.`;
    steps.push({
      id: "update_stage",
      type: "write",
      label: next ? `Set the stage to ${STAGE_LABEL[next]}` : "No stage to set",
      objectName: object,
      fields: ["LLC_BI__Stage__c"],
      dependsOn: ["verify_case"],
      ...(next ? { transition: { field: "LLC_BI__Stage__c", from: kase.stage, to: next } } : {}),
    });
    warnings.push(TERMINAL_STAGE_RULE);
  } else if (actionId === "record-screening") {
    const picked = Array.isArray(values.parties) ? (values.parties as string[]) : [];
    const names = (kase.parties ?? []).filter((p) => picked.includes(p.partyId)).map((p) => p.name);
    const kind = typeof values.screeningType === "string" ? values.screeningType : "screening";
    summary = `Files a ${kind} screening row for ${names.length ? names.join(", ") : "the selected parties"} on ${kase.name}.`;
    steps.push({
      id: "create_screening",
      type: "write",
      label: `Create the screening ${names.length === 1 ? "row" : `rows (${names.length || picked.length})`}`,
      objectName: object,
      fields: ["Screening_Type__c", "Result__c", "Provider__c", "Screened_On__c"],
      dependsOn: ["verify_case"],
    });
    warnings.push(
      `The result and provider are recorded as ${SIMULATED_LABEL} and stay that way. A simulated row never reads as a screening that was actually run.`,
    );
  } else if (actionId === "attach-document") {
    const type = typeof values.documentType === "string" ? values.documentType : "identity document";
    const party = typeof values.party === "string" ? values.party : "the selected party";
    summary = `Records a ${type} against ${party} on ${kase.name}.`;
    steps.push({
      id: "create_document",
      type: "write",
      label: "Create the identity document",
      objectName: object,
      fields: ["FinServ__DocumentType__c", "FinServ__IssuingAuthority__c", "FinServ__DocumentNumber__c"],
      dependsOn: ["verify_case"],
    });
    warnings.push(
      "Verification is a separate, named act. This plan does not set VerifiedBy or VerifiedOn, so the document lands unverified.",
    );
  } else {
    summary = `Records that a named human attested KYC clearance on ${kase.name}, on the basis you typed.`;
    steps.push({
      id: "create_clearance",
      type: "write",
      label: "Create the clearance attestation under your own identity",
      objectName: object,
      fields: ["Cleared_By__c", "Cleared_On__c", "Basis__c"],
      dependsOn: ["verify_case"],
    });
    warnings.push(
      "The attestation is recorded under your own identity, not the cockpit's. It is the only thing that unlocks Complete, and no agent can substitute for it.",
    );
  }

  steps.push(
    {
      id: "audit_event",
      type: "write",
      label: "Write the audit row for this change",
      objectName: "Onboarding_Audit_Event__c",
      fields: ["Action__c", "Actor__c", "Occurred_On__c"],
      dependsOn: [steps[steps.length - 1].id],
    },
    {
      id: "notify",
      type: "handoff",
      label: "Control passes to the bank's own onboarding notifications",
      dependsOn: ["audit_event"],
    },
  );

  return {
    stagingId: PENDING_DEPLOYMENT,
    planHash: PENDING_DEPLOYMENT,
    decisionToken: null,
    summary,
    steps,
    warnings,
    suggestions: [],
  };
}
