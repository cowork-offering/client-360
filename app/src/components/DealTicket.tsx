import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Briefing } from "../actions/briefing";
import {
  buildTicket,
  deltaHeading,
  promptFor,
  ratingFacts,
  reviewFacts,
  ticketDeltas,
  type TicketDelta,
  type TicketFact,
} from "../actions/dealTicket";
import type { PanelField, PanelSchema, PerItemInput } from "../actions/panelSchema";
import type { BorrowerBundle, ReasonCode } from "../data/contract";
import { fmtMoney } from "../data/format";

/* =============================================================================
   THE DEAL TICKET (WP8)

   A piece of work with a hierarchy, not a form and not a paragraph. Same values
   state, same schema, same provenance and gaps as every presentation before it:
   a pill edits the identical `values` entry the classic field row does.
   ============================================================================= */

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/** What the banker reads for a value. On a record chooser the value is an id,
 *  so the label is looked up positionally; everywhere else the value IS the
 *  label. */
const labelForValue = (field: PanelField, value: unknown): string => {
  const i = (field.options ?? []).indexOf(String(value));
  return i >= 0 ? (field.optionLabels?.[i] ?? String(value)) : String(value);
};

const display = (field: PanelField, value: unknown): string => {
  if (isEmpty(value)) return "";
  if (field.optionsAreRecords) return labelForValue(field, value);
  if (field.type === "currency" && typeof value === "number") return fmtMoney(value);
  if (field.type === "boolean") return value === true ? "Yes" : "No";
  return String(value);
};

/* ------------------------------------------------------------------ sheet */

/** A slide-up sheet of option cards. One choice, made in one place. */
function OptionSheet({
  field,
  value,
  onPick,
  onClose,
}: {
  field: PanelField;
  value: unknown;
  onPick: (v: unknown) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const options = field.options ?? [];

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col justify-end" style={{ zIndex: "var(--z-sheet)" }} role="presentation">
      <button
        type="button"
        aria-label={`Close ${field.label}`}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "var(--scrim)" }}
      />
      {/* The sheet is a COLUMN with a bounded height: the header stays put and
          the option list scrolls inside it. Sizing against the panel (not the
          ticket's scrolled content) is what stops long value sets being cut off
          (live defect 2026-07-26 — the 16-value Type list). */}
      <div
        ref={ref}
        role="dialog"
        aria-label={field.label}
        className="c360-sheet-in relative flex max-h-[70%] min-h-0 flex-col rounded-t-[16px] border-t border-border bg-raised px-5 pb-4 pt-3"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="mb-2 flex flex-none items-center gap-2">
          <span className="text-[12.5px] font-bold text-ink">{field.label}</span>
          {field.required && (
            <span className="text-[10px] font-semibold" style={{ color: "var(--critical)" }}>
              required
            </span>
          )}
          {options.length > 0 && (
            <span className="text-[10.5px] text-ink-faint">
              {options.length} {options.length === 1 ? "value" : "values"}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="c360-press ml-auto rounded-md px-2 py-1 text-[11px] font-semibold text-ink-muted hover:text-ink"
          >
            Close
          </button>
        </div>

        {options.length === 0 ? (
          // A33.1.6 — the org's value set is the only legitimate one. Absent, the
          // sheet says so rather than offering something invented.
          <p className="py-3 text-[12px] leading-relaxed text-ink-muted">
            The values for this come from the org and have not loaded in this view. It cannot be set here yet.
          </p>
        ) : (
          <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1 pb-1">
            {/* Rendered but not choosable, each with the org's reason. Hiding
                them would leave a banker hunting for a facility that is right
                there in the exposure tab. */}
            {options.map((o) => {
              const picked = value === o;
              return (
                <li key={o}>
                  <button
                    type="button"
                    aria-pressed={picked}
                    onClick={() => {
                      onPick(o);
                      onClose();
                    }}
                    className="c360-press flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left text-[12.5px] font-medium"
                    style={{
                      borderColor: picked ? "var(--accent)" : "var(--border)",
                      background: picked ? "var(--accent-wash)" : "var(--surface)",
                      color: picked ? "var(--accent)" : "var(--ink)",
                    }}
                  >
                    <span className="flex-1 whitespace-normal break-words">{labelForValue(field, o)}</span>
                    {picked && (
                      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
            {(field.disabledOptions ?? []).map((o) => (
              <li key={`off-${o.value}`}>
                <div
                  aria-disabled="true"
                  data-disabled-option={o.value}
                  className="flex w-full cursor-not-allowed items-center gap-2 rounded-[10px] border border-dashed px-3 py-2.5 text-left text-[12.5px]"
                  style={{ borderColor: "var(--border)", color: "var(--ink-faint)" }}
                >
                  <span className="flex-1 whitespace-normal break-words">{o.value}</span>
                  <span className="flex-none text-[10.5px]">{o.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pills */

function Pill({
  field,
  value,
  prompt,
  chip,
  onOpen,
  onChange,
}: {
  field: PanelField;
  value: unknown;
  prompt: string;
  chip: ReactNode;
  onOpen: () => void;
  onChange: (v: unknown) => void;
}) {
  const empty = isEmpty(value);
  const shell = "flex min-w-0 items-center gap-2 rounded-[10px] border px-3 py-2 text-left";
  const tone = empty
    ? { borderColor: "var(--accent)", background: "var(--accent-wash)", color: "var(--accent)" }
    : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" };

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-faint">{field.label}</span>
        <span className="block truncate text-[12.5px] font-semibold" title={empty ? undefined : display(field, value)}>
          {empty ? prompt : display(field, value)}
        </span>
      </span>
      {chip}
    </>
  );

  // A date is a native picker: routing it through a sheet of options would be
  // inventing a calendar the platform already has.
  if (field.type === "date") {
    return (
      <label className={shell} style={tone}>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-faint">{field.label}</span>
          <input
            type="date"
            aria-label={`${field.label}${field.required ? " (required)" : ""}`}
            value={(value as string) ?? ""}
            disabled={!field.editable}
            onChange={(e) => onChange(e.target.value)}
            className="w-full border-0 bg-transparent p-0 text-[12.5px] font-semibold focus:outline-none"
            style={{ color: "inherit" }}
          />
        </span>
        {chip}
      </label>
    );
  }

  if (field.type === "boolean") {
    return (
      <button type="button" onClick={() => onChange(value !== true)} aria-pressed={value === true} className={`c360-press ${shell}`} style={tone}>
        {body}
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} disabled={!field.editable} className={`c360-press ${shell}`} style={tone}>
      {body}
      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" className="flex-none opacity-60">
        <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------ multiselect */

/**
 * Several records chosen at once, each with its context and, where the action
 * needs one, its own value entry.
 *
 * Rendered inline rather than in a sheet: a multi-select with a context line
 * per row is a list the banker reads, not a menu they dip into.
 */
function MultiSelectRows({
  field,
  selected,
  values,
  onToggle,
  onItemValue,
}: {
  field: PanelField;
  selected: string[];
  /** The whole panel value bag: each per-item input reads its own map out of
   *  it, and a map is absent until the banker fills the first entry. */
  values: Record<string, unknown>;
  onToggle: (id: string) => void;
  onItemValue: (input: PerItemInput, id: string, v: unknown) => void;
}) {
  const options = field.options ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      {options.map((id, i) => {
        const on = selected.includes(id);
        return (
          <div
            key={id}
            className="rounded-[10px] border px-3 py-2.5"
            style={{
              borderColor: on ? "var(--accent)" : "var(--border)",
              background: on ? "var(--accent-wash)" : "var(--surface)",
            }}
          >
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={on}
                aria-label={field.optionLabels?.[i] ?? id}
                onChange={() => onToggle(id)}
                className="mt-0.5 flex-none"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink">{field.optionLabels?.[i] ?? id}</span>
                {field.optionDetails?.[i] && (
                  <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-faint">{field.optionDetails[i]}</span>
                )}
              </span>
            </label>

            {/* Per-item entries appear only for what the banker actually chose. */}
            {on &&
              (field.perItemInputs ?? []).map((input) => {
                const map = (values[input.valueKey] as Record<string, unknown>) ?? {};
                const label = `${input.label} for ${field.optionLabels?.[i] ?? id}`;
                const optionsMissing = input.type === "picklist" && (input.options?.length ?? 0) === 0;
                return (
                  <div key={input.valueKey} className="mt-2 flex items-baseline gap-1.5 pl-[26px]">
                    <span className="flex-none text-[11px] font-semibold text-ink-muted">
                      {input.label}
                      {input.required && <span style={{ color: "var(--critical)" }}> *</span>}
                    </span>
                    {input.type === "currency" && <span className="text-[13px] font-bold text-ink-muted">$</span>}
                    {input.type === "picklist" ? (
                      <select
                        aria-label={label}
                        disabled={optionsMissing}
                        value={(map[id] as string) ?? ""}
                        onChange={(e) => onItemValue(input, id, e.target.value || null)}
                        className="w-full rounded-md border px-2 py-1 text-[12.5px] text-ink disabled:opacity-60"
                        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                      >
                        <option value="">{optionsMissing ? "not loaded from the org" : (input.placeholder ?? "Select…")}</option>
                        {(input.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        inputMode={input.type === "currency" ? "decimal" : undefined}
                        aria-label={label}
                        value={
                          input.type === "currency"
                            ? typeof map[id] === "number"
                              ? String(map[id])
                              : ""
                            : ((map[id] as string) ?? "")
                        }
                        onChange={(e) =>
                          onItemValue(
                            input,
                            id,
                            input.type === "currency" ? (Number(e.target.value) || null) : (e.target.value || null),
                          )
                        }
                        className={`w-full border-0 bg-transparent p-0 ${
                          input.type === "currency"
                            ? "tnum text-[15px] font-extrabold"
                            : "text-[12.5px] font-medium"
                        } text-ink placeholder:text-[12px] placeholder:font-semibold placeholder:text-ink-faint focus:outline-none`}
                        placeholder={input.placeholder}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}

      {(field.disabledOptions ?? []).map((o) => (
        <div
          key={`off-${o.value}`}
          data-disabled-option={o.value}
          aria-disabled="true"
          className="flex items-center gap-2 rounded-[10px] border border-dashed px-3 py-2.5 text-[12.5px]"
          style={{ borderColor: "var(--border)", color: "var(--ink-faint)" }}
        >
          <span className="flex-1 whitespace-normal break-words">{o.value}</span>
          <span className="flex-none text-[10.5px]">{o.reason}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ deal header */

/**
 * THE DEAL, AT THE TOP, ALWAYS.
 *
 * A package-anchored action runs on ONE product package and covers the members
 * selected inside it. Rendering the deal as one pill among the properties put
 * the anchor below the values it governs and left the ticket reading like a
 * single-record form. This states it first: what the deal is, what it
 * aggregates, and — only when the relationship stages more than one — a way to
 * change it.
 */
function DealHeader({
  field,
  value,
  chip,
  onOpen,
}: {
  field: PanelField;
  value: unknown;
  chip: ReactNode;
  onOpen: () => void;
}) {
  const i = (field.options ?? []).indexOf(String(value));
  // A relationship staging no package has nothing to head the ticket with, and
  // the field's own blocking gap already says so above. Two statements of one
  // fact is one too many.
  if (i < 0) return null;
  const label = field.optionLabels?.[i] ?? String(value);
  const detail = field.optionDetails?.[i];

  return (
    <div className="rounded-[12px] border px-4 py-3" style={{ borderColor: "var(--accent)", background: "var(--accent-wash)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="kicker">{field.label}</span>
        {chip}
        {field.editable && (
          <button
            type="button"
            onClick={onOpen}
            className="c360-press ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Change deal
          </button>
        )}
      </div>
      <div className="mt-1 text-[13px] font-bold leading-snug text-ink">{label}</div>
      {/* Member count, committed and drawn — derived from the staged rows, so
          the header states what the deal IS rather than naming it. */}
      {detail && <div className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{detail}</div>}
      {!field.editable && field.editableReason && (
        <div className="mt-0.5 text-[10.5px] text-ink-faint">{field.editableReason}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- narrative */

function NarrativeCard({
  field,
  value,
  onChange,
  chip,
}: {
  field: PanelField;
  value: unknown;
  onChange: (v: unknown) => void;
  chip: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const text = typeof value === "string" ? value : "";

  return (
    <div className="rounded-[10px] border border-border" style={{ background: "var(--surface)" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="c360-press flex w-full items-start gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{field.label}</span>
            {chip}
          </span>
          {/* The collapsed card still SAYS something: a banker should not have to
              open nine cards to find out what was drafted. */}
          <span className={`mt-0.5 block text-[12px] leading-relaxed text-ink-body ${open ? "" : "line-clamp-2"}`}>
            {text || "Nothing staged for this section."}
          </span>
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="c360-twist mt-1 flex-none text-ink-faint"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <path d="M4 2.5l4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <textarea
            rows={5}
            aria-label={field.label}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            className="w-full resize-none rounded-md border px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink"
            style={{ borderColor: "var(--border)", background: "var(--surface-overlay)" }}
          />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- deltas */

function DeltaReadout({ deltas, heading }: { deltas: TicketDelta[]; heading: { title: string; caveat?: string } }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] px-3.5 py-3" style={{ background: "var(--surface-overlay)" }}>
      <div className="kicker">{heading.title}</div>
      {deltas.map((d) => {
        const tone = d.direction === "up" ? "var(--positive)" : d.direction === "down" ? "var(--critical)" : "var(--ink-muted)";
        return (
          <div key={d.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold text-ink-label">{d.label}</span>
            <span className="tnum text-[13px] font-semibold text-ink-muted line-through decoration-1">{d.before}</span>
            <span aria-hidden="true" className="text-[11px] text-ink-faint">
              →
            </span>
            <span className="tnum text-[15px] font-extrabold" style={{ color: tone }}>
              {d.after}
            </span>
            {d.note && <span className="w-full text-[10.5px] text-ink-faint">{d.note}</span>}
          </div>
        );
      })}
      {heading.caveat && (
        <p className="mt-0.5 text-[10.5px] leading-relaxed" style={{ color: "var(--warning)" }}>
          {heading.caveat}
        </p>
      )}
    </div>
  );
}

/** What a review will cover. Facts from staged data, or nothing. */
function FactStrip({ title, facts }: { title: string; facts: TicketFact[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] px-3.5 py-3" style={{ background: "var(--surface-overlay)" }}>
      <div className="kicker">{title}</div>
      {facts.map((f) => (
        <div key={f.label} className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[11px] font-semibold text-ink-label">{f.label}</span>
          <span className="text-[13px] font-bold text-ink">{f.value}</span>
          {f.note && <span className="w-full text-[10.5px] text-ink-faint">{f.note}</span>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ ticket */

export function DealTicket({
  actionId,
  briefing,
  schema,
  bundle,
  values,
  editedFields,
  reasons,
  onChange,
  onValueMap,
  renderChip,
  sheetCloserRef,
  sheetHost,
}: {
  actionId: string;
  briefing: Briefing;
  schema: PanelSchema;
  bundle: BorrowerBundle | null;
  values: Record<string, unknown>;
  editedFields: string[];
  /** Why this action is on the queue; seeds the drafted narratives. */
  reasons: ReasonCode[];
  onChange: (field: PanelField, v: unknown) => void;
  /** Writes a keyed map (per-item values) into the panel's values. */
  onValueMap?: (key: string, map: Record<string, unknown>) => void;
  renderChip: (field: PanelField, edited: boolean) => ReactNode;
  /** Esc must close an open sheet BEFORE the panel (A31.1 stacking). */
  sheetCloserRef: React.MutableRefObject<(() => void) | null>;
  /** The panel element the sheet is anchored to. Anchoring to the ticket's own
   *  box would place the sheet at the bottom of the SCROLLED CONTENT and size it
   *  against that content, which clipped long value sets. */
  sheetHost: HTMLElement | null;
}) {
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));
  const ticket = buildTicket(actionId, schema, briefing);
  const hero = ticket.heroKey ? byKey.get(ticket.heroKey) : undefined;
  const deltas = ticketDeltas(actionId, bundle, values);
  const facts =
    actionId === "annual-review"
      ? reviewFacts(bundle, reasons)
      : actionId === "risk-rating-review"
        ? ratingFacts(bundle, values)
        : [];
  const factTitle = actionId === "annual-review" ? "What this review covers" : "The rating position";
  const blockingGaps = schema.fields.filter((f) => f.gap);

  /** The three shapes a pill key can take, split once so each renders in the
   *  place its meaning belongs: the deal anchors the ticket, the member lists
   *  say what the action covers, and everything else is a property. */
  const owned = ticket.pillKeys.map((key) => byKey.get(key)).filter((f): f is PanelField => Boolean(f));
  // Read off the SCHEMA, not the briefing's reading order: a relationship with
  // one package gives the banker nothing to choose, and the anchor is still the
  // first thing they need to see. The header renders it as context there; the
  // "Change deal" affordance appears only where there is a choice.
  const deal = byKey.get("package");
  const multiSelects = owned.filter((f) => f.type === "multiselect");
  const properties = owned.filter((f) => f !== deal && f.type !== "multiselect");

  useEffect(() => {
    sheetCloserRef.current = sheetKey ? () => setSheetKey(null) : null;
    return () => {
      sheetCloserRef.current = null;
    };
  }, [sheetKey, sheetCloserRef]);

  const sheetField = sheetKey ? byKey.get(sheetKey) : undefined;

  return (
    <div className="relative flex flex-col gap-3 px-5 py-4">
      {/* Subject: what this is, and what it acts on. */}
      <div>
        <h3 className="text-[16px] font-extrabold leading-tight tracking-tight text-ink">{ticket.title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-body">{ticket.context}</p>
      </div>

      {blockingGaps.map((f) => (
        <div
          key={f.key}
          className="rounded-[8px] px-3 py-2 text-[11.5px] leading-relaxed"
          style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
        >
          {f.gap!.reason}
        </div>
      ))}

      {/* The deal first: a package-anchored action's anchor is not a property. */}
      {deal && (
        <DealHeader
          field={deal}
          value={values[deal.key]}
          chip={renderChip(deal, editedFields.includes(deal.key))}
          onOpen={() => setSheetKey(deal.key)}
        />
      )}

      {/* Then the members it acts on. ABOVE the hero deliberately: the banker
          picks what the action covers before the value that carries it, and a
          hero over an unread member list is what made a package-anchored ticket
          read like a single-record form. */}
      {multiSelects.map((f) => (
        <div key={f.key} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="kicker">{f.label}</span>
            {renderChip(f, editedFields.includes(f.key))}
          </div>
          <MultiSelectRows
            field={f}
            selected={Array.isArray(values[f.key]) ? (values[f.key] as string[]) : []}
            values={values}
            onToggle={(id) => {
              const now = Array.isArray(values[f.key]) ? (values[f.key] as string[]) : [];
              onChange(f, now.includes(id) ? now.filter((x) => x !== id) : [...now, id]);
            }}
            onItemValue={(input, id, v) => {
              const map = { ...((values[input.valueKey] as Record<string, unknown>) ?? {}) };
              if (v === null) delete map[id];
              else map[id] = v;
              onValueMap?.(input.valueKey, map);
            }}
          />
        </div>
      ))}

      {/* Hero: the value that carries the decision. */}
      {hero && (
        <div className="rounded-[12px] border border-border px-4 py-3" style={{ background: "var(--surface)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-ink-muted" htmlFor={`hero-${hero.key}`}>
              {hero.label}
              {hero.required && <span style={{ color: "var(--critical)" }}> *</span>}
            </label>
            {renderChip(hero, editedFields.includes(hero.key))}
          </div>

          {hero.type === "picklist" ? (
            <button
              type="button"
              id={`hero-${hero.key}`}
              onClick={() => setSheetKey(hero.key)}
              disabled={!hero.editable}
              className="c360-press mt-1 flex w-full items-center gap-2 text-left"
            >
              <span
                className="flex-1 truncate text-[24px] font-extrabold leading-tight tracking-tight"
                style={{ color: isEmpty(values[hero.key]) ? "var(--ink-faint)" : "var(--ink)" }}
              >
                {isEmpty(values[hero.key]) ? promptFor(briefing, hero.key) : display(hero, values[hero.key])}
              </span>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="flex-none text-ink-faint">
                <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <div className="mt-1 flex items-baseline gap-1.5">
              {hero.type === "currency" && <span className="text-[20px] font-bold text-ink-muted">$</span>}
              <input
                id={`hero-${hero.key}`}
                type="text"
                aria-label={`${hero.label}${hero.required ? " (required)" : ""}`}
                inputMode={hero.type === "currency" ? "decimal" : undefined}
                placeholder={promptFor(briefing, hero.key)}
                disabled={!hero.editable}
                value={
                  hero.type === "currency" && typeof values[hero.key] === "number"
                    ? String(values[hero.key])
                    : ((values[hero.key] as string) ?? "")
                }
                onChange={(e) =>
                  onChange(hero, hero.type === "currency" ? Number(e.target.value) || null : e.target.value)
                }
                className="tnum w-full border-0 bg-transparent p-0 text-[24px] font-extrabold leading-tight tracking-tight text-ink placeholder:text-[15px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-ink-faint focus:outline-none"
              />
            </div>
          )}
          {hero.help && <div className="mt-1 text-[10.5px] leading-relaxed text-ink-faint">{hero.help}</div>}
        </div>
      )}

      {/* Live delta: nothing renders until every input it needs is present. */}
      {deltas.length > 0 && <DeltaReadout deltas={deltas} heading={deltaHeading(actionId)} />}

      {/* The review's equivalent: what it will cover, from staged data only. */}
      {facts.length > 0 && <FactStrip title={factTitle} facts={facts} />}

      {/* Properties. */}
      {properties.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {properties.map((field) => (
            <Pill
              key={field.key}
              field={field}
              value={values[field.key]}
              prompt={promptFor(briefing, field.key)}
              chip={renderChip(field, editedFields.includes(field.key))}
              onOpen={() => setSheetKey(field.key)}
              onChange={(v) => onChange(field, v)}
            />
          ))}
        </div>
      )}

      {/* The drafted prose, collapsed. */}
      {ticket.sections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {ticket.sections.map((key) => {
            const field = byKey.get(key);
            if (!field) return null;
            return (
              <NarrativeCard
                key={key}
                field={field}
                value={values[key]}
                onChange={(v) => onChange(field, v)}
                chip={renderChip(field, editedFields.includes(key))}
              />
            );
          })}
        </div>
      )}

      {sheetField &&
        sheetHost &&
        createPortal(
          <OptionSheet
            field={sheetField}
            value={values[sheetField.key]}
            onPick={(v) => onChange(sheetField, v)}
            onClose={() => setSheetKey(null)}
          />,
          sheetHost,
        )}
    </div>
  );
}
