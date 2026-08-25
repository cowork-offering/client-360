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
  /** Several records chosen at once. Value is an array of ids. */
  | "multiselect"
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

/**
 * One input the banker fills IN PER SELECTED RECORD of a multiselect.
 *
 * The value lives in the panel's values under `valueKey`, as a map of option id
 * to entry. Several are supported because a bulk covenant review needs a
 * verdict, a figure, a reason and a note against EACH covenant, while a bulk
 * valuation needs one figure against each collateral. One mechanism, so the
 * two batches cannot drift apart.
 *
 * `options` is set directly ONLY where the legal set is the TOOL's contract
 * rather than an org value set (the three complete statuses a covenant
 * assessment may be written to). Where the set belongs to the org, it is read
 * from the org exactly as A33.1.6 requires and `optionsFrom` names it.
 */
export interface PerItemInput {
  valueKey: string;
  label: string;
  type: "currency" | "text" | "picklist";
  options?: string[];
  optionsFrom?: OptionSource;
  placeholder?: string;
  /** Every SELECTED record must carry this before the batch can be staged. */
  required?: boolean;
}

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
  /** A context line under each option, positionally: what the record is, what
   *  it secures, what it is worth. A chooser without it is a list of names. */
  optionDetails?: string[];
  /** One short status word per option, positionally, rendered as a chip beside
   *  the name rather than buried at the end of the context line. */
  optionChips?: string[];
  /** The MONEY figure each option carries today, positionally. Present on a
   *  record chooser whose members have a commitment, so a from -> to reading and
   *  the no-movement rule both read one source rather than each deriving its
   *  own. Null where the read does not stage the figure — never a zero. */
  optionAmounts?: Array<number | null>;
  /** Inputs the banker fills in per SELECTED record of this multiselect. */
  perItemInputs?: PerItemInput[];
  /** Display labels for `options`, positionally. Present only on a RECORD
   *  chooser, where the value is an id and the label is for the banker: two
   *  facilities can share a name, and an option keyed on the name would let the
   *  payload resolve to whichever happened to be first. */
  optionLabels?: string[];
  /**
   * TRUE when the options are STAGED RECORDS rather than an org picklist's
   * value set — a facility chooser, not a `LLC_BI__Status__c`.
   *
   * A33.1.6 governs picklist VALUE SETS: they come from the org describe and
   * are never authored here. A record chooser is a different thing entirely,
   * built from the same staged rows the exposure tab renders, so it declares no
   * `optionsFrom` and the guard skips it. The distinction is marked rather than
   * inferred, so the guard stays strict for everything that IS a picklist.
   */
  optionsAreRecords?: true;
  /** Values that EXIST but cannot be chosen, each with the reason. Listed rather
   *  than hidden: a banker looking for their facility should find out why it is
   *  not selectable, not be left wondering whether the cockpit lost it. */
  disabledOptions?: Array<{ value: string; reason: string }>;
  optionsFrom?: OptionSource;
  target: PanelFieldTarget;
  /** Short banker-facing note rendered under the field (a caveat, a scale). */
  help?: string;
  /** Set when the value could NOT be sourced. Carries the honest reason, and
   *  when the field anchors the write it also blocks staging: we would rather
   *  say what is missing than send the org an id we know is the wrong type. */
  gap?: {
    /** BANKER LANGUAGE. This is what renders. No contract path, no tool name,
     *  no wire field: a banker acts on this sentence and cannot act on a path. */
    reason: string;
    blocksStaging: boolean;
    /** The technical account of the same fact — paths, wire fields, tool names.
     *  Rendered only behind an explicit info affordance, never inline. */
    technical?: string;
  };
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

/**
 * Selected records of a multiselect that are still missing a REQUIRED per-item
 * entry, keyed by the input.
 *
 * A batch is staged as one plan under one confirmation, so a row the banker
 * selected but never answered would be filed as an assessment they did not
 * make. This is what stops that, before any payload is built.
 */
export function unansweredItems(
  field: PanelField,
  values: Record<string, unknown>,
): Array<{ input: PerItemInput; optionIds: string[] }> {
  const selected = Array.isArray(values[field.key]) ? (values[field.key] as string[]) : [];
  const out: Array<{ input: PerItemInput; optionIds: string[] }> = [];
  for (const input of field.perItemInputs ?? []) {
    if (!input.required) continue;
    const map = (values[input.valueKey] as Record<string, unknown>) ?? {};
    const missing = selected.filter((id) => {
      const v = map[id];
      return v === null || v === undefined || v === "";
    });
    if (missing.length) out.push({ input, optionIds: missing });
  }
  return out;
}

/** Fields the banker must type because no source exists. Each must be justified
 *  by the absence of a source in the A33.4 contract table. */
export function bankerEntryFields(schema: PanelSchema): PanelField[] {
  return schema.fields.filter((f) => f.prefill.source === "BANKER");
}
