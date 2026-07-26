import { useState, type ReactNode } from "react";
import type { Briefing } from "../actions/briefing";
import type { PanelField, PanelSchema } from "../actions/panelSchema";

/* =============================================================================
   THE BRIEFING CARD (WP7.1)

   The panel opens on this: the composed proposal, with the values the banker
   owns rendered as inline-editable chips inside the prose. The classic field
   list is still there behind "All fields" as the completeness and audit view.

   SINGLE SOURCE OF TRUTH: a chip edits the same `values` entry the form row
   edits, through the same `onChange`. There is no shadow state here.
   ============================================================================= */

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

function ChipShell({
  children,
  empty,
  title,
}: {
  children: ReactNode;
  empty: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-[7px] px-1.5 py-0.5 align-baseline"
      style={
        empty
          ? { background: "var(--accent-wash)", border: "1px dashed var(--accent)", color: "var(--accent)" }
          : { background: "var(--wash-2)", border: "1px solid var(--border)", color: "var(--ink)" }
      }
    >
      {children}
    </span>
  );
}

/** One inline-editable value, sitting inside the sentence it belongs to. */
function InlineField({
  field,
  value,
  prompt,
  onChange,
}: {
  field: PanelField;
  value: unknown;
  prompt: string;
  onChange: (v: unknown) => void;
}) {
  const empty = isEmpty(value);
  const optionsMissing = field.type === "picklist" && (field.options?.length ?? 0) === 0;
  const bare =
    "min-w-0 border-0 bg-transparent p-0 text-[12.5px] font-semibold leading-tight focus:outline-none";
  const label = `${field.label}${field.required ? " (required)" : ""}`;

  if (!field.editable) {
    return (
      <ChipShell empty={empty} title={field.editableReason}>
        <span className="text-[12.5px] font-semibold">{empty ? "not staged" : String(value)}</span>
      </ChipShell>
    );
  }

  if (field.type === "picklist") {
    return (
      <ChipShell empty={empty} title={optionsMissing ? "Options are read from the org and have not loaded in this view." : field.label}>
        <select
          aria-label={label}
          disabled={optionsMissing}
          className={`${bare} cursor-pointer disabled:cursor-not-allowed`}
          style={{ color: "inherit" }}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{optionsMissing ? "options not loaded" : prompt}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </ChipShell>
    );
  }

  if (field.type === "date") {
    return (
      <ChipShell empty={empty} title={field.label}>
        <input
          type="date"
          aria-label={label}
          className={`${bare} cursor-pointer`}
          style={{ color: "inherit" }}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </ChipShell>
    );
  }

  const text = field.type === "currency" && typeof value === "number" ? String(value) : ((value as string) ?? "");
  return (
    <ChipShell empty={empty} title={field.label}>
      {field.type === "currency" && <span className="text-[12.5px] font-semibold">$</span>}
      <input
        type="text"
        aria-label={label}
        inputMode={field.type === "currency" ? "decimal" : undefined}
        placeholder={prompt}
        size={Math.max(prompt.length, text.length, 6)}
        className={bare}
        style={{ color: "inherit" }}
        value={text}
        onChange={(e) => onChange(field.type === "currency" ? Number(e.target.value) || null : e.target.value)}
      />
    </ChipShell>
  );
}

/** A drafted narrative, read as prose and edited in place. */
function NarrativeBlock({
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
  const [editing, setEditing] = useState(false);
  const text = typeof value === "string" ? value : "";

  return (
    <div className="border-t border-divider px-5 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{field.label}</span>
        {chip}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="c360-press ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted hover:text-ink"
        >
          {editing ? "Done" : text ? "Edit" : "Write"}
        </button>
      </div>
      {editing ? (
        <textarea
          autoFocus
          rows={4}
          aria-label={field.label}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-none rounded-md border px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      ) : text ? (
        <p className="text-[12.5px] leading-relaxed text-ink-body">{text}</p>
      ) : (
        <p className="text-[12px] italic leading-relaxed text-ink-faint">
          Nothing staged for this section. Write it or leave it empty.
        </p>
      )}
    </div>
  );
}

export function BriefingCard({
  briefing,
  schema,
  values,
  editedFields,
  onChange,
  renderChip,
}: {
  briefing: Briefing;
  schema: PanelSchema;
  values: Record<string, unknown>;
  editedFields: string[];
  onChange: (field: PanelField, v: unknown) => void;
  renderChip: (field: PanelField, edited: boolean) => ReactNode;
}) {
  const byKey = new Map(schema.fields.map((f) => [f.key, f]));

  return (
    <div>
      <p className="px-5 py-4 text-[13.5px] leading-[1.75] text-ink-body">
        {briefing.lead.map((seg, i) => {
          if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
          const field = byKey.get(seg.fieldKey);
          if (!field) return null;
          return (
            <span key={i} className="whitespace-nowrap">
              <InlineField field={field} value={values[field.key]} prompt={seg.prompt} onChange={(v) => onChange(field, v)} />
              {renderChip(field, editedFields.includes(field.key))}
            </span>
          );
        })}
      </p>

      {/* A gap that blocks staging is stated here, where the banker is reading,
          not only in the footer. */}
      {schema.fields
        .filter((f) => f.gap)
        .map((f) => (
          <div
            key={f.key}
            className="mx-5 mb-3 rounded-[8px] px-3 py-2 text-[11.5px] leading-relaxed"
            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
          >
            {f.gap!.reason}
          </div>
        ))}

      {briefing.sections
        .map((key) => byKey.get(key))
        .filter((f): f is PanelField => Boolean(f))
        .map((f) => (
          <NarrativeBlock
            key={f.key}
            field={f}
            value={values[f.key]}
            onChange={(v) => onChange(f, v)}
            chip={renderChip(f, editedFields.includes(f.key))}
          />
        ))}
    </div>
  );
}
