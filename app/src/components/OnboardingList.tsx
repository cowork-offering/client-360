import { useMemo, useState } from "react";
import { useApp } from "../state/appState";
import { buildOnboardingRows, STAGE_LABEL, TYPE_LABEL, RESULT_LABEL } from "../data/onboarding";
import { STATUS } from "../data/finance";
import { Card, EmptyState } from "./ui";
import { staggerDelay } from "../data/motion";
import { screeningTone } from "./tabs/onboarding/shared";

/* L1, second zone. Same table grammar as the book worklist: same grid, same
   uppercase column head, same row hover, same stagger. Status is coloured text
   in its column, not a badge — a pipeline of five cases with four chips each is
   a wall, and a banker reads columns faster than they read confetti. */

const GRID_COLS = "minmax(220px,2.4fr) minmax(150px,1.3fr) 132px 118px 128px 120px";

export function OnboardingList() {
  const { data, dispatch } = useApp();
  const rows = useMemo(() => buildOnboardingRows(data), [data]);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${TYPE_LABEL[r.type]} ${STAGE_LABEL[r.stage]}`.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-6 py-4">
        <div>
          <div className="kicker">Pipeline</div>
          <div className="mt-0.5 text-[17px] font-bold text-ink">In onboarding</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-ink-muted">
            {filtered.length} of {rows.length} · by stage
          </span>
          <div className="flex items-center gap-2 rounded-md border border-border-strong bg-raised px-2.5 py-1.5">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-none text-ink-faint">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pipeline…"
              className="w-44 bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div
        className="grid items-center gap-4 border-b border-divider px-6 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <span>Prospect</span>
        <span>Type</span>
        <span>Stage</span>
        <span className="text-right">In stage</span>
        <span>Screening</span>
        <span>Blocking</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing in onboarding"
          body="No relationship is being onboarded right now. A case leaves this zone the moment its stage reaches Complete."
        />
      ) : (
        filtered.map((r, i) => (
          <div
            key={r.onboardingId}
            role="button"
            tabIndex={0}
            onClick={() => dispatch({ type: "OPEN_ACCOUNT", accountId: r.accountId })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                dispatch({ type: "OPEN_ACCOUNT", accountId: r.accountId });
              }
            }}
            className="c360-row-in c360-row grid cursor-pointer items-center gap-4 border-b border-divider px-6 py-3.5"
            style={{ gridTemplateColumns: GRID_COLS, animationDelay: staggerDelay(i) }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-bold text-ink">{r.name}</span>
                {r.sample && (
                  <span className="flex-none rounded bg-wash-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-label">sample</span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-ink-muted">
                {r.fromIntake ? "From client intake" : "Opened by the desk"}
                {r.targetDeal ? ` · ${r.targetDeal}` : ""}
              </div>
            </div>
            <span className="truncate text-[12.5px] text-ink-body">{TYPE_LABEL[r.type]}</span>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--accent)" }}>
              {STAGE_LABEL[r.stage]}
            </span>
            <span className="tnum text-right text-[12.5px] font-semibold text-ink">
              {r.daysInStage == null ? "—" : `${r.daysInStage}d`}
            </span>
            <span className="text-[12.5px] font-bold" style={{ color: STATUS[screeningTone(r.screening)].fg }}>
              {RESULT_LABEL[r.screening]}
            </span>
            <span
              className="tnum text-[12.5px] font-bold"
              style={{ color: r.blockingCount ? STATUS.amber.fg : STATUS.green.fg }}
            >
              {r.blockingCount === 0 ? "none" : `${r.blockingCount} open`}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

/** The zone switch. Two zones, one book, counts on both so the banker never has
 *  to click to find out whether anything is waiting on the other side. */
export function ZoneToggle({ bookCount }: { bookCount: number }) {
  const { data, state, dispatch } = useApp();
  const onboardingCount = useMemo(() => buildOnboardingRows(data).length, [data]);

  const zones: Array<{ id: "book" | "onboarding"; label: string; count: number }> = [
    { id: "book", label: "My book", count: bookCount },
    { id: "onboarding", label: "In onboarding", count: onboardingCount },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-[10px] p-1" style={{ background: "var(--wash-2)" }}>
      {zones.map((z) => {
        const active = state.zone === z.id;
        return (
          <button
            key={z.id}
            type="button"
            onClick={() => dispatch({ type: "SET_ZONE", zone: z.id })}
            aria-pressed={active}
            className="c360-press rounded-[8px] px-3.5 py-1.5 text-[12.5px]"
            style={{
              background: active ? "var(--surface-raised)" : "transparent",
              color: active ? "var(--accent)" : "var(--ink-muted)",
              fontWeight: active ? 700 : 600,
              boxShadow: active ? "var(--shadow-card)" : undefined,
            }}
          >
            {z.label}
            <span className="tnum ml-1.5 text-[11.5px] font-bold" style={{ color: active ? "var(--accent)" : "var(--ink-faint)" }}>
              {z.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
