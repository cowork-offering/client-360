import { useEffect, useState } from "react";
import type { Snapshot } from "../data/contract";
import type { StagedOutput } from "../actions/stagedPlan";
import { actionTerminal, blockingPrecondition, STEP_TYPE_LABEL, type StepState, type TrackerState } from "../actions/tracker";
import type { DecisionToken } from "../actions/decisionToken";
import { OpenCreatedPackage, OpenCreatedRecord, OpenInNcino } from "./DeepLink";
import type { ExecuteResult } from "../channel/writeTools";
import { compilePace } from "../actions/compile";

/* A33.3.3 / A33.3.5 — the tracker shows WHERE a plan got to, never a false
   green. Failure is located, preserved and resumable; a timeout reads as filed
   but unverified, and a step blocked on an unverified precondition says which
   fact it is waiting on rather than quietly running anyway.

   WP7.4 adds the reveal, and the reveal is PRESENTATION ONLY. The executor has
   already returned every step's final state and the state machine still owns
   every transition. What the reveal changes is the pace at which those settled
   states are shown, one row at a time, so the banker reads the outcome instead
   of being handed a wall of it. A row that has not landed yet renders as the
   plan's own pre-execution state; no row ever shows a state the executor did
   not return. Reduced motion lands everything at once. */

const STATE_COPY: Record<StepState, { label: string; bg: string; fg: string }> = {
  pending: { label: "Not started", bg: "var(--wash-2)", fg: "var(--ink-muted)" },
  running: { label: "Running", bg: "var(--accent-wash)", fg: "var(--accent)" },
  waiting: { label: "Waiting", bg: "var(--warning-bg)", fg: "var(--warning)" },
  filed_unverified: { label: "Filed, unverified", bg: "var(--warning-bg)", fg: "var(--warning)" },
  verified: { label: "Verified", bg: "var(--positive-bg)", fg: "var(--positive)" },
  failed: { label: "Failed", bg: "var(--critical-bg)", fg: "var(--critical)" },
  ambiguous: { label: "Outcome unknown", bg: "var(--critical-bg)", fg: "var(--critical)" },
  skipped_not_attempted: { label: "Not attempted", bg: "var(--wash-2)", fg: "var(--ink-faint)" },
};

const TERMINAL_COPY: Record<string, string> = {
  in_progress: "Running.",
  success: "Every step completed or handed off as planned.",
  partial: "Some steps completed and some did not. Nothing below is claimed as verified unless it says so.",
  failed: "Nothing was verified. The plan stopped at the first failure.",
};

/**
 * The record the write created.
 *
 * `name` is null EXACTLY when the org's verification read-back failed, which is
 * the `filed_unverified` case. That null is EVIDENCE, so it is carried through
 * as `nameConfirmed: false` and shown as such. Substituting a generic label
 * here would turn a real verification failure into copy that reads like
 * success, which is the one thing this stamp must never do.
 */
interface FiledRecord {
  label: string;
  id: string;
  name: string | null;
  anchor: string | null;
  nameConfirmed: boolean;
}

function filedRecord(outcome: ExecuteResult | null | undefined, actionId: string): FiledRecord | null {
  if (!outcome) return null;
  // A modification's created record is the CLONE. The parent facility already
  // existed and is never what was filed.
  const id =
    outcome.valuationId ??
    outcome.caseId ??
    outcome.reviewId ??
    (actionId === "loan-modification" ? outcome.cloneLoanId : undefined);
  if (!id) return null;
  const label = outcome.valuationId
    ? "collateral valuation"
    : outcome.caseId
      ? "service request"
      : outcome.reviewId
        ? "annual credit review"
        : "modification";
  const name = outcome.recordName ?? null;
  return { label, id, name, anchor: outcome.anchorName ?? null, nameConfirmed: name !== null };
}

/** Reveal the settled rows one at a time. Returns how many have landed. */
function useReveal(count: number, paused: boolean): number {
  const [landed, setLanded] = useState(() => (compilePace() === 0 || paused ? count : 0));

  useEffect(() => {
    const pace = compilePace();
    if (pace === 0 || paused) {
      setLanded(count);
      return;
    }
    setLanded(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setLanded(i);
      if (i >= count) clearInterval(timer);
    }, pace);
    return () => clearInterval(timer);
  }, [count, paused]);

  return landed;
}

export function StepTracker({
  plan,
  actionId,
  state,
  token,
  snapshot,
  outcome,
  onContinue,
  continuing,
}: {
  plan: StagedOutput;
  /** Which registry action filed this, so the deep link can name its object. */
  actionId: string;
  state: TrackerState;
  token: DecisionToken | null;
  snapshot: Snapshot | undefined;
  /** Present once the executor has run. Its own words win over ours. */
  outcome?: ExecuteResult | null;
  /** Present when the org says the plan can be resumed. A USER GESTURE makes
   *  the second call; nothing here polls and nothing retries on its own. */
  onContinue?: () => void;
  continuing?: boolean;
  onChange?: (s: TrackerState) => void;
}) {
  // THE EXECUTOR'S OWN VERDICT WINS once it has run. It read the org back; the
  // local machine only mirrors the step states it returned, and it derives
  // `partial` from any step the org itself calls unverifiable — an observed
  // side effect that reports nothing back is exactly that. Downgrading a run
  // the org called a success would put resume copy under a completed action.
  const terminal = outcome?.terminalState === "success" ? "success" : actionTerminal(state, plan.steps);
  // Nothing to reveal when no executor has run: the rows are already the plan's
  // own starting states and there is no outcome to pace out.
  const landed = useReveal(plan.steps.length, !outcome);
  const revealing = landed < plan.steps.length;
  const filed = filedRecord(outcome, actionId);
  const items = outcome?.items ?? [];
  const covenantItems = items.filter((i) => Boolean(i.covenantId));
  const collateralItems = items.filter((i) => Boolean(i.collateralId));
  const firstBadIndex = plan.steps.findIndex((s) => {
    const rt = state.steps.find((r) => r.id === s.id);
    return rt?.state === "failed" || rt?.state === "ambiguous";
  });

  return (
    <div className="flex flex-col">
      <div className="border-b border-divider px-5 py-4">
        <div className="kicker mb-1.5">Progress</div>
        <p className="text-[12.5px] leading-relaxed text-ink-body">{outcome?.outcome || TERMINAL_COPY[terminal]}</p>
        {outcome?.replayed && (
          <p className="mt-1 text-[11px] text-ink-muted">
            This had already been filed under the same key, so nothing was written again.
          </p>
        )}
        {outcome?.collateralValueMoved === false && (
          <p className="mt-1 text-[11px] text-ink-muted">
            The collateral value did not change, so no coverage improvement is claimed.
          </p>
        )}
        {token && (
          <p className="mt-1 text-[10.5px] text-ink-faint">
            Confirmed by {token.userId}. This records that a named person saw this plan, and nothing more.
          </p>
        )}
      </div>

      <div className="border-b border-divider">
        {plan.steps.map((s, i) => {
          const settled = state.steps.find((r) => r.id === s.id)!;
          // Before its turn, the row shows the state it had BEFORE execution.
          const shown: StepState = i < landed ? settled.state : (s.state as StepState) ?? "pending";
          const copy = STATE_COPY[shown];
          const blocked = shown === "pending" ? blockingPrecondition(s, state) : null;
          const focus = !revealing && i === firstBadIndex;
          return (
            <div
              key={s.id}
              className={`flex items-start gap-3 border-b border-divider px-5 py-3 last:border-b-0 ${i < landed ? "c360-row-land" : ""}`}
              style={focus ? { background: "var(--critical-bg)" } : undefined}
            >
              <span
                className="mt-0.5 flex-none rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                style={{ background: copy.bg, color: copy.fg }}
              >
                {copy.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                    {STEP_TYPE_LABEL[s.type]}
                  </span>
                  <span className="text-[12.5px] font-medium text-ink">{s.label}</span>
                </span>
                {i < landed && settled.note && (
                  <span
                    className="mt-0.5 block text-[11px] leading-relaxed"
                    style={{ color: focus ? "var(--critical)" : "var(--ink-muted)" }}
                  >
                    {settled.note}
                  </span>
                )}
                {blocked && (
                  <span className="mt-0.5 block text-[11px] text-ink-muted">
                    Waiting on step {blocked} to be verified. It will not run on its own.
                  </span>
                )}
                {focus && (
                  <span className="mt-1 block text-[11px] leading-relaxed" style={{ color: "var(--critical)" }}>
                    This is where the plan stopped. Nothing after it was attempted, and it can be resumed from here once
                    the cause is cleared.
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* The package the plan created, when it created one. A second record was
          filed and the banker should know its name and be able to open it. */}
      {!revealing && outcome?.packageCreated === true && outcome.productPackageId && (
        <div className="c360-row-land border-b border-divider px-5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Credit package created</div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-ink">{outcome.anchorName ?? "New credit package"}</div>
          <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">{outcome.productPackageId}</div>
        </div>
      )}

      {/* A PACKAGE-ANCHORED CREDIT ACTION reports per facility. Each row names
          the clone Salesforce created, the chain row that records the revision, and
          what the apply step read back — the org's own sentence, not a
          restatement. A replay returns no facilities at all, so this block
          simply does not render for one: nothing was written to report. */}
      {!revealing && (outcome?.facilities?.length ?? 0) > 0 && (
        <div className="c360-row-land border-b border-divider px-5 py-4">
          <div className="kicker mb-2">Filed, per facility</div>
          <div className="flex flex-col gap-3">
            {outcome!.facilities!.map((f) => (
              <div key={f.facilityId}>
                <div className="text-[12.5px] font-semibold text-ink">{f.cloneName ?? f.cloneLoanId ?? f.facilityId}</div>
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-body">
                  Cloned from {f.facilityName ?? f.facilityId}
                  {f.cloneStage ? ` at stage ${f.cloneStage}` : ""}.
                </div>
                {f.junctionName && (
                  <div className="mt-0.5 text-[11px] text-ink-muted">
                    Chain row {f.junctionName}
                    {typeof f.revisionNumber === "number" ? ` records revision ${f.revisionNumber}` : ""}.
                  </div>
                )}
                {f.appliedChanges && <div className="mt-0.5 text-[11px] text-ink-muted">{f.appliedChanges}</div>}
                {f.parentUnchanged === true && (
                  <div className="mt-0.5 text-[11px] text-ink-muted">The parent facility reads back unchanged.</div>
                )}
                {f.cloneLoanId && <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">{f.cloneLoanId}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* A COVENANT BATCH reports per covenant: what the row read before and
          what it reads now. */}
      {!revealing && covenantItems.length > 0 && (
        <div className="c360-row-land border-b border-divider px-5 py-4">
          <div className="kicker mb-2">Recorded, per covenant</div>
          <div className="flex flex-col gap-2">
            {covenantItems.map((item) => (
              <div key={item.covenantComplianceId ?? item.covenantId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[12.5px] font-semibold text-ink">{item.anchorName ?? item.covenantId}</span>
                {item.written === false ? (
                  <span className="text-[12px]" style={{ color: "var(--warning)" }}>
                    not written
                  </span>
                ) : item.sourceStatus && item.status ? (
                  <span className="text-[12px] text-ink-body">
                    {item.sourceStatus} to {item.status}
                  </span>
                ) : null}
                {item.recordName ? (
                  <span className="font-mono text-[10.5px] text-ink-faint">{item.recordName}</span>
                ) : (
                  <span className="text-[12px]" style={{ color: "var(--warning)" }}>
                    name not confirmed
                  </span>
                )}
                {/* The org's own sentence for this covenant, verbatim. */}
                {item.outcome && <span className="w-full text-[10.5px] text-ink-faint">{item.outcome}</span>}
              </div>
            ))}
          </div>
          {/* TRI-STATE, and the null case is not silence: a replay observed
              nothing, so it must not be reported as "no approval was raised". */}
          {outcome?.approvalChainStarted === false && (
            <p className="mt-2 text-[11px] text-ink-muted">
              No successor compliance record was observed in this transaction, so no covenant approval was raised by
              it. A record created asynchronously would not be visible from here.
            </p>
          )}
          {outcome?.approvalChainStarted === true && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--warning)" }}>
              Salesforce created the next compliance record in this transaction, which is what raises the bank's covenant
              approval at a named person.
            </p>
          )}
        </div>
      )}

      {/* A BATCH reports per collateral. One row per item, each with its own
          filed name or its own unverified state: a failure on one is reported
          against that collateral and never hidden behind a batch-level green. */}
      {!revealing && collateralItems.length > 1 && (
        <div className="c360-row-land border-b border-divider px-5 py-4">
          <div className="kicker mb-2">Filed, per collateral</div>
          <div className="flex flex-col gap-2">
            {collateralItems.map((item) => (
              <div key={item.collateralId} className="flex flex-wrap items-baseline gap-x-2">
                {/* `collateralName` is on the STAGE item; the execute item names
                    the collateral in `anchorName`. Reading only the first
                    printed a raw record id at the banker. */}
                <span className="text-[12.5px] font-semibold text-ink">
                  {item.collateralName ?? item.anchorName ?? item.collateralId}
                </span>
                {item.recordName ? (
                  <span className="text-[12px] text-ink-body">filed as {item.recordName}</span>
                ) : (
                  <span className="text-[12px]" style={{ color: "var(--warning)" }}>
                    filed, name not confirmed
                  </span>
                )}
                {item.valuationId && <span className="font-mono text-[10.5px] text-ink-faint">{item.valuationId}</span>}
                {/* Probe 6: the rollup does not fire headlessly. Each item says
                    so for itself; none of them claims a coverage improvement. */}
                {item.collateralValueMoved === false && (
                  <span className="w-full text-[10.5px] text-ink-faint">
                    The collateral value did not change, so no coverage improvement is claimed.
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The stamp. Sober by design: a record was filed, which is a fact, not a
          celebration. It appears only once every row has landed. */}
      {!revealing && filed && filed.nameConfirmed && terminal === "success" && (
        <div className="c360-row-land border-b border-divider px-5 py-4">
          <div className="text-[15px] font-extrabold tracking-tight text-ink">
            Filed {filed.name}
            {filed.anchor ? ` against ${filed.anchor}` : ""}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{filed.id}</div>
        </div>
      )}

      {/* Filed, but the org could not read it back. The record exists and the
          id is real; the name is not confirmed, and saying so is the point. */}
      {!revealing && filed && !filed.nameConfirmed && (
        <div className="c360-row-land border-b border-divider px-5 py-4">
          <div className="text-[15px] font-extrabold tracking-tight" style={{ color: "var(--warning)" }}>
            Filed, name not confirmed
          </div>
          <div className="mt-1 text-[11.5px] leading-relaxed text-ink-body">
            The {filed.label} was written, but the read-back that confirms it did not come back. Open it in Salesforce to
            verify it landed as intended.
          </div>
          <div className="mt-1 font-mono text-[11px] text-ink-faint">{filed.id}</div>
        </div>
      )}

      {/* TWO-PHASE EXECUTE. The org is still working and has said so; that is
          not a failure and must never read as one. The banker's gesture makes
          the second call, consistent with the no-auto-retry doctrine. */}
      {!revealing && outcome?.resumable && onContinue && (
        <div className="border-b border-divider px-5 py-4">
          <div className="rounded-[10px] px-3.5 py-3" style={{ background: "var(--warning-bg)" }}>
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
              Waiting on the org
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--warning-prose)" }}>
              {/* The tool's own sentence when it gives one: it knows what a
                  Continue would do, and paraphrasing it would only blur it. */}
              {outcome.resumeDescriptor ??
                "What was written is written. The org is still finishing, in a transaction this page cannot see. Nothing is retried on its own: continue when you are ready and the cockpit checks once more."}
            </p>
            <button
              type="button"
              onClick={onContinue}
              disabled={continuing}
              className="c360-btn mt-2.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {continuing ? "Checking…" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* A33.3.6, refined 2026-07-26. On success the HERO opens the record that
          was just filed; the package stays as a secondary link. Everywhere else
          the package is still the only sensible target, because no record was
          created to open. */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        {!revealing && filed ? (
          <>
            <OpenCreatedRecord actionId={actionId} recordId={filed.id} />
            {outcome?.packageCreated === true && outcome.productPackageId ? (
              <OpenCreatedPackage packageId={outcome.productPackageId} />
            ) : (
              <OpenInNcino snapshot={snapshot} secondary />
            )}
          </>
        ) : (
          <>
            <OpenInNcino snapshot={snapshot} />
            {!revealing && (
              <span className="text-[11px] leading-relaxed text-ink-muted">
                {terminal === "partial"
                  ? "Resume from the step above once the cause is cleared."
                  : "Nothing was verified, so there is nothing to open yet."}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
