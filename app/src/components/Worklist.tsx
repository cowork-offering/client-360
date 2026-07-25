import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useApp } from "../state/appState";
import { buildWorklistRows, type WorklistRow } from "../data/worklistRows";
import { fmtMoney, fmtDate, fmtDays } from "../data/format";
import type { ReasonCode } from "../data/contract";
import { REASON_META } from "./reasons";
import { ReasonChips } from "./ReasonChip";
import { GradeBadge } from "./GradeBadge";
import { CopyPromptDialog } from "./CopyPromptDialog";
import { Card } from "./ui";
import { staggerDelay } from "../data/motion";

const ALL_REASONS = Object.keys(REASON_META) as ReasonCode[];
const col = createColumnHelper<WorklistRow>();
const GRID_COLS = "minmax(220px,2.4fr) minmax(150px,1.4fr) 104px 108px 132px 132px 120px";

function DayCell({ days, date, warnAt }: { days: number | null; date: string | null; warnAt: number }) {
  if (days == null && !date) return <span className="text-ink-faint">—</span>;
  const tone = days == null ? "var(--ink-muted)" : days < 0 ? "var(--critical)" : days <= warnAt ? "var(--warning)" : "var(--ink)";
  return (
    <div className="leading-tight">
      <div className="tnum text-[12.5px] font-semibold" style={{ color: tone }}>{fmtDays(days)}</div>
      <div className="text-[10.5px] text-ink-faint">{fmtDate(date)}</div>
    </div>
  );
}

export function Worklist() {
  const { data, worklist, dispatch } = useApp();
  const rows = useMemo(() => buildWorklistRows(data, worklist), [data, worklist]);

  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [reasonFilter, setReasonFilter] = useState<Set<ReasonCode>>(new Set());
  const [unstaged, setUnstaged] = useState<WorklistRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.industry} ${r.naicsCode ?? ""}`.toLowerCase().includes(q)) return false;
      if (reasonFilter.size && !r.reasons.some((c) => reasonFilter.has(c))) return false;
      return true;
    });
  }, [rows, search, reasonFilter]);

  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Account",
        cell: (c) => {
          const r = c.row.original;
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-bold text-ink">{r.name}</span>
                {r.sample && (
                  <span className="flex-none rounded bg-wash-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-label">sample</span>
                )}
                {!r.staged && (
                  <span className="flex-none rounded border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-faint">not staged</span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-ink-muted">
                {r.industry}
                {r.naicsCode ? ` · NAICS ${r.naicsCode}` : ""}
              </div>
            </div>
          );
        },
      }),
      col.accessor("reasons", { header: "Reasons", enableSorting: false, cell: (c) => <ReasonChips codes={c.getValue()} /> }),
      col.accessor("riskRating", { header: "Rating", sortUndefined: "last", cell: (c) => <GradeBadge grade={c.getValue()} /> }),
      col.accessor("tce", {
        header: "TCE",
        cell: (c) => <span className="tnum text-[13.5px] font-bold text-ink">{fmtMoney(c.getValue())}</span>,
      }),
      col.accessor("nextTestDays", {
        header: "Next test",
        sortingFn: (a, b) => (a.original.nextTestDays ?? Infinity) - (b.original.nextTestDays ?? Infinity),
        cell: (c) => <DayCell days={c.row.original.nextTestDays} date={c.row.original.nextTestDate} warnAt={45} />,
      }),
      col.accessor("maturityDays", {
        header: "Maturity",
        sortingFn: (a, b) => (a.original.maturityDays ?? Infinity) - (b.original.maturityDays ?? Infinity),
        cell: (c) => <DayCell days={c.row.original.maturityDays} date={c.row.original.maturityDate} warnAt={270} />,
      }),
      // A11: last-modified is not carried in the data contract — render an honest gap.
      col.display({ id: "lastModified", header: "Last modified", cell: () => <span className="text-ink-faint">—</span> }),
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  // Re-key the row set on any filter/sort change so the entrance animation
  // replays — the queue visibly re-forms instead of snapping (A25.4/A26.2).
  const animKey = `${search}|${[...reasonFilter].sort().join(",")}|${sorting.map((s) => s.id + (s.desc ? "d" : "a")).join(",")}`;

  function openRow(r: WorklistRow) {
    if (r.staged) dispatch({ type: "OPEN_ACCOUNT", accountId: r.accountId });
    else setUnstaged(r); // A17 — copy-prompt explainer, never an empty workspace
  }

  return (
    <Card>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 border-b border-divider px-6 py-4">
        <div>
          <div className="kicker">Worklist</div>
          <div className="mt-0.5 text-[17px] font-bold text-ink">Needs action</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-ink-muted">
            {filtered.length} of {rows.length} · by severity
          </span>
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5">
          {ALL_REASONS.map((code) => {
            const active = reasonFilter.has(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() =>
                  setReasonFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(code)) next.delete(code);
                    else next.add(code);
                    return next;
                  })
                }
                aria-pressed={active}
                className="c360-press rounded-[6px] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide"
                style={{
                  background: active ? REASON_META[code].bg : "transparent",
                  color: active ? REASON_META[code].fg : "var(--ink-faint)",
                  border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                }}
              >
                {REASON_META[code].short}
              </button>
            );
          })}
          {reasonFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setReasonFilter(new Set())}
              className="text-[10.5px] font-medium text-ink-faint underline underline-offset-2 hover:text-ink-muted"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Header row */}
      <div
        className="grid items-center gap-4 border-b border-divider px-6 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        {table.getHeaderGroups()[0].headers.map((h) => {
          const sortable = h.column.getCanSort();
          const dir = h.column.getIsSorted();
          return (
            <button
              key={h.id}
              type="button"
              disabled={!sortable}
              onClick={h.column.getToggleSortingHandler()}
              className={`flex items-center gap-1 ${sortable ? "c360-press cursor-pointer hover:text-ink-muted" : "cursor-default"}`}
            >
              {flexRender(h.column.columnDef.header, h.getContext())}
              {sortable && <SortGlyph dir={dir} />}
            </button>
          );
        })}
      </div>

      {/* Body — plain render (A21: no virtualization; ~30 rows) */}
      {tableRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="text-[14px] font-bold text-ink">Queue clear</div>
          <div className="max-w-xs text-[12px] text-ink-muted">
            No relationship matches the current filter. Every staged account is within tolerance.
          </div>
        </div>
      ) : (
        tableRows.map((row, i) => {
          const r = row.original;
          return (
            <div
              key={`${animKey}|${row.id}`}
              role="button"
              tabIndex={0}
              onClick={() => openRow(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openRow(r);
                }
              }}
              className="c360-row-in c360-row grid cursor-pointer items-center gap-4 border-b border-divider px-6 py-3.5"
              style={{ gridTemplateColumns: GRID_COLS, animationDelay: staggerDelay(i) }}
            >
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} className="min-w-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
              ))}
            </div>
          );
        })
      )}

      {unstaged && <CopyPromptDialog accountName={unstaged.name} accountId={unstaged.accountId} onClose={() => setUnstaged(null)} />}
    </Card>
  );
}

function SortGlyph({ dir }: { dir: false | "asc" | "desc" }) {
  return (
    <span className="text-[9px] leading-none" style={{ color: dir ? "var(--accent)" : "var(--ink-faint)" }}>
      {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}
    </span>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border-strong bg-raised px-2.5 py-1.5">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-none text-ink-faint">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search book…"
        className="w-44 bg-transparent text-[12.5px] text-ink placeholder:text-ink-faint focus:outline-none"
      />
    </div>
  );
}
