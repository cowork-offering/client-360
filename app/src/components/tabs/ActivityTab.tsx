import { useMemo, useState } from "react";
import type { ActivityEntry, ActivityKind, BorrowerBundle } from "../../data/contract";
import { fmtDate, fmtRelative } from "../../data/format";
import { accountKey, useApp } from "../../state/appState";
import { historyActivityEntry, mergeTrail } from "../../actions/executedActivity";
import { staggerDelay } from "../../data/motion";
import { ActivityDetailModal } from "../ActivityDetailModal";
import { EmptyPane, Note, Pane, PaneCard, SecHead } from "./paneKit";

const EXPLAIN =
  "Walk me through this activity: what came in, what was concluded, what is next.";

/* THE AUDIT TRAIL IS PORCELAIN (rule 48): a fading spine, 9px dots with a white
   halo so the line passes behind them, and the latest entry as solid ink with
   its own aura. It carries no icon rail — the dot IS the marker, and a column
   of 30px tinted circles beside it was the "pill soup" the system bans. What
   the kinds still decide is the WORD beside a title and whether an entry is
   user-originated, which is a fact about who acted, not decoration. */
const KIND_META: Record<ActivityKind, { label: string; tone: "accent" | "neutral" | "user" }> = {
  ACTION_TRIGGERED: { label: "You", tone: "user" },
  // A30.4 — both execution kinds are USER-ORIGINATED and carry the user tone,
  // exactly like ACTION_TRIGGERED. A write the banker attempted and lost is
  // still a thing the banker did.
  ACTION_EXECUTED: { label: "You · filed", tone: "user" },
  ACTION_EXECUTION_FAILED: { label: "You · not filed", tone: "user" },
  ACTION_STAGED: { label: "You · staged", tone: "user" },
  REQUEST_RECEIVED: { label: "Client request", tone: "accent" },
  ANALYSIS_CONCLUDED: { label: "Analysis", tone: "neutral" },
  COVENANT_EVALUATED: { label: "Covenant", tone: "neutral" },
  FACILITY_MODIFIED: { label: "Facility", tone: "neutral" },
  RENDER_AUDIT: { label: "Audit", tone: "neutral" },
};

/** Source citation. NO fake links: without a webLink the id renders as plain
 *  monospace text (A29/A30.2). */
export function ReferenceCitation({ reference }: { reference?: ActivityEntry["reference"] }) {
  if (!reference?.id && !reference?.label) return null;
  const text = reference.label ?? reference.id!;
  return (
    <span className="cite">
      <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
        <path d="M6.5 9.5a3 3 0 004.2 0l2.1-2.1a3 3 0 10-4.2-4.2l-.7.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M9.5 6.5a3 3 0 00-4.2 0L3.2 8.6a3 3 0 104.2 4.2l.7-.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {(reference.source ?? reference.kind) && <b style={{ fontWeight: 600 }}>{reference.source ?? reference.kind}</b>}
      <span style={{ fontFamily: "var(--font-mono)" }}>{text}</span>
    </span>
  );
}

/** One entry on the trail. The row is a button because it opens the detail
 *  modal; it wears no box for that, only the dot and the pointer. */
function TrailEntry({
  entry,
  index,
  generatedAt,
  onOpen,
}: {
  entry: ActivityEntry;
  index: number;
  generatedAt: string;
  onOpen: () => void;
}) {
  const meta = KIND_META[entry.kind] ?? KIND_META.RENDER_AUDIT;
  const isRequest = entry.kind === "REQUEST_RECEIVED";
  const isUser = meta.tone === "user";
  const steps = entry.detail?.nextSteps?.length ?? 0;

  return (
    <button
      type="button"
      // A30.4 — user-originated entries are marked as such, not merely tinted.
      data-origin={isUser ? "user" : "system"}
      onClick={onOpen}
      // The latest entry is the hot one: solid ink dot with a 7px aura.
      className={`tli${index === 0 ? " hot" : ""}${isUser ? " c360-activity-user" : ""}`}
      style={{ animationDelay: staggerDelay(index, 70, 420) }}
    >
      <b>{entry.title}</b>
      <span className="m" title={fmtDate(entry.ts)}>
        {isUser && !entry.orgConfirmed
          ? `${entry.actor ?? "You"} · just now`
          : fmtRelative(entry.ts, generatedAt)}
      </span>
      {isRequest && <span className="m">{meta.label}</span>}
      {entry.summary && <span className="d">{entry.summary}</span>}
      <span className="meta">
        {/* Session echo and org record are different claims and look it: one
            says "this page just did that", the other says "the system of
            record holds it". */}
        {entry.orgConfirmed ? (
          <span data-origin-detail="org" className="tag rec">
            On record in nCino
          </span>
        ) : (
          entry.sessionLocal &&
          isUser && (
            <span data-origin-detail="session" className="tag ses">
              This session
            </span>
          )
        )}
        <ReferenceCitation reference={entry.reference} />
        {steps > 0 && (
          <span className="next">
            {steps} suggested next step{steps > 1 ? "s" : ""} →
          </span>
        )}
      </span>
    </button>
  );
}

export function ActivityTab({ bundle }: { bundle: BorrowerBundle }) {
  const { data, state } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const generatedAt = data.meta?.generatedAt ?? "";
  const accountId = accountKey(state.accountId, bundle.snapshot?.accountId);

  // The org's durable trail + this session's own entries + the baked events,
  // newest first. The org row wins over the session echo of the same execution,
  // so a reload shows the same history a fresh session would (A30 / A31.3).
  const entries = useMemo(() => {
    const local = state.sessionActivity[accountId] ?? [];
    const org = (state.actionHistory[accountId] ?? [])
      .map((r) => historyActivityEntry(r, data.meta?.instanceUrl))
      .filter((e): e is ActivityEntry => e !== null);
    return mergeTrail(org, local, bundle.activity ?? []);
  }, [bundle.activity, state.sessionActivity, state.actionHistory, accountId, data.meta?.instanceUrl]);
  const open = entries.find((e) => e.id === openId) ?? null;

  return (
    <Pane id="activity">
      <PaneCard>
        <SecHead kicker="Audit trail" sub="Activity" explain={EXPLAIN} />
        {entries.length === 0 ? (
          <EmptyPane
            title="No recorded activity in this view"
            body="Recorded events, concluded analyses and client requests land here."
          />
        ) : (
          <div className="tl">
            {entries.map((e, i) => (
              <TrailEntry
                key={e.id}
                entry={e}
                index={i}
                generatedAt={generatedAt}
                onOpen={() => setOpenId(e.id)}
              />
            ))}
          </div>
        )}
      </PaneCard>

      <Note
        note={
          entries.length
            ? "Timestamps are shown relative to this render. Source references cite the originating record; links appear once the mail intake is wired."
            : undefined
        }
      />

      {open && <ActivityDetailModal entry={open} bundle={bundle} onClose={() => setOpenId(null)} />}
    </Pane>
  );
}
