import type { BorrowerBundle } from "../../data/contract";
import { aggregateGuarantorSignals } from "../../data/graphAggregate";
import { fmtDate } from "../../data/format";
import { arc, covenantCushion, fmtCovThreshold, fmtCovVal, STATUS, type Tone } from "../../data/finance";
import { Card, SectionHead, EmptyState, NoteCaption } from "../ui";
import { useEnterTransition } from "../../data/motion";

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
  for (const c of covs) {
    const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
    if (c.breached === true || cu.safe === false) {
      ews.push({
        title: "Covenant at threshold · " + (c.covenantType ?? ""),
        severity: "Critical",
        body: "Actual " + fmtCovVal(c.actualValue) + " vs " + fmtCovThreshold(c.covenantType, c.actualValue, c.thresholdValue),
        date: c.lastEvaluationDate ? fmtDate(c.lastEvaluationDate) : "",
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
                <div key={i} className="flex gap-3">
                  <div className="flex flex-none flex-col items-center">
                    <div className="mt-0.5 h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                    {i < ews.length - 1 && <div className="my-1 w-0.5 flex-1" style={{ background: "var(--border)" }} />}
                  </div>
                  <div className="pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold">{e.title}</span>
                      <span className="rounded-[5px] px-2 py-0.5 text-[10px] font-bold" style={{ background: STATUS[tone].bg, color: STATUS[tone].fg }}>
                        {e.severity}
                      </span>
                    </div>
                    <div className="my-1 text-[12.5px] text-ink-body-strong" style={{ textWrap: "pretty" as never }}>{e.body}</div>
                    {e.date && <div className="text-[11px] text-ink-faint">{e.date}</div>}
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState title="No structural signals" body="No modification clustering, renewal, guarantor-distress, or breached-covenant signals on file." />
          )}
        </Card>

        <Card className="flex flex-col items-center px-6 py-5 text-center">
          <div className="kicker mb-4 self-start">Renewal clock</div>
          {nearest && nearest.daysUntilMaturity != null ? (
            (() => {
              const days = nearest.daysUntilMaturity!;
              const arcPct = Math.max(0, Math.min(100, Math.round((1 - days / MATURITY_WINDOW_DAYS) * 100)));
              const a = arc(arcPct, 52);
              const tone: Tone = days < 45 ? "red" : days < 120 ? "amber" : "green";
              return (
                <>
                  <div className="relative h-[130px] w-[130px]">
                    <svg width="130" height="130" viewBox="0 0 130 130" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
                      <circle cx="65" cy="65" r="52" fill="none" stroke="var(--border)" strokeWidth="9" />
                      <circle className="c360-dial" cx="65" cy="65" r="52" fill="none" stroke={STATUS[tone].fg} strokeWidth="9" strokeLinecap="round" strokeDasharray={a.c} strokeDashoffset={entered ? a.off : a.c} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[24px] font-extrabold" style={{ color: STATUS[tone].fg }}>{days}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">days</span>
                    </div>
                  </div>
                  <div className="mt-4 text-[13px] leading-relaxed text-ink-body-strong" style={{ textWrap: "pretty" as never }}>
                    {nearest.name ?? "Facility"} matures {fmtDate(nearest.maturityDate)}.
                  </div>
                </>
              );
            })()
          ) : (
            <EmptyState title="No maturities in window" body="No facilities maturing within the watch window (270 days)." />
          )}
        </Card>
      </div>
      <NoteCaption note={sig.note} />
    </div>
  );
}
