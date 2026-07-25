import { useApp } from "../state/appState";
import { fmtMoney, fmtPct } from "../data/format";
import { useCountUp, staggerDelay } from "../data/motion";
import { mcpAvailable } from "../channel/mcp";
import { useLivePortfolio } from "../channel/useLivePortfolio";
import { fmtRelative } from "../data/format";

type Tone = "neutral" | "warning" | "critical";

interface Kpi {
  label: string;
  /** Raw figure for the count-up; formatting stays with the presenter so the
   *  tween runs on the number, not on a string. Null renders an honest "—". */
  raw: number | null;
  format: (n: number) => string;
  sub: string;
  tone?: Tone;
}

const toneColor: Record<Tone, string> = {
  neutral: "var(--ink)",
  warning: "var(--warning)",
  critical: "var(--critical)",
};

const asCount = (n: number) => String(Math.round(n));

/** One cell — counts its figure up on mount (A25.4). Resolves to the final
 *  value immediately under reduced motion / jsdom (see data/motion.ts). */
function KpiCell({ kpi, index }: { kpi: Kpi; index: number }) {
  const animated = useCountUp(kpi.raw ?? 0);
  return (
    <div
      className="c360-row-in min-w-[150px] flex-1 px-5 py-4"
      style={{
        borderLeft: index === 0 ? "none" : "1px solid var(--divider-soft)",
        animationDelay: staggerDelay(index, 28),
      }}
    >
      <div className="text-[11.5px] font-semibold text-ink-label">{kpi.label}</div>
      <div className="tnum my-1 text-[26px] font-extrabold tracking-tight" style={{ color: toneColor[kpi.tone ?? "neutral"] }}>
        {kpi.raw == null ? "—" : kpi.format(animated)}
      </div>
      <div className="text-[12px] text-ink-muted">{kpi.sub}</div>
    </div>
  );
}

export function KpiBand() {
  const { data, worklist } = useApp();
  // Live book totals when the capability is present; the staged snapshot
  // otherwise. A failed refresh keeps the staged figures visible.
  const live = useLivePortfolio(mcpAvailable());
  const pf = live.portfolio ?? data.portfolio ?? { accounts: [] };
  const accts = pf.accounts ?? [];

  let sumTce = 0;
  let sumOut = 0;
  for (const a of accts) {
    sumTce += a.tce ?? 0;
    sumOut += a.outstanding ?? 0;
  }
  const bt = pf.bookTotals ?? {};
  const committed = bt.totalCommitted ?? sumTce;
  const drawn = bt.totalOutstanding ?? sumOut;
  const acctCount = bt.accountCount ?? accts.length;
  const util = bt.utilizationPct ?? (committed > 0 ? (drawn / committed) * 100 : null);

  const sig = pf.signals;
  const due = sig?.covenantsDueSoon ?? [];
  const overdue = due.filter((c) => c.overdue === true).length;
  const breached = sig?.breachedCount ?? 0;
  const maturities = (sig?.maturitiesSoon ?? []).length;

  const kpis: Kpi[] = [
    { label: "Managed exposure", raw: committed, format: fmtMoney, sub: `Committed · ${acctCount} rel.` },
    { label: "Drawn balance", raw: drawn, format: fmtMoney, sub: "Across the book" },
    { label: "Utilization", raw: util, format: (n) => fmtPct(n), sub: "Drawn / committed" },
    { label: "Relationships", raw: acctCount, format: asCount, sub: "Accounts in book" },
    {
      label: "Needs action",
      raw: worklist.accountIds.length,
      format: asCount,
      sub: "On the queue",
      tone: worklist.accountIds.length > 0 ? "warning" : "neutral",
    },
    {
      label: "Reviews due",
      raw: due.length,
      format: asCount,
      sub: overdue > 0 ? `${overdue} overdue` : "None overdue",
      tone: overdue > 0 ? "warning" : "neutral",
    },
    {
      label: "EWS active",
      raw: breached + maturities,
      format: asCount,
      sub:
        [breached > 0 ? `${breached} breached` : null, maturities > 0 ? `${maturities} maturity` : null]
          .filter(Boolean)
          .join(" · ") || "None in window",
      tone: breached > 0 ? "critical" : maturities > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <div className="overflow-hidden rounded-[16px] bg-raised" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex flex-wrap">
        {kpis.map((k, i) => (
          <KpiCell key={k.label} kpi={k} index={i} />
        ))}
      </div>
      {(live.storedAt != null || live.failure) && (
        <div className="flex items-center gap-2 border-t border-divider px-5 py-1.5 text-[10.5px]">
          {live.storedAt != null && (
            <span className="text-ink-faint">
              Live book data as of {fmtRelative(new Date(live.storedAt).toISOString(), data.meta?.generatedAt ?? "")}
            </span>
          )}
          {live.failure && (
            <span style={{ color: live.failure.retract ? "var(--critical)" : "var(--warning)" }}>{live.failure.fix}</span>
          )}
        </div>
      )}
    </div>
  );
}
