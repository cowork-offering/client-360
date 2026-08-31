import { useApp, ACCOUNT_TABS, type AccountTab } from "../state/appState";
import { readAnchors, type Anchor, type BorrowerBundle } from "../data/contract";
import { STATUS } from "../data/finance";
import { PageContainer } from "./ui";
import { AccentureCaretWatermark, AmbientWash } from "./brand";
import { gradeColor } from "./RiskGrade";
import { PackageStageChip } from "./PackageStage";
import { ACTIONS_TRIGGER_ID } from "./actionsTrigger";
import { TabContent } from "./tabs";
import { SyncButton } from "./SyncSweep";

/** One cell of the anchor/stat strip. Every cell shares this shape; the rating
 *  cell differs ONLY by status-toned value text plus the tick scale (founder
 *  feedback 2026-07-25 — no pill, no box, no orphan header element).
 *  Cells are top-aligned on a fixed min-height so values share a baseline and
 *  the tick row cannot push its neighbours out of line. */
function StatCell({
  label,
  value,
  sub,
  arrow,
  arrowColor,
  valueColor,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  arrow?: string;
  arrowColor?: string;
  valueColor?: string;
  title?: string;
}) {
  return (
    <div
      className="flex min-h-[46px] flex-col justify-center rounded-[9px] px-3 py-2"
      style={{ background: "var(--surface-overlay)" }}
      title={title}
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-label">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tnum text-[14px] font-bold" style={valueColor ? { color: valueColor } : undefined}>
          {value}
        </span>
        {arrow && (
          <span className="text-[12px] font-bold" style={{ color: arrowColor }}>
            {arrow}
          </span>
        )}
        {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
      </span>
    </div>
  );
}

/** True for the strip's rating cell, whatever the agent labelled it. */
function isRatingAnchor(a: Anchor): boolean {
  return /^(risk\s*)?(rating|grade)$/i.test(a.label.trim());
}

function AnchorCell({ a, grade }: { a: Anchor; grade: string | null }) {
  const arrow = a.dir === "down" ? "↓" : a.dir === "up" ? "↑" : "";
  const arrowColor = a.dir === "down" ? STATUS.red.fg : a.dir === "up" ? STATUS.green.fg : "transparent";

  if (!isRatingAnchor(a)) {
    return <StatCell label={a.label} value={a.value} sub={a.sub} arrow={arrow} arrowColor={arrowColor} />;
  }

  // Rating cell. The agent's `sub` here is the package STAGE, which A28.2 moved
  // out to its own labelled chip beside the borrower name — so it is not
  // repeated inside this cell. The caption slot carries provenance instead.
  return <StatCell label={a.label} value={a.value} valueColor={gradeColor(grade) ?? undefined} title="nCino risk rating" />;
}

export function AccountWorkspace({ bundle }: { bundle: BorrowerBundle }) {
  const { data, state, dispatch } = useApp();
  const snap = bundle.snapshot;
  const account = data.portfolio.accounts.find((a) => a.accountId === state.accountId);
  const name = account?.name ?? snap?.name ?? "—";
  const sector = [snap?.industry, snap?.naicsCode ? `NAICS ${snap.naicsCode}` : null].filter(Boolean).join(" · ") || "—";
  const grade = snap?.primaryRiskRating ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Verdict bar — frosted, un-transformed at the top level (Safari
          backdrop-filter rule: never nest blur in a rounded+transformed box). */}
      <div
        className="sticky top-0"
        style={{
          zIndex: "var(--z-verdict)",
          background: "var(--frost-bar)",
          backdropFilter: "blur(18px) saturate(1.5)",
          WebkitBackdropFilter: "blur(18px) saturate(1.5)",
          boxShadow: "var(--frost-shadow)",
        }}
      >
        <PageContainer className="relative overflow-hidden py-4">
          <AmbientWash />
          <AccentureCaretWatermark />
          <div className="relative min-w-0 flex-1">
            <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-ink-label">
              {/* `goHome` is the mint's own id for this control (design/probes
                  addresses it by that name). The hero it sits in is Surface 2's
                  to re-cut; the hook is here now so the acceptance harness can
                  walk back to the worklist between surfaces. */}
              <button
                type="button"
                id="goHome"
                onClick={() => dispatch({ type: "GO_HOME" })}
                className="inline-flex items-center gap-1.5 font-bold"
                style={{ color: "var(--accent)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <path d="M9 3L5 7l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Worklist
              </button>
              <span style={{ color: "var(--crumb-sep)" }}>/</span>
              <span>{sector}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[28px] font-extrabold leading-tight tracking-tight">{name}</span>
              <PackageStageChip snapshot={snap} />
            </div>
            {bundle.verdict && (
              <div className="my-2 max-w-[760px] text-[14px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
                {bundle.verdict}
              </div>
            )}
            {/* Stat strip + the two triggers on ONE row, right-aligned to the
                same grid so nothing floats free (founder feedback 2026-07-25).
                Sync is secondary; Client Actions keeps the accent. */}
            <div className="mt-3 flex flex-wrap items-stretch gap-2.5">
              {readAnchors(bundle).map((a) => (
                <AnchorCell key={a.label} a={a} grade={grade} />
              ))}
              <span className="ml-auto flex items-center gap-2 self-center">
                <SyncButton accountId={snap.accountId} accountName={name} bundle={bundle} />
                <button
                  id={ACTIONS_TRIGGER_ID}
                  type="button"
                  onClick={() => dispatch({ type: "SET_PANEL", panel: state.panel === "actions" ? "none" : "actions" })}
                  aria-expanded={state.panel === "actions"}
                  className="c360-press c360-accent-btn inline-flex flex-none items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-semibold"
                >
                  <svg width="13" height="13" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M3 5.4h12M3 9h12M3 12.6h7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Client Actions
                </button>
              </span>
            </div>
          </div>
        </PageContainer>

        {/* Tab rail */}
        <div className="border-t border-divider">
          <PageContainer className="no-scrollbar flex gap-1 overflow-x-auto">
            {ACCOUNT_TABS.map((t) => {
              const active = state.tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => dispatch({ type: "SET_TAB", tab: t.id as AccountTab })}
                  className="c360-press whitespace-nowrap px-3 pb-3 pt-3.5 text-[13.5px]"
                  style={{
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--accent)" : "var(--ink-muted)",
                    borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </PageContainer>
        </div>
      </div>

      {/* Tab content — re-keyed per tab so the cross-fade replays on switch */}
      <PageContainer className="py-6">
        <div key={state.tab} className="c360-tab-in">
          <TabContent tab={state.tab} bundle={bundle} />
        </div>
      </PageContainer>
    </div>
  );
}
