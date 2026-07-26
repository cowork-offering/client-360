import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/appState";
import { Portal } from "./Portal";
import { ACTIONS_BY_ID } from "../actions/registry";
import { buildPanelSchema } from "../actions/schemas";
import { chipFor, stagingBlockers, unfilledRequired, type NarrativeAttribution, type PanelField } from "../actions/panelSchema";
import { computeSuggestions, detectDrift, type NamedGap, type Suggestion } from "../actions/suggestionEngine";
import { runCompile, type CompileLine } from "../actions/compile";
import { CompileScreen } from "./CompileScreen";
import { validatePlan } from "../actions/transitionAllowlist";
import { assertNoRecordIds } from "../actions/stagedPlan";
import { withDrafts } from "../actions/drafts";
import { buildBriefing } from "../actions/briefing";
import { BriefingCard } from "./BriefingCard";
import type { ProvenanceKind, ReasonCode } from "../data/contract";
import { fmtMoney } from "../data/format";
import { ConfirmGate } from "./ConfirmGate";
import { StepTracker } from "./StepTracker";
import { isSimulationAllowed, simulateStagedOutput, type StagedOutput } from "../actions/stagedPlan";
import { isWriteAction, stageAction, type ExecuteResult, type StagePayloads, type ToolError } from "../channel/writeTools";
import { mcpAvailable } from "../channel/mcp";
import { observedPicklistMap } from "../actions/observedPicklists";
import { newRequestId } from "../channel/adapter";
import { initTracker, type TrackerState } from "../actions/tracker";
import { executedActivityEntry } from "../actions/executedActivity";
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

      {field.gap && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: "var(--warning)" }}>
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 flex-none">
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 4.8v.1M8 7v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {field.gap.reason}
        </div>
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

type Phase = "form" | "compile" | "confirm" | "tracker";

/** Briefing -> Plan -> Execution. Compile is the bridge between the first two,
 *  so it shows as the Plan step already being worked on. */
const STEPS: Array<{ id: Phase; label: string }> = [
  { id: "form", label: "Briefing" },
  { id: "confirm", label: "Plan" },
  { id: "tracker", label: "Execution" },
];

function Stepper({ phase, onBack }: { phase: Phase; onBack: () => void }) {
  const index = phase === "compile" ? 1 : STEPS.findIndex((s) => s.id === phase);
  // Only the Plan step may walk back. Once a plan has been filed there is no
  // stepping back to edit it: the record exists, and pretending otherwise would
  // be the one dishonest thing on this screen.
  const canGoBack = phase === "confirm";

  return (
    <div className="flex items-center gap-1.5 border-b border-divider px-5 py-2">
      {STEPS.map((s, i) => {
        const here = i === index;
        return (
          <span key={s.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-[10px] text-ink-faint" aria-hidden="true">
                /
              </span>
            )}
            {i < index && canGoBack ? (
              <button
                type="button"
                onClick={onBack}
                className="c360-press rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted hover:text-ink"
              >
                {s.label}
              </button>
            ) : (
              <span
                aria-current={here ? "step" : undefined}
                className="px-1.5 py-0.5 text-[11px] font-semibold"
                style={{ color: here ? "var(--accent)" : i < index ? "var(--ink-muted)" : "var(--ink-faint)" }}
              >
                {s.label}
              </span>
            )}
          </span>
        );
      })}
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
  const { data, state, worklist, dispatch } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);

  const action = ACTIONS_BY_ID[actionId];
  const accountId = state.accountId ?? "";
  const accountName =
    data.portfolio.accounts.find((a) => a.accountId === accountId)?.name ?? data.borrower?.snapshot?.name ?? "this relationship";
  const bundle = (data.borrowers ?? {})[accountId] ?? (data.borrower?.snapshot?.accountId === accountId ? data.borrower : null);

  /** Legal values the tool returned on a VALIDATION_FAILED. Authoritative:
   *  they supersede the partial observed cache for that field. */
  const [legalValues, setLegalValues] = useState<Record<string, string[]>>({});

  /** Why this action is on the queue. Seeds the drafted recommendation and the
   *  briefing's opening line; never invented, always the derived worklist.
   *  Keyed so the memos below depend on the reasons, not on a fresh array. */
  const reasonKey = (worklist.reasons[accountId] ?? []).join("|");
  const reasons = useMemo(() => (reasonKey ? (reasonKey.split("|") as ReasonCode[]) : []), [reasonKey]);

  /** The schema, then the agent's drafts overlaid onto it (WP7.2). The overlay
   *  only fills AGENT_NARRATIVE fields the panel would otherwise open empty, so
   *  every contract the classic form obeys is untouched. */
  const schema = useMemo(() => {
    const base = buildPanelSchema(actionId, {
      bundle,
      accountId,
      accountName,
      orgPicklists: { ...observedPicklistMap(), ...legalValues },
    });
    return base ? withDrafts(base, actionId, bundle, reasons) : null;
  }, [actionId, bundle, accountId, accountName, legalValues, reasons]);

  const briefing = useMemo(
    () => buildBriefing(actionId, schema, bundle, accountName, reasons),
    [actionId, schema, bundle, accountName, reasons],
  );

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries((schema?.fields ?? []).map((f) => [f.key, f.value])),
  );
  const [editedFields, setEditedFields] = useState<string[]>([]);
  const [declined, setDeclined] = useState<Record<string, string>>({});
  /** briefing -> compile -> plan -> execution. Compile is the bridge, not a
   *  stop on the stepper: it is how the plan gets built. */
  const [phase, setPhase] = useState<Phase>("form");
  const [showAllFields, setShowAllFields] = useState(false);
  const [compileLines, setCompileLines] = useState<CompileLine[]>([]);
  /** The values the current plan was built from. Editing away from these means
   *  the plan on the next screen is stale and has to be rebuilt. */
  const [stagedValues, setStagedValues] = useState<string | null>(null);
  const [plan, setPlan] = useState<StagedOutput | null>(null);
  const [tracker, setTracker] = useState<TrackerState | null>(null);
  const [token, setToken] = useState<DecisionToken | null>(null);
  const [toolError, setToolError] = useState<ToolError | null>(null);
  const [live, setLive] = useState(false);
  const [outcome, setOutcome] = useState<ExecuteResult | null>(null);
  /** Stable across a stage/execute pair and across resume (A33.3.5). Ours, not
   *  nCino's: the platform is known to duplicate on failed background Apex. */
  const idempotencyKeyRef = useRef<string>(newRequestId());

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
  // Honest-gap discipline: a missing write anchor blocks staging outright. We
  // never substitute a different record's id to get past it.
  const blockers = stagingBlockers(schema);

  /** True once the banker has edited away from the values the plan was built
   *  from. The plan on the Plan step is then a description of something that is
   *  no longer what would be filed. */
  const planIsStale = plan !== null && stagedValues !== null && stagedValues !== JSON.stringify(values);

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
  /** Build the tool payload from the panel values. Field names come from the
   *  deployed Apex Request classes, read not guessed. */
  function stagePayload(): StagePayloads[keyof StagePayloads] | null {
    const idempotencyKey = idempotencyKeyRef.current;
    const v = (k: string) => (values[k] === "" ? null : (values[k] ?? null));
    const rationale = engine.suggestions.filter((s) => !declined[s.id]).map((s) => s.rationale).join(" ") || undefined;

    if (actionId === "collateral-valuation") {
      const collateralId = String(schema?.fields.find((f) => f.key === "collateral")?.prefill.citation ?? "");
      if (!collateralId) return null;
      return {
        idempotencyKey,
        rationale,
        collateralId,
        value: typeof v("value") === "number" ? (v("value") as number) : null,
        valuationDate: v("valuationDate") as string | null,
        type: v("type") as string | null,
        source: v("source") as string | null,
        description: v("description") as string | null,
        primary: values.primary === true,
      };
    }
    if (actionId === "create-service-request") {
      const req = (bundle?.requests ?? [])[0];
      return {
        idempotencyKey,
        accountId,
        rationale,
        requestType: v("type") as string | null,
        summary: (v("subject") ?? v("description")) as string | null,
        referenceKind: req?.reference?.kind ?? null,
        referenceId: req?.reference?.id ?? null,
        referenceWebLink: req?.reference?.webLink ?? null,
      };
    }
    return {
      idempotencyKey,
      accountId,
      rationale,
      reviewType: v("reviewType") as string | null,
      productPackageId: bundle?.snapshot?.productPackageId ?? null,
      narrative: v("narrative") as string | null,
      relationshipSummary: v("relationshipSummary") as string | null,
      strengthsNarrative: v("strengths") as string | null,
      weaknessNarrative: v("weaknesses") as string | null,
      recommendationNarrative: v("recommendation") as string | null,
      collateralAnalysisNarrative: v("collateralAnalysis") as string | null,
      financialAnalystNarrative: v("financialAnalysis") as string | null,
      guarantorNarrative: v("guarantor") as string | null,
      riskRatingComments: v("riskRatingComments") as string | null,
    };
  }

  /** USER GESTURE ONLY, and the whole sequence runs on that one gesture.
   *
   *  Each line below wraps a REAL operation. Nothing is narrated that does not
   *  happen, and a line cannot tick before its own operation has returned. A
   *  failure stops the sequence on its line and the error is rendered there. */
  async function stage() {
    setToolError(null);
    setPhase("compile");

    let payload: ReturnType<typeof stagePayload> = null;
    let built: StagedOutput | null = null;
    let fromLiveTool = false;

    const outcome = await runCompile(
      [
        {
          id: "prefills",
          label: "Gathering the prefills",
          run: () => {
            // Defence in depth: the gesture is disabled on a blocking gap, and
            // the sequence refuses it again here.
            if (blockers.length) {
              throw { code: "NOT_STAGEABLE", message: blockers.map((b) => b.gap!.reason).join(" ") };
            }
            payload = stagePayload();
            if (!payload && mcpAvailable() && isWriteAction(actionId)) {
              throw { code: "PRECONDITION", message: "This relationship has no pledged collateral to value." };
            }
            const filled = schema!.fields.filter((f) => values[f.key] !== null && values[f.key] !== undefined && values[f.key] !== "");
            return `${filled.length} of ${schema!.fields.length} fields carry a value`;
          },
        },
        {
          id: "recompute",
          label: "Recomputing the figures and checking for drift",
          run: () => {
            const fresh = computeSuggestions({ data, bundle, actionId });
            const moved = detectDrift(engine.suggestions, fresh, data.meta?.generatedAt ?? "");
            if (moved.length) {
              throw {
                code: "VALIDATION_FAILED",
                message: "The figures moved while this was open, so the plan would have been built on numbers you did not see. Reopen the briefing and check them.",
              };
            }
            return fresh.suggestions.length
              ? `${fresh.suggestions.length} finding${fresh.suggestions.length === 1 ? "" : "s"} still stands`
              : "no findings outstanding";
          },
        },
        {
          id: "stage",
          label: "Sending it to the org to be staged",
          run: async () => {
            if (!(mcpAvailable() && isWriteAction(actionId))) {
              built = simulateStagedOutput({
                actionId,
                accountName,
                suggestions: engine.suggestions.filter((s) => !declined[s.id]),
              });
              if (!built) throw { code: "NOT_STAGEABLE", message: "There is no staging tool for this action in this view." };
              return "simulated, nothing left this page";
            }
            const res = await stageAction(actionId, payload as never);
            if (!res.ok) {
              // The tool returns the legal picklist set on a mismatch; adopt it
              // so the briefing can offer the real values on the next attempt.
              if (res.error.legalValues?.length) {
                const target = /type/i.test(res.error.message) ? "LLC_BI__Type__c" : "LLC_BI__Source__c";
                setLegalValues((prev) => ({
                  ...prev,
                  [`LLC_BI__Collateral_Valuation__c.${target}`]: res.error.legalValues!,
                }));
              }
              throw res.error;
            }
            built = { ...res.result, suggestions: engine.suggestions.filter((s) => !declined[s.id]) };
            fromLiveTool = true;
            return "the org accepted it";
          },
        },
        {
          id: "plan",
          label: "Checking the plan that came back",
          run: () => {
            if (!built) throw { code: "TRANSPORT", message: "The staging call returned no plan." };
            const violations = validatePlan(built.steps);
            if (violations.length) {
              throw {
                code: "VALIDATION_FAILED",
                message: `Step ${violations[0].stepId}: ${violations[0].reason}`,
              };
            }
            const leaks = assertNoRecordIds(built);
            if (leaks.length) throw { code: "VALIDATION_FAILED", message: leaks[0] };
            return `${built.steps.length} step${built.steps.length === 1 ? "" : "s"}`;
          },
        },
      ],
      { onLines: setCompileLines },
    );

    if (!outcome.ok) {
      setToolError(outcome.error);
      return; // the compile screen holds, with the error on its own line
    }
    setPlan(built);
    setLive(fromLiveTool);
    setStagedValues(JSON.stringify(values));
    setPhase("confirm");
  }

  function onConfirmed(t: DecisionToken, executed?: ExecuteResult) {
    setToken(t);

    // A30 — the trail records what the banker did, success or not. Rendered
    // immediately on the Activity tab; no Sync required, because this event
    // happened here rather than being read from the org.
    if (executed) {
      const entry = executedActivityEntry({
        actionId,
        outcome: executed,
        target: readonlyAnchorLabel(),
        actor: data.meta?.user,
        instanceUrl: data.meta?.instanceUrl,
      });
      if (entry) dispatch({ type: "LOG_ACTIVITY", accountId, entry });
    }

    if (plan) {
      const base = initTracker(plan.steps);
      // The tracker consumes the executor's step states verbatim; the state
      // machine still owns every transition from here.
      setTracker(
        executed
          ? {
              steps: base.steps.map((s) => {
                const live = executed.steps.find((x) => x.id === s.id);
                return live ? { id: s.id, state: live.state as typeof s.state, note: live.detail } : s;
              }),
            }
          : base,
      );
      setOutcome(executed ?? null);
    }
    setPhase("tracker");
  }

  /** What the action was filed against, in the panel's own banker language:
   *  the readonly anchor field the schema already renders. Staged text, never
   *  a record name the executor did not return. */
  function readonlyAnchorLabel(): string | undefined {
    const anchor = schema?.fields.find((f) => f.key === "collateral" || f.key === "account");
    return typeof anchor?.value === "string" && anchor.value ? anchor.value : undefined;
  }

  /** Stepping back preserves everything the banker entered. The plan is kept
   *  too, so a step forward without edits shows the same plan and the same
   *  hash; edits make it stale, and the briefing says so. */
  function stepBack() {
    setToolError(null);
    setPhase(phase === "tracker" ? "confirm" : "form");
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

          <Stepper phase={phase} onBack={stepBack} />

          <div key={phase} className="c360-step-in min-h-0 flex-1 overflow-auto">
            {phase === "compile" && (
              <CompileScreen lines={compileLines} onRetry={() => void stage()} onBack={() => setPhase("form")} />
            )}

            {phase === "confirm" && plan && (
              <ConfirmGate
                plan={plan}
                actionId={actionId}
                simulated={!live}
                idempotencyKey={idempotencyKeyRef.current}
                onBack={stepBack}
                onConfirmed={onConfirmed}
              />
            )}

            {phase === "tracker" && plan && tracker && (
              <StepTracker
                plan={plan}
                actionId={actionId}
                state={tracker}
                token={token}
                snapshot={bundle?.snapshot}
                outcome={outcome}
                onChange={setTracker}
              />
            )}

            {phase === "form" && (
            <>
            {/* A re-stage after edits is a NEW plan and a new hash. Say so
                rather than letting the banker assume the plan they already saw
                still describes what would be filed. */}
            {planIsStale && (
              <div className="border-b border-divider px-5 py-3">
                <div className="rounded-[10px] px-3.5 py-2.5" style={{ background: "var(--warning-bg)" }}>
                  <div className="text-[12px] leading-relaxed" style={{ color: "var(--warning-prose)" }}>
                    The figures changed, so the plan will be rebuilt. The one you saw no longer describes what would be filed.
                  </div>
                </div>
              </div>
            )}

            {/* WP7.1 — the panel opens on the composed proposal, not a form. */}
            {briefing && (
              <BriefingCard
                briefing={briefing}
                schema={schema}
                values={values}
                editedFields={editedFields}
                onChange={setField}
                renderChip={(f, edited) => {
                  const kind = chipFor(f);
                  return kind ? <ProvenanceChip kind={kind} citation={f.prefill.citation} edited={edited} /> : null;
                }}
              />
            )}

            {/* Suggestions and gaps next: they may change what the banker enters. */}
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

            {toolError && (
              <div className="border-b border-divider px-5 py-3">
                <div className="rounded-[10px] px-3.5 py-2.5" style={{ background: "var(--critical-bg)" }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--critical)" }}>
                    {toolError.code === "VALIDATION_FAILED" ? "The org rejected a value" : "The tool could not stage this"}
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--critical)" }}>
                    {toolError.message}
                  </div>
                  {toolError.orgError && (
                    <div className="mt-1 font-mono text-[10.5px]" style={{ color: "var(--critical)" }}>
                      {toolError.orgError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* The completeness and audit view. Every field the write touches,
                in schema order, with its provenance. Kept, not replaced. */}
            {briefing && (
              <button
                type="button"
                aria-expanded={showAllFields}
                onClick={() => setShowAllFields((v) => !v)}
                className="c360-press flex w-full items-center gap-2 border-t border-divider px-5 py-2.5 text-[11.5px] font-semibold text-ink-muted hover:text-ink"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  className="c360-twist flex-none"
                  style={{ transform: showAllFields ? "rotate(90deg)" : "none" }}
                >
                  <path d="M4 2.5l4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                All fields ({schema.fields.length})
              </button>
            )}

            {(!briefing || showAllFields) &&
              schema.fields.map((f) => (
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

          {/* Footer: schema completeness, and the gesture that builds the plan. */}
          {phase === "form" && (
          <div className="flex flex-none items-center gap-3 border-t border-divider px-5 py-3">
            <div className="flex-1 text-[11px] text-ink-muted">
              {blockers.length > 0
                ? blockers.map((b) => b.gap!.reason).join(" ")
                : missing.length > 0
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
            {(mcpAvailable() && isWriteAction(actionId)) || isSimulationAllowed() ? (
              <button
                type="button"
                disabled={missing.length > 0 || blockers.length > 0}
                onClick={() => (plan && !planIsStale ? setPhase("confirm") : void stage())}
                className="c360-btn rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                {plan && !planIsStale ? "Back to the plan" : planIsStale ? "Rebuild the plan" : "Review the plan"}
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
