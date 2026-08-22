import type { BorrowerBundle } from "../../data/contract";
import { aggregateGuarantorSignals } from "../../data/graphAggregate";
import { fmtDate } from "../../data/format";
import { arc, fmtCovThreshold, fmtCovVal, STATUS, type Tone } from "../../data/finance";
import { classifyCovenant } from "../../domain/covenantStatus";
import { Card, SectionHead, EmptyState, NoteCaption } from "../ui";
import { staggerDelay, useEnterTransition } from "../../data/motion";

const EXPLAIN =
  "Explain the early-warning signals here and the nearest maturity.";

/** Renewal-clock window. DERIVED constant, matches MATURITY_NEAR_WINDOW_DAYS
 *  in data/worklist.ts and the legacy artifact's 270-day watch window (A26.1). */
const MATURITY_WINDOW_DAYS = 270;

type Severity = "Critical" | "Watch" | "Info";
interface Ews {
  title: string;
  severity: Severity;
  body: string;
  date: string;
}

function sevTone(s: Severity): Tone {
  return s === "Critical" ? "red" : s === "Watch" ? "amber" : "neutral";
}

export function SignalsTab({ bundle }: { bundle: BorrowerBundle }) {
  const entered = useEnterTransition();
  const sig = bundle.signals ?? {};
  const covs = bundle.covenants?.covenants ?? [];
  const ews: Ews[] = [];

  const mods = sig.modifications ?? [];
  if (mods.length) {
    const m0 = mods[0];
    const modType = (m0.modificationType as string) || (m0.modType as string) || "modification";
    const eff = (m0.effectiveDate as string) || (m0.date as string) || "";
    ews.push({
      title: "Loan modification" + (mods.length > 1 ? `s (${mods.length})` : ""),
      severity: sig.modificationClusterFlag ? "Watch" : "Info",
      body: (sig.modificationClusterFlag ? "Modification cluster — a pattern, not a single accommodation. " : "") + "Most recent: " + modType + (eff ? ` (${fmtDate(eff)})` : ""),
      date: eff ? fmtDate(eff) : "",
    });
  }
  // ONE ROW PER GUARANTOR. The org records the involvement against every loan,
  // so a guarantor on six facilities arrives as six identical signals; six
  // copies of one alert is not six alerts, and rendering them that way buries
  // everything underneath.
  for (const g of aggregateGuarantorSignals(sig.guarantorSignals as Array<Record<string, unknown>> | undefined)) {
    if (g.riskStatus || g.highestRiskGrade) {
      const across = g.facilityCount > 1 ? ` · across ${g.facilityCount} facilities` : "";
      ews.push({
        title: "Guarantor signal · " + (g.guarantorName ?? "guarantor") + across,
        severity: g.highestRiskGrade && /[6-9]/.test(String(g.highestRiskGrade)) ? "Watch" : "Info",
        body: "Risk status " + (g.riskStatus ?? "—") + (g.highestRiskGrade ? `, highest grade ${g.highestRiskGrade}` : ""),
        date: "",
      });
    }
  }
  for (const r of sig.renewals ?? []) {
    ews.push({
      title: "Renewal in progress",
      severity: "Info",
      body: "Revision " + (r.revisionNumber ?? "—") + " · " + (r.revisionStatus ?? "") + (r.hasActiveRenewalLoan ? " · active renewal loan" : ""),
      date: "",
    });
  }
  // A measured miss is Critical. An administrative Exception is a Watch and says
  // what it is: nCino forces that status on an elapsed Due Date whether or not
  // anything was measured (domain/covenantStatus.ts).
  for (const c of covs) {
    const verdict = classifyCovenant(c);
    const date = c.lastEvaluationDate ? fmtDate(c.lastEvaluationDate) : "";
    if (verdict.financialBreach) {
      ews.push({
        title: "Covenant at threshold · " + (c.covenantType ?? ""),
        severity: "Critical",
        body: verdict.measured
          ? "Actual " + fmtCovVal(c.actualValue, c.covenantType) + " vs " + fmtCovThreshold(c.covenantType, c.actualValue, c.thresholdValue)
          : verdict.explanation,
        date,
      });
    } else if (verdict.kind === "exception") {
      ews.push({
        title: "Covenant exception · " + (c.covenantType ?? ""),
        severity: "Watch",
        body: verdict.explanation,
        date,
      });
    }
  }

  // Renewal clock — nearest maturity.
  const mw = sig.maturityWatch ?? [];
  let nearest: { daysUntilMaturity?: number; name?: string; maturityDate?: string } | null = null;
  for (const m of mw) {
    if (m.daysUntilMaturity != null && (nearest === null || m.daysUntilMaturity < (nearest.daysUntilMaturity ?? Infinity))) nearest = m;
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Structural Signals" explain={EXPLAIN} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="px-6 py-5">
          <div className="kicker mb-4">Early-warning signals</div>
          {ews.length ? (
            ews.map((e, i) => {
              const tone = sevTone(e.severity);
              const dot = e.severity === "Critical" ? STATUS.red.fg : e.severity === "Watch" ? STATUS.amber.fg : "var(--ink-label)";
              return (
                <div key={i} className="c360-row-in flex gap-3.5" style={{ animationDelay: staggerDelay(i) }}>
                  {/* rail — dot on the title's optical centre, connector below */}
                  <div className="flex w-2.5 flex-none flex-col items-center">
                    <span
                      className="mt-[5px] h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: dot, boxShadow: `0 0 0 3px ${STATUS[tone].bg}` }}
                    />
                    {i < ews.length - 1 && <span className="my-1 w-px flex-1" style={{ background: "var(--border)" }} />}
                  </div>
                  <div className="min-w-0 flex-1 pb-4 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="text-[13px] font-bold">{e.title}</span>
                      {/* Severity is a status fact: coloured text, not a pill. */}
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: STATUS[tone].fg }}
                      >
                        {e.severity}
                      </span>
                    </div>
                    <div className="mt-1 text-[12.5px] leading-relaxed text-ink-body-strong" style={{ textWrap: "pretty" as never }}>
                      {e.body}
                    </div>
                    {e.date && <div className="mt-1 text-[11px] text-ink-faint">{e.date}</div>}
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState title="No structural signals" body="No modification clustering, renewal, guarantor-distress, covenant-breach or covenant-exception signals on file." />
          )}
        </Card>

        {/* Renewal clock. The dial is the one thing on this surface that earns
            being centred — it is radial. Everything around it (kicker, verdict
            line, window caption) is left-aligned on the card's own margin, so
            the panel no longer reads as a ragged centred column. */}
        <Card className="px-6 py-5">
          <div className="kicker">Renewal clock</div>
          {nearest && nearest.daysUntilMaturity != null ? (
            (() => {
              const days = nearest.daysUntilMaturity!;
              const arcPct = Math.max(0, Math.min(100, Math.round((1 - days / MATURITY_WINDOW_DAYS) * 100)));
              const a = arc(arcPct, 52);
              const tone: Tone = days < 45 ? "red" : days < 120 ? "amber" : "green";
              return (
                <>
                  <div className="flex flex-1 items-center justify-center py-5">
                    <div className="relative h-[142px] w-[142px]">
                      <svg
                        width="142"
                        height="142"
                        viewBox="0 0 130 130"
                        style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
                      >
                        <circle cx="65" cy="65" r="52" fill="none" stroke="var(--border)" strokeWidth="9" />
                        <circle
                          className="c360-dial"
                          cx="65"
                          cy="65"
                          r="52"
                          fill="none"
                          stroke={STATUS[tone].fg}
                          strokeWidth="9"
                          strokeLinecap="round"
                          strokeDasharray={a.c}
                          strokeDashoffset={entered ? a.off : a.c}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="tnum text-[30px] font-extrabold leading-none tracking-tight" style={{ color: STATUS[tone].fg }}>
                          {days}
                        </span>
                        <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">days</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[13px] leading-relaxed text-ink-body-strong" style={{ textWrap: "pretty" as never }}>
                    {nearest.name ?? "Facility"} matures {fmtDate(nearest.maturityDate)}.
                  </div>
                  <div className="mt-2 border-t border-divider pt-2.5 text-[11px] text-ink-faint">
                    Against a {MATURITY_WINDOW_DAYS}-day watch window.
                  </div>
                </>
              );
            })()
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title="No maturities in window" body="No facilities maturing within the watch window (270 days)." />
            </div>
          )}
        </Card>
      </div>
      <NoteCaption note={sig.note} />
    </div>
  );
}
