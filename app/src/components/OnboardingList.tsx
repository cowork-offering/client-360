import { useMemo, useState } from "react";
import { useApp, ZONE_NAME, ZONE_SPOKEN } from "../state/appState";
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
          <div className="zone-name mt-0.5 text-[15px] text-ink">{ZONE_NAME.onboarding}</div>
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
          title="Nothing in the pipeline"
          body={`No relationship is being onboarded right now. A case leaves ${ZONE_NAME.onboarding} the moment its stage reaches Complete.`}
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

/**
 * The zone switch.
 *
 * Two zones, one book, counts on both so the banker never has to click to find
 * out whether anything is waiting on the other side. It is the app's primary
 * navigation instrument, so it carries the frosted treatment the sticky bars
 * use and sits slightly proud of the table beneath it.
 *
 * The active state is ONE sliding thumb rather than a per-segment background:
 * the eye follows a moving object, and a control where the highlight travels
 * reads as one instrument instead of two buttons that happen to be adjacent.
 * Every segment holds its box, so nothing reflows while it moves.
 */
export function ZoneToggle({ bookCount }: { bookCount: number }) {
  const { data, state, dispatch } = useApp();
  const onboardingCount = useMemo(() => buildOnboardingRows(data).length, [data]);

  const zones: Array<{ id: "book" | "onboarding"; label: string; spoken: string; count: number; unit: string }> = [
    {
      id: "book",
      label: ZONE_NAME.book,
      spoken: ZONE_SPOKEN.book,
      count: bookCount,
      unit: bookCount === 1 ? "relationship" : "relationships",
    },
    {
      id: "onboarding",
      label: ZONE_NAME.onboarding,
      spoken: ZONE_SPOKEN.onboarding,
      count: onboardingCount,
      unit: onboardingCount === 1 ? "case" : "cases",
    },
  ];
  const index = Math.max(0, zones.findIndex((z) => z.id === state.zone));

  /** Arrow keys move the selection, which is what a radiogroup owes its user.
   *  Roving tabindex keeps the group one Tab stop. */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = zones[(index + step + zones.length) % zones.length];
    dispatch({ type: "SET_ZONE", zone: next.id });
    // Focus follows selection, per the radiogroup pattern.
    (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[zones.indexOf(next)])?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Portfolio zone"
      onKeyDown={onKeyDown}
      className="relative inline-grid grid-cols-2 rounded-[13px] p-1"
      style={{
        background: "var(--frost-nav)",
        backdropFilter: "blur(18px) saturate(1.5)",
        WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        border: "1px solid var(--border)",
        boxShadow: "var(--frost-shadow)",
      }}
    >
      {/* The thumb. One element, absolutely placed over the left column and
          translated by a full column width — so the travel is exact whatever
          the labels say. */}
      <span
        aria-hidden="true"
        className="c360-zone-thumb pointer-events-none absolute rounded-[10px]"
        style={{
          top: 4,
          bottom: 4,
          left: 4,
          width: "calc(50% - 4px)",
          background: "var(--surface-raised)",
          boxShadow: "var(--shadow-card)",
          transform: `translate3d(${index * 100}%, 0, 0)`,
        }}
      />

      {zones.map((z) => {
        const active = state.zone === z.id;
        return (
          <button
            key={z.id}
            type="button"
            role="radio"
            aria-checked={active}
            /* The visible name is set caps; this is the same name as words, so
               a screen reader says it rather than spelling it. */
            aria-label={`${z.spoken}, ${z.count} ${z.unit}`}
            tabIndex={active ? 0 : -1}
            onClick={() => dispatch({ type: "SET_ZONE", zone: z.id })}
            /* `relative` alone stacks it over the thumb: both are positioned,
               and the button is later in the DOM. No z-index needed. */
            className="c360-press relative rounded-[10px] px-4 py-2 text-left"
            style={{ background: "transparent" }}
          >
            <span
              className="c360-zone-label zone-name block text-[11.5px] leading-tight"
              style={{ color: active ? "var(--accent)" : "var(--ink-muted)", fontWeight: active ? 800 : 700 }}
            >
              {z.label}
            </span>
            <span
              className="c360-zone-label mt-0.5 block text-[10.5px] leading-tight"
              style={{ color: active ? "var(--ink-body)" : "var(--ink-label)" }}
            >
              <span className="tnum font-bold">{z.count}</span> {z.unit}
            </span>
          </button>
        );
      })}
    </div>
  );
}
