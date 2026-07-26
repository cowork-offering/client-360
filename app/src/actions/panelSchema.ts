/* =============================================================================
   ACTION PANEL SCHEMA (A33.1.2)

   One modal, three entry points, zero per-action form components. Each action
   declares a `panelSchema` next to its `apexAction` in registry.ts and the
   renderer turns descriptors into inputs.

   Two types with two different jobs (A33.1.3):
     PrefillSource   — where the panel GOT the value.
     ProvenanceKind  — the A26 display contract. NOT extended by A33.
   ============================================================================= */

import type { ProvenanceKind } from "../data/contract";

/** Where a prefilled value came from. Maps onto the unchanged A26 union below. */
export type PrefillSource =
  | "NCINO_RECORD"
  | "CLIENT_REQUEST"
  | "BOOM_FIGURE"
  | "COMPUTED"
  | "AGENT_NARRATIVE"
  | "BANKER";

/**
 * A33.1.3, binding. `BANKER` maps to NO chip: there is no BANKER provenance
 * kind and none is being added. `CLIENT_REQUEST` maps to DERIVED exactly as
 * INBOUND-REQUESTS-DESIGN specifies — the email is the fact, the parsed number
 * is derived from it.
 */
export const PREFILL_PROVENANCE: Record<PrefillSource, ProvenanceKind | null> = {
  NCINO_RECORD: "NCINO",
  CLIENT_REQUEST: "DERIVED",
  BOOM_FIGURE: "BOOM",
  COMPUTED: "DERIVED",
  AGENT_NARRATIVE: "AGENT",
  BANKER: null,
};

export type PanelFieldType =
  | "currency"
  | "date"
  | "picklist"
  | "text"
  | "longtext"
  | "boolean"
  | "readonly";

export interface PanelPrefill {
  source: PrefillSource;
  /** Display contract. Derived from PREFILL_PROVENANCE; carried for clarity. */
  provenance?: ProvenanceKind;
  /** Record id, message id, tool name, or the derivation formula. */
  citation?: string;
}

/** Where a picklist's options come from. A33.1.6: options are READ FROM THE ORG,
 *  never hardcoded in the app. Until loaded, the field renders honestly disabled
 *  rather than offering an invented value set. */
export interface OptionSource {
  object: string;
  field: string;
}

export type PanelFieldTarget = { object: string; field: string } | { staging: true };

export interface PanelField {
  key: string;
  /** Banker language, never an API name. */
  label: string;
  type: PanelFieldType;
  value: unknown;
  prefill: PanelPrefill;
  editable: boolean;
  /** Why not, when false. "set once at creation", "formula field". */
  editableReason?: string;
  required: boolean;
  /** Populated at runtime from the org describe; never authored in the schema. */
  options?: string[];
  optionsFrom?: OptionSource;
  target: PanelFieldTarget;
  /** Short banker-facing note rendered under the field (a caveat, a scale). */
  help?: string;
  /** Set when the value could NOT be sourced. Carries the honest reason, and
   *  when the field anchors the write it also blocks staging: we would rather
   *  say what is missing than send the org an id we know is the wrong type. */
  gap?: { reason: string; blocksStaging: boolean };
}

/** A33.1.7 — editing AGENT prose does NOT change its ProvenanceKind. The honest
 *  record of a human revision is attribution, not a type change. LEDGER ONLY:
 *  nothing is ever injected into the nCino field text. */
export interface NarrativeAttribution {
  provenance: "AGENT";
  editedBy?: string;
  editedAt?: string;
  editedFields?: string[];
}

export interface PanelSchema {
  /** The org object the action writes. API name — for the tool contract and the
   *  confirm summary's machine side. NEVER rendered to the banker (A33.1.2:
   *  labels are banker language, not API names). */
  writeObject: string;
  /** What the banker sees when we name the thing being created. */
  writeObjectLabel: string;
  /** Rendered above the fields, banker language. */
  intro?: string;
  fields: PanelField[];
}

/** Resolve the chip a field should render. `null` means render NO chip. */
export function chipFor(field: PanelField): ProvenanceKind | null {
  return field.prefill.provenance ?? PREFILL_PROVENANCE[field.prefill.source];
}

/** A33.1.4 — a required field that renders empty when a source could have
 *  filled it is an assembly defect, not banker work. This surfaces those so a
 *  test can assert the panel never silently asks a banker to transcribe. */
export function unfilledRequired(schema: PanelSchema): PanelField[] {
  return schema.fields.filter(
    (f) =>
      f.required &&
      f.prefill.source !== "BANKER" &&
      // A field carrying a BLOCKING GAP is not an assembly defect: its
      // emptiness is already explained, already surfaced to the banker, and
      // already stopping the action. Counting it here too would report one
      // missing fact twice, the second time as banker work it is not.
      !f.gap?.blocksStaging &&
      (f.value === null || f.value === undefined || f.value === ""),
  );
}

/** Gaps that stop the action being staged at all. Rendered in the panel and
 *  checked before any tool call, so a knowingly-wrong payload is never sent. */
export function stagingBlockers(schema: PanelSchema): PanelField[] {
  return schema.fields.filter((f) => f.gap?.blocksStaging);
}

/** Fields the banker must type because no source exists. Each must be justified
 *  by the absence of a source in the A33.4 contract table. */
export function bankerEntryFields(schema: PanelSchema): PanelField[] {
  return schema.fields.filter((f) => f.prefill.source === "BANKER");
}
