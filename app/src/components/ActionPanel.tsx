import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/appState";
import { Portal } from "./Portal";
import { ACTIONS_BY_ID } from "../actions/registry";
import { buildPanelSchema } from "../actions/schemas";
import { chipFor, unfilledRequired, type NarrativeAttribution, type PanelField } from "../actions/panelSchema";
import { computeSuggestions, type NamedGap, type Suggestion } from "../actions/suggestionEngine";
import type { ProvenanceKind } from "../data/contract";
import { fmtMoney } from "../data/format";
import { ConfirmGate } from "./ConfirmGate";
import { StepTracker } from "./StepTracker";
import { isSimulationAllowed, simulateStagedOutput, type StagedOutput } from "../actions/stagedPlan";
import { initTracker, type TrackerState } from "../actions/tracker";
import type { DecisionToken } from "../actions/decisionToken";

/* =============================================================================
   THE ACTION PANEL (A33.1.1)

   ONE modal, THREE entry points (Client Actions row, activity next-step, chat
   chip). All three open the same modal for a given action id with the same
   schema and the same prefill. There is no per-action form component: the
   schema drives the render.

   Modal chrome follows A31.1 — portalled above the sticky nav, focus-trapped,
   Esc to close, focus returned to the opener.
   ============================================================================= */

/** A26 chip styling, reusing the established status tokens. */
const CHIP_STYLE: Record<ProvenanceKind, { bg: string; fg: string; label: string }> = {
  NCINO: { bg: "var(--accent-wash)", fg: "var(--accent)", label: "nCino" },
  BOOM: { bg: "var(--positive-bg)", fg: "var(--positive)", label: "Boom" },
  AGENT: { bg: "var(--user-tone-wash)", fg: "var(--user-tone)", label: "Agent" },
  DERIVED: { bg: "var(--wash-2)", fg: "var(--ink-body)", label: "Derived" },
  PENDING: { bg: "var(--warning-bg)", fg: "var(--warning)", label: "Pending" },
  GAP: { bg: "var(--neutral-bg)", fg: "var(--ink-muted)", label: "Not in source" },
};

function ProvenanceChip({ kind, citation, edited }: { kind: ProvenanceKind; citation?: string; edited?: boolean }) {
  const s = CHIP_STYLE[kind];
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
        style={{ background: s.bg, color: s.fg }}
        title={citation ? `Source: ${citation}` : undefined}
      >
        {s.label}
      </span>
      {/* A33.1.7 — the marker is PANEL ONLY. Nothing is injected into the org
          field text; the audit answer lives in the ledger. */}
      {edited && <span className="text-[9.5px] font-semibold text-ink-faint">edited by you</span>}
    </span>
  );
}

function FieldRow({
  field,
  value,
  edited,
  onChange,
}: {
  field: PanelField;
  value: unknown;
  edited: boolean;
  onChange: (v: unknown) => void;
}) {
  const chip = chipFor(field);
  const disabled = !field.editable;
  // A33.1.6 — a picklist whose options the org has not supplied is disabled and
  // says so. We never invent a value set.
  const optionsMissing = field.type === "picklist" && (field.options?.length ?? 0) === 0;

  const common = "w-full rounded-md border px-2.5 py-1.5 text-[12.5px] text-ink disabled:opacity-60";
  const border = { borderColor: "var(--border)", background: disabled ? "var(--wash-2)" : "var(--surface)" };

  return (
    <div className="border-b border-divider px-5 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <label className="text-[11.5px] font-semibold text-ink" htmlFor={`f-${field.key}`}>
          {field.label}
          {field.required && <span style={{ color: "var(--critical)" }}> *</span>}
        </label>
        {chip && <ProvenanceChip kind={chip} citation={field.prefill.citation} edited={edited} />}
        {!field.editable && field.editableReason && (
          <span className="text-[10px] text-ink-faint">{field.editableReason}</span>
        )}
      </div>

      {field.type === "readonly" ? (
        <div className="text-[13px] font-medium text-ink-body">
          {value === null || value === undefined || value === "" ? "—" : String(value)}
        </div>
      ) : field.type === "boolean" ? (
        <label className="flex items-center gap-2 text-[12.5px] text-ink-body">
          <input
            id={`f-${field.key}`}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          Yes
        </label>
      ) : field.type === "picklist" ? (
        <>
          <select
            id={`f-${field.key}`}
            className={common}
            style={border}
            disabled={disabled || optionsMissing}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {optionsMissing && (
            <div className="mt-1 text-[10.5px] text-ink-faint">
              Options are read from the org and have not loaded in this view.
            </div>
          )}
        </>
      ) : field.type === "longtext" ? (
        <textarea
          id={`f-${field.key}`}
          rows={3}
          className={`${common} resize-none`}
          style={border}
          disabled={disabled}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={`f-${field.key}`}
          type={field.type === "date" ? "date" : "text"}
          inputMode={field.type === "currency" ? "decimal" : undefined}
          className={common}
          style={border}
          disabled={disabled}
          value={
            field.type === "currency" && typeof value === "number" ? String(value) : ((value as string) ?? "")
          }
          onChange={(e) => onChange(field.type === "currency" ? Number(e.target.value) || null : e.target.value)}
        />
      )}

      {field.help && <div className="mt-1 text-[10.5px] leading-relaxed text-ink-faint">{field.help}</div>}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onOverride,
}: {
  suggestion: Suggestion;
  onOverride: (reason: string) => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-[10px] border border-border px-3.5 py-3" style={{ background: "var(--surface-overlay)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-ink">{suggestion.trigger.figure}</span>
        <ProvenanceChip kind={suggestion.source} citation={suggestion.trigger.formula} />
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-body">{suggestion.rationale}</p>
      <div className="mt-1.5 text-[10px] text-ink-faint">
        Policy {suggestion.policyVersion} · computed from data as of {suggestion.asOf || "unknown"}
      </div>

      {/* A33.2.3 — declining requires a reason, which lands in Activity and the
          decision ledger. It is not panel decoration. */}
      {declining ? (
        <div className="mt-2">
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you declining this suggestion?"
            className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-ink"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={() => onOverride(reason.trim())}
              className="c360-press rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-ink disabled:opacity-40"
            >
              Record and decline
            </button>
            <button
              type="button"
              onClick={() => setDeclining(false)}
              className="c360-press rounded-md px-2.5 py-1 text-[11px] font-medium text-ink-muted"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDeclining(true)}
          className="c360-press mt-2 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:text-ink"
        >
          Decline with reason
        </button>
      )}
    </div>
  );
}

/** A33.2.6 — a named gap. Never rendered as an all-clear. */
function GapNote({ gap }: { gap: NamedGap }) {
  return (
    <div className="rounded-[8px] border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
      <span className="font-semibold">{gap.input}</span> could not be used: {gap.detail}.{" "}
      <span className="text-ink-faint">
        {gap.path} · {gap.sourceSystem}
      </span>
    </div>
  );
}

export function ActionPanel({
  actionId,
  onClose,
  returnFocusTo,
}: {
  actionId: string;
  onClose: () => void;
  returnFocusTo?: () => HTMLElement | null;
}) {
  const { data, state } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);

  const action = ACTIONS_BY_ID[actionId];
  const accountId = state.accountId ?? "";
  const accountName =
    data.portfolio.accounts.find((a) => a.accountId === accountId)?.name ?? data.borrower?.snapshot?.name ?? "this relationship";
  const bundle = (data.borrowers ?? {})[accountId] ?? (data.borrower?.snapshot?.accountId === accountId ? data.borrower : null);

  const schema = useMemo(
    () => buildPanelSchema(actionId, { bundle, accountId, accountName }),
    [actionId, bundle, accountId, accountName],
  );

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries((schema?.fields ?? []).map((f) => [f.key, f.value])),
  );
  const [editedFields, setEditedFields] = useState<string[]>([]);
  const [declined, setDeclined] = useState<Record<string, string>>({});
  /** form -> confirm -> tracker. */
  const [phase, setPhase] = useState<"form" | "confirm" | "tracker">("form");
  const [plan, setPlan] = useState<StagedOutput | null>(null);
  const [tracker, setTracker] = useState<TrackerState | null>(null);
  const [token, setToken] = useState<DecisionToken | null>(null);

  const engine = useMemo(
    () => computeSuggestions({ data, bundle, actionId }),
    [data, bundle, actionId],
  );

  // A31.1 modal chrome: focus in on open, focus back to the opener on close.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    return () => returnFocusTo?.()?.focus?.({ preventScroll: true });
  }, [returnFocusTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = panelRef.current;
      if (!node) return;
      const ring = [
        ...node.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
        ),
      ].filter((el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true");
      if (!ring.length) return;
      const first = ring[0];
      const last = ring[ring.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? ring.indexOf(active) : -1;
      if (idx === -1) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!action || !schema) return null;

  const missing = unfilledRequired({ ...schema, fields: schema.fields.map((f) => ({ ...f, value: values[f.key] })) });

  /** A33.1.7 — attribution for edited agent prose. Ledger-bound, never injected. */
  const attribution: NarrativeAttribution | null = editedFields.length
    ? { provenance: "AGENT", editedBy: data.meta?.user, editedAt: new Date().toISOString(), editedFields }
    : null;

  /** Stage the plan.
   *
   *  FAIL-CLOSED (unchanged): the real `stage_*` tools do not exist yet, so in a
   *  SHIPPED artifact there is nothing to call and the action stays
   *  analysis-only exactly as today. The simulation adapter is gated to tests
   *  and the dev server, and it says so on the gate when it is used. */
  function stage() {
    const simulated = simulateStagedOutput({
      actionId,
      accountName,
      suggestions: engine.suggestions.filter((s) => !declined[s.id]),
    });
    if (!simulated) return; // no live tool, no simulation: nothing to confirm
    setPlan(simulated);
    setPhase("confirm");
  }

  function onConfirmed(t: DecisionToken) {
    setToken(t);
    if (plan) setTracker(initTracker(plan.steps));
    setPhase("tracker");
  }

  function setField(f: PanelField, v: unknown) {
    setValues((prev) => ({ ...prev, [f.key]: v }));
    if (f.prefill.source === "AGENT_NARRATIVE") {
      setEditedFields((prev) => (prev.includes(f.key) ? prev : [...prev, f.key]));
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: "var(--z-modal)", background: "var(--scrim)" }}
        onClick={onClose}
        role="presentation"
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={action.label}
          onClick={(e) => e.stopPropagation()}
          className="c360-panel-in flex max-h-[86vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[18px] bg-raised"
          style={{ boxShadow: "var(--shadow-panel)", border: "1px solid var(--border)", transformOrigin: "center" }}
        >
          {/* Header */}
          <div className="flex flex-none items-start gap-3 border-b border-divider px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-extrabold tracking-tight text-ink">{action.label}</h2>
              <div className="mt-0.5 text-[11.5px] text-ink-muted">{accountName}</div>
              {schema.intro && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-body">{schema.intro}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="c360-press flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-border text-ink-muted hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
                <path d="M4 4l7 7M11 4l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {phase === "confirm" && plan && (
              <ConfirmGate
                plan={plan}
                actionId={actionId}
                simulated
                onBack={() => setPhase("form")}
                onConfirmed={onConfirmed}
              />
            )}

            {phase === "tracker" && plan && tracker && (
              <StepTracker
                plan={plan}
                state={tracker}
                token={token}
                snapshot={bundle?.snapshot}
                onChange={setTracker}
              />
            )}

            {phase === "form" && (
            <>
            {/* Suggestions and gaps first: they may change what the banker enters. */}
            {(engine.suggestions.length > 0 || engine.gaps.length > 0) && (
              <div className="flex flex-col gap-2 border-b border-divider px-5 py-4">
                <div className="kicker">What the figures say</div>
                {engine.suggestions
                  .filter((s) => !declined[s.id])
                  .map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      onOverride={(reason) => setDeclined((prev) => ({ ...prev, [s.id]: reason }))}
                    />
                  ))}
                {Object.entries(declined).map(([id, reason]) => (
                  <div key={id} className="rounded-[8px] border border-border px-3 py-2 text-[11px] text-ink-muted">
                    <span className="font-semibold">{id}</span> declined: {reason}
                  </div>
                ))}
                {engine.gaps.map((g, i) => (
                  <GapNote key={`${g.ruleId}-${i}`} gap={g} />
                ))}
              </div>
            )}

            {schema.fields.map((f) => (
              <FieldRow
                key={f.key}
                field={f}
                value={values[f.key]}
                edited={editedFields.includes(f.key)}
                onChange={(v) => setField(f, v)}
              />
            ))}
            </>
            )}
          </div>

          {/* Footer: the confirm GATE itself lands in the next round; this is the
              schema-completeness state only. */}
          {phase === "form" && (
          <div className="flex flex-none items-center gap-3 border-t border-divider px-5 py-3">
            <div className="flex-1 text-[11px] text-ink-muted">
              {missing.length > 0
                ? `${missing.length} required ${missing.length === 1 ? "field" : "fields"} still to complete.`
                : `Creates a ${schema.writeObjectLabel}.`}
            </div>
            {attribution && <span className="text-[10px] text-ink-faint">narrative edited</span>}
            <button
              type="button"
              onClick={onClose}
              className="c360-press rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
            >
              Close
            </button>
            {isSimulationAllowed() ? (
              <button
                type="button"
                disabled={missing.length > 0}
                onClick={stage}
                className="c360-btn rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                Review the plan
              </button>
            ) : (
              <span className="text-[11px] text-ink-faint" title="The staging tools are not deployed yet">
                Analysis only until the staging tools are live
              </span>
            )}
          </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

/** Currency rendering helper reused by tests and the confirm summary. */
export const formatPanelCurrency = fmtMoney;
