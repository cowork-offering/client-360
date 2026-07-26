import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Briefing } from "../actions/briefing";
import { buildTicket, promptFor, ticketDeltas, type TicketDelta } from "../actions/dealTicket";
import type { PanelField, PanelSchema } from "../actions/panelSchema";
import type { BorrowerBundle } from "../data/contract";
import { fmtMoney } from "../data/format";

/* =============================================================================
   THE DEAL TICKET (WP8)

   A piece of work with a hierarchy, not a form and not a paragraph. Same values
   state, same schema, same provenance and gaps as every presentation before it:
   a pill edits the identical `values` entry the classic field row does.
   ============================================================================= */

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

const display = (field: PanelField, value: unknown): string => {
  if (isEmpty(value)) return "";
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
      <div
        ref={ref}
        role="dialog"
        aria-label={field.label}
        className="c360-sheet-in relative max-h-[70%] overflow-auto rounded-t-[16px] border-t border-border bg-raised px-5 pb-4 pt-3"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12.5px] font-bold text-ink">{field.label}</span>
          {field.required && (
            <span className="text-[10px] font-semibold" style={{ color: "var(--critical)" }}>
              required
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
          <ul className="flex flex-col gap-1.5">
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
                    <span className="flex-1">{o}</span>
                    {picked && (
                      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
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
        <span className="block truncate text-[12.5px] font-semibold">{empty ? prompt : display(field, value)}</span>
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

function DeltaReadout({ deltas }: { deltas: TicketDelta[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] px-3.5 py-3" style={{ background: "var(--surface-overlay)" }}>
      <div className="kicker">What this changes</div>
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
  onChange,
  renderChip,
  sheetCloserRef,
}: {
  actionId: string;
  briefing: Briefing;
  schema: PanelSchema;
  bundle: BorrowerBundle | null;
  values: Record<string, unknown>;
  editedFields: string[];
  onChange: (field: PanelField, v: unknown) => void;
  renderChip: (field: PanelField, edited: boolean) => ReactNode;
  /** Esc must close an open sheet BEFORE the panel (A31.1 stacking). */
  sheetCloserRef: React.MutableRefObject<(() => void) | null>;
}) {
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));
  const ticket = buildTicket(actionId, schema, briefing);
  const hero = ticket.heroKey ? byKey.get(ticket.heroKey) : undefined;
  const deltas = ticketDeltas(actionId, bundle, values);
  const blockingGaps = schema.fields.filter((f) => f.gap);

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
                {isEmpty(values[hero.key]) ? promptFor(briefing, hero.key) : String(values[hero.key])}
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
      {deltas.length > 0 && <DeltaReadout deltas={deltas} />}

      {/* Properties. */}
      {ticket.pillKeys.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {ticket.pillKeys.map((key) => {
            const field = byKey.get(key);
            if (!field) return null;
            return (
              <Pill
                key={key}
                field={field}
                value={values[key]}
                prompt={promptFor(briefing, key)}
                chip={renderChip(field, editedFields.includes(key))}
                onOpen={() => setSheetKey(key)}
                onChange={(v) => onChange(field, v)}
              />
            );
          })}
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

      {sheetField && (
        <OptionSheet
          field={sheetField}
          value={values[sheetField.key]}
          onPick={(v) => onChange(sheetField, v)}
          onClose={() => setSheetKey(null)}
        />
      )}
    </div>
  );
}
