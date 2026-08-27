import type { BorrowerBundle, Covenant } from "../../data/contract";
import { fmtMoney, fmtPct } from "../../data/format";
import { fmtRatio, STATUS } from "../../data/finance";
import { Card, SectionHead, EmptyState, NoteCaption } from "../ui";
import { staggerDelay, useEnterTransition } from "../../data/motion";

const EXPLAIN =
  "Explain these financials: the EBITDA trend, leverage, and interest coverage.";

function findLeverage(covs: Covenant[]): Covenant | null {
  for (const c of covs) {
    const t = (c.covenantType ?? "").toLowerCase();
    if (t.includes("leverage") || t.includes("debt-to-worth") || t.includes("debt to worth")) return c;
  }
  return null;
}

function Gauge({
  label,
  val,
  sub,
  threshLabel,
  scaleMax,
  threshVal,
  higherIsWorse,
}: {
  label: string;
  val?: number;
  sub: string;
  threshLabel: string;
  scaleMax: number;
  threshVal: number | null;
  higherIsWorse: boolean;
}) {
  const entered = useEnterTransition();
  const fillPct = val != null ? Math.min(100, Math.round((val / scaleMax) * 100)) : 0;
  const threshPct = threshVal != null ? Math.round((threshVal / scaleMax) * 100) : null;
  let color = STATUS.green.fg;
  if (val != null && threshVal != null) {
    color = higherIsWorse
      ? val > threshVal ? STATUS.red.fg : threshVal - val < 0.4 ? STATUS.amber.fg : STATUS.green.fg
      : val < threshVal ? STATUS.red.fg : val - threshVal < 0.4 ? STATUS.amber.fg : STATUS.green.fg;
  } else if (val == null) {
    color = "var(--ink-faint)";
  }
  return (
    <Card className="px-6 py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink-body-strong">{label}</span>
        <span className="text-[20px] font-extrabold" style={{ color }}>{fmtRatio(val)}</span>
      </div>
      <div className="relative h-2.5 rounded-[6px]" style={{ background: "var(--border)" }}>
        <div className="c360-meter-x h-full w-full rounded-[6px]" style={{ transform: `scaleX(${entered ? fillPct / 100 : 0})`, background: color }} />
        {threshPct != null && (
          <div className="absolute w-0.5" style={{ top: -4, bottom: -4, left: `${threshPct}%`, background: "var(--ink)" }} />
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-label">
        <span>{sub}</span>
        <span>{threshLabel}</span>
      </div>
    </Card>
  );
}

const IS_COLS = "1.7fr 1fr 1fr 1fr";
/** Gauge axis maximum. PRESENTATION constant (chart scale), not a business
 *  figure — no covenant/threshold value is ever hardcoded (A26.1). */
const GAUGE_SCALE_MAX = 6;

export function FinancialsTab({ bundle }: { bundle: BorrowerBundle }) {
  const entered = useEnterTransition();
  const boom = bundle.boom;
  if (!boom || (!boom.spread && !boom.ratios)) {
    return (
      <Card className="p-6">
        <SectionHead kicker="Financials" explain={EXPLAIN} />
        <EmptyState
          title="Boom spread not fetched this session"
          body="Ask for the spread and it fills in."
        />
      </Card>
    );
  }

  const spread = boom.spread ?? {};
  const ratios = boom.ratios ?? {};
  const periods = spread.periods ?? [];
  const covs = bundle.covenants?.covenants ?? [];
  const levCov = findLeverage(covs);
  const maxRev = Math.max(0, ...periods.map((p) => p.revenue ?? 0));
  const items = spread.lineItems ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Financials · Boom spreading" explain={EXPLAIN} />

      {periods.length > 0 && (
        <Card className="px-6 py-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="kicker">Revenue &amp; EBITDA</div>
            <div className="flex gap-4 text-[11.5px] text-ink-body">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--chart-bar-1)" }} />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--chart-bar-2)" }} />EBITDA</span>
            </div>
          </div>
          <div className="flex h-[172px] items-end gap-5 px-2">
            {periods.map((p, i) => {
              const rH = maxRev > 0 ? Math.round(((p.revenue ?? 0) / maxRev) * 160) : 0;
              const eH = maxRev > 0 ? Math.round(((p.ebitda ?? 0) / maxRev) * 160) : 0;
              return (
                <div key={i} className="flex h-full flex-1 items-end justify-center gap-1.5">
                  <div className="c360-meter-y w-[26px] rounded-t" style={{ height: rH, transform: `scaleY(${entered ? 1 : 0})`, background: "var(--chart-bar-1)" }} />
                  <div className="c360-meter-y w-[26px] rounded-t" style={{ height: eH, transform: `scaleY(${entered ? 1 : 0})`, background: "var(--chart-bar-2)" }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-5 border-t border-divider px-2 pt-3">
            {periods.map((p, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="text-[12px] font-bold">{p.period ?? ""}</div>
                <div className="mt-px text-[11px] font-semibold text-ink-muted">{p.margin != null ? fmtPct(p.margin) : ""}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Gauge
          label="Total Leverage"
          val={ratios.totalLeverage}
          sub="Debt / EBITDA"
          threshLabel={levCov?.thresholdValue != null ? `Covenant ${fmtRatio(levCov.thresholdValue)}` : "No leverage covenant"}
          scaleMax={GAUGE_SCALE_MAX}
          threshVal={levCov?.thresholdValue ?? null}
          higherIsWorse
        />
        <Gauge label="Interest Coverage" val={ratios.interestCoverage} sub="EBITDA / Interest" threshLabel="" scaleMax={GAUGE_SCALE_MAX} threshVal={null} higherIsWorse={false} />
      </div>

      {items.length > 0 && (
        <Card className="py-1">
          <div className="kicker px-6 pb-1.5 pt-4">Income statement · LTM vs prior year</div>
          <div className="grid gap-3 px-6 py-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint" style={{ gridTemplateColumns: IS_COLS }}>
            <span>Line</span><span className="text-right">LTM</span><span className="text-right">Prior FY</span><span className="text-right">Change</span>
          </div>
          {items.map((r, i) => {
            const chg = r.ltm != null && r.priorFy != null && r.priorFy !== 0 ? ((r.ltm - r.priorFy) / Math.abs(r.priorFy)) * 100 : null;
            const chgColor = chg == null ? "var(--ink-body)" : chg < 0 ? STATUS.amber.fg : STATUS.green.fg;
            const chgTxt = chg == null ? "—" : (chg >= 0 ? "+" : "−") + Math.abs(chg).toFixed(1) + "%";
            return (
              <div key={i} className="c360-row-in grid items-center gap-3 border-t border-divider px-6 py-3 text-[13px]" style={{ gridTemplateColumns: IS_COLS, animationDelay: staggerDelay(i) }}>
                <span className="font-semibold">{r.line ?? ""}</span>
                <span className="tnum text-right font-bold">{fmtMoney(r.ltm)}</span>
                <span className="tnum text-right text-ink-body">{fmtMoney(r.priorFy)}</span>
                <span className="tnum text-right font-bold" style={{ color: chgColor }}>{chgTxt}</span>
              </div>
            );
          })}
        </Card>
      )}

      <NoteCaption note={boom.note ?? (spread.sourceFile ? `Source: Boom spreading — ${spread.sourceFile}` : "Source: Boom spreading")} />
    </div>
  );
}
