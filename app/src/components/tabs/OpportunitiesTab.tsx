import type { BorrowerBundle } from "../../data/contract";
import { fmtMoney, fmtDate } from "../../data/format";
import { Card, SectionHead, EmptyState, NoteCaption } from "../ui";
import { staggerDelay } from "../../data/motion";

const EXPLAIN =
  "Explain the Opportunities & Whitespace tab — the next best actions, the open pipeline, and the standing deposit cross-sell story.";

interface Nba {
  title: string;
  value: string;
  meta: string;
}

export function OpportunitiesTab({ bundle }: { bundle: BorrowerBundle }) {
  const opps = bundle.opportunities?.opportunities ?? [];

  const nbas: Nba[] = opps.map((o) => ({
    title: o.name ?? "Opportunity",
    value: (o.amount != null ? fmtMoney(o.amount) : "") + (o.closeDate ? ` · closes ${fmtDate(o.closeDate)}` : ""),
    meta: o.stage ?? "",
  }));
  nbas.push({ title: "Win the operating deposits", value: "Standing cross-sell · no wallet on file", meta: "Treasury" });

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Opportunities & Whitespace" explain={EXPLAIN} />

      <Card className="py-1">
        <div className="kicker px-6 pb-2 pt-4">Next best actions</div>
        {nbas.map((n, i) => (
          <div key={i} className="c360-row-in flex items-center gap-4 border-t border-divider px-6 py-3.5" style={{ animationDelay: staggerDelay(i) }}>
            <span className="w-6 flex-none text-[14px] font-extrabold text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold">{n.title}</div>
              <div className="mt-0.5 text-[12px] text-ink-muted">{n.value}</div>
            </div>
            {n.meta && (
              <span className="flex-none whitespace-nowrap rounded-[8px] px-3 py-2 text-[12px] font-semibold text-ink-body-strong" style={{ background: "var(--surface-overlay)" }}>
                {n.meta}
              </span>
            )}
          </div>
        ))}
      </Card>

      {/* Whitespace — deposit cross-sell (honest: no wallet size invented) */}
      <div className="rounded-[14px] px-6 py-5" style={{ background: "linear-gradient(135deg, color-mix(in srgb,var(--accent) 7%,var(--surface-raised)), color-mix(in srgb,var(--accent) 13%,var(--surface-raised)))" }}>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>The cross-sell story</div>
        <div className="text-[15px] font-semibold leading-relaxed" style={{ color: "var(--prose-deep)", textWrap: "pretty" as never }}>
          This borrower holds committed credit but no operating balances at the bank. The standing next best action is the treasury
          conversation — capture the operating account, payroll, and treasury-management wallet. No wallet size is estimated here (the
          source org carries no deposit data to size it against).
        </div>
      </div>

      {opps.length === 0 && (
        <Card className="py-1">
          <EmptyState title="No open opportunities" body="No open opportunities on file, beyond the standing deposit cross-sell." />
        </Card>
      )}

      <NoteCaption note={bundle.opportunities?.note} />
    </div>
  );
}
