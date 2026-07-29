import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Portal } from "./Portal";
import { isTopmost, pushModal } from "./modalStack";
import { DealTicket } from "./DealTicket";
import { ConfirmGate } from "./ConfirmGate";
import { Stepper, type Phase } from "./ActionPanel";
import { chipFor, unfilledRequired, stagingBlockers, type PanelField } from "../actions/panelSchema";
import type { ProvenanceKind } from "../data/contract";
import {
  ATTESTATION_ASSERTS,
  attestationRefusals,
  buildOnboardingBriefing,
  buildOnboardingPlan,
  buildOnboardingSchema,
  readinessChecklist,
} from "../actions/onboardingTicket";
import { ATTESTATION_HUMAN_ONLY, type OnboardingAction } from "../actions/onboardingActions";
import type { OnboardingCase } from "../data/onboarding";
import type { StagedOutput } from "../actions/stagedPlan";

/* =============================================================================
   THE ONBOARDING TICKET PANEL

   Same modal, same stepper, same ticket body, same confirm gate as the credit
   actions. The banker cannot tell the two apart until the moment of filing, and
   at that moment they meet the honest ONBOARDING_TOOLS_PENDING gate instead of a
   confirm gesture. That is the whole point: the ceremony is real, the boundary
   is where it actually is.
   ============================================================================= */

const STEPS: Array<{ id: Phase; label: string }> = [
  { id: "form", label: "Briefing" },
  { id: "confirm", label: "Plan" },
];

const CHIP_STYLE: Record<ProvenanceKind, { bg: string; fg: string; label: string }> = {
  NCINO: { bg: "var(--accent-wash)", fg: "var(--accent)", label: "nCino" },
  BOOM: { bg: "var(--positive-bg)", fg: "var(--positive)", label: "Boom" },
  AGENT: { bg: "var(--user-tone-wash)", fg: "var(--user-tone)", label: "Agent" },
  DERIVED: { bg: "var(--wash-2)", fg: "var(--ink-body)", label: "Derived" },
  PENDING: { bg: "var(--warning-bg)", fg: "var(--warning)", label: "Pending" },
  GAP: { bg: "var(--neutral-bg)", fg: "var(--ink-muted)", label: "Not in source" },
};

function Chip({ kind, citation }: { kind: ProvenanceKind; citation?: string }) {
  const s = CHIP_STYLE[kind];
  return (
    <span
      className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
      title={citation ? `Source: ${citation}` : undefined}
    >
      {s.label}
    </span>
  );
}

/** The attestation's distinguishing block: what it asserts, and what the case
 *  says about each assertion. Green or blocked, read from the case, never
 *  summarised as an all-clear. */
function AttestationPanel({ kase, refusals }: { kase: OnboardingCase; refusals: string[] }) {
  const items = readinessChecklist(kase);
  return (
    <div className="flex flex-col gap-3 border-b border-divider px-5 py-4">
      <div
        className="rounded-[12px] px-4 py-3"
        style={{ background: "var(--user-tone-wash)", border: "1px solid var(--border-strong)" }}
      >
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--user-tone)" }}>
          Human attestation
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
          {ATTESTATION_ASSERTS}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted" style={{ textWrap: "pretty" as never }}>
          {ATTESTATION_HUMAN_ONLY}
        </p>
      </div>

      <div>
        <div className="kicker mb-2">Readiness</div>
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => (
            <li key={it.label} data-readiness={it.ok ? "ok" : "blocked"} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[5px] h-2 w-2 flex-none rounded-full"
                style={{ background: it.ok ? "var(--positive)" : "var(--critical)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="text-[12.5px] font-semibold text-ink">{it.label}</span>
                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: it.ok ? "var(--positive)" : "var(--critical)" }}>
                  {it.ok ? "clear" : "blocked"}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">{it.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {refusals.length > 0 && (
        <div data-attestation-refused="true" className="rounded-[10px] px-3.5 py-3" style={{ background: "var(--critical-bg)" }}>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--critical)" }}>
            This case cannot be attested
          </div>
          <ul className="mt-1.5 space-y-1">
            {refusals.map((r) => (
              <li key={r} className="text-[12px] leading-relaxed" style={{ color: "var(--critical)" }}>
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--critical)" }}>
            Clear these first. Attesting over an open item would assert something this case's own record contradicts.
          </p>
        </div>
      )}
    </div>
  );
}

export function OnboardingTicket({
  action,
  kase,
  onClose,
  returnFocusTo,
}: {
  action: OnboardingAction;
  kase: OnboardingCase;
  onClose: () => void;
  returnFocusTo?: () => HTMLElement | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const sheetCloserRef = useRef<(() => void) | null>(null);
  const layerId = useId();

  useEffect(() => pushModal(layerId), [layerId]);

  const schema = useMemo(() => buildOnboardingSchema(action.id, kase), [action.id, kase]);
  const briefing = useMemo(() => (schema ? buildOnboardingBriefing(action.id, kase, schema) : null), [action.id, kase, schema]);

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries((schema?.fields ?? []).map((f) => [f.key, f.value])),
  );
  const [phase, setPhase] = useState<Phase>("form");
  const [plan, setPlan] = useState<StagedOutput | null>(null);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    return () => returnFocusTo?.()?.focus?.({ preventScroll: true });
  }, [returnFocusTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!isTopmost(layerId)) return;
      if (sheetCloserRef.current) {
        sheetCloserRef.current();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, layerId]);

  if (!schema || !briefing) return null;

  const withValues = { ...schema, fields: schema.fields.map((f) => ({ ...f, value: values[f.key] })) };
  const missing = unfilledRequired(withValues);
  const blockers = stagingBlockers(schema);
  /** The attestation refuses BEFORE any gate when the case has open items. */
  const refusals = action.id === "attest-clearance" ? attestationRefusals(kase) : [];
  const cannotFile = missing.length > 0 || blockers.length > 0 || refusals.length > 0;

  function review() {
    const built = buildOnboardingPlan(action.id, kase, values);
    if (!built) return;
    setPlan(built);
    setPhase("confirm");
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
          ref={(el) => {
            panelRef.current = el;
            setPanelEl(el);
          }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={action.label}
          onClick={(e) => e.stopPropagation()}
          className="c360-panel-in relative flex max-h-[86vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[18px] bg-raised"
          style={{ boxShadow: "var(--shadow-panel)", border: "1px solid var(--border)", transformOrigin: "center" }}
        >
          <div className="flex flex-none items-start gap-3 border-b border-divider px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-extrabold tracking-tight text-ink">{action.label}</h2>
              <div className="mt-0.5 text-[11.5px] text-ink-muted">{kase.name}</div>
              {schema.intro && <p className="mt-2 text-[11.5px] leading-relaxed text-ink-body">{schema.intro}</p>}
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

          <Stepper phase={phase} steps={STEPS} onBack={() => setPhase("form")} />

          <div key={phase} className="c360-step-in min-h-0 flex-1 overflow-auto">
            {phase === "confirm" && plan && (
              <ConfirmGate
                plan={plan}
                actionId={action.id}
                simulated={false}
                pendingGate={action}
                onGateDismiss={onClose}
                onBack={() => setPhase("form")}
                onConfirmed={() => undefined}
              />
            )}

            {phase === "form" && (
              <>
                {action.humanOnly && <AttestationPanel kase={kase} refusals={refusals} />}
                <DealTicket
                  actionId={action.id}
                  briefing={briefing}
                  schema={withValues}
                  bundle={null}
                  values={values}
                  editedFields={[]}
                  reasons={[]}
                  onChange={(f: PanelField, v: unknown) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                  sheetCloserRef={sheetCloserRef}
                  sheetHost={panelEl}
                  renderChip={(f) => {
                    const kind = chipFor(f);
                    return kind ? <Chip kind={kind} citation={f.prefill.citation} /> : null;
                  }}
                />
              </>
            )}
          </div>

          {phase === "form" && (
            <div className="flex flex-none items-center gap-3 border-t border-divider px-5 py-3">
              <div className="flex-1 text-[11px] text-ink-muted">
                {refusals.length > 0
                  ? `${refusals.length} blocking ${refusals.length === 1 ? "item" : "items"} must be cleared first.`
                  : blockers.length > 0
                    ? blockers.map((b) => b.gap!.reason).join(" ")
                    : missing.length > 0
                      ? `${missing.length} required ${missing.length === 1 ? "field" : "fields"} still to complete.`
                      : `Creates a ${schema.writeObjectLabel}.`}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="c360-press rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
              >
                Close
              </button>
              <button
                type="button"
                disabled={cannotFile}
                onClick={review}
                className="c360-btn rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                Review the plan
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
