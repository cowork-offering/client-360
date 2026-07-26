import { useMemo, useState } from "react";
import type { ActivityEntry, ActivityKind, BorrowerBundle } from "../../data/contract";
import { fmtDate, fmtRelative } from "../../data/format";
import { useApp } from "../../state/appState";
import { staggerDelay } from "../../data/motion";
import { Card, SectionHead, EmptyState, NoteCaption } from "../ui";
import { ActivityDetailModal } from "../ActivityDetailModal";

const EXPLAIN =
  "Walk me through this activity: what came in, what was concluded, what is next.";

/** Per-kind presentation. Static map (A20) — no interpolated classes. */
const KIND_META: Record<ActivityKind, { label: string; tone: "accent" | "neutral" | "user"; icon: React.ReactNode }> = {
  ACTION_TRIGGERED: {
    label: "You",
    tone: "user",
    icon: (
      <>
        <circle cx="9" cy="6.2" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M3.6 15.2a5.4 5.4 0 0110.8 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </>
    ),
  },
  REQUEST_RECEIVED: {
    label: "Client request",
    tone: "accent",
    icon: (
      <>
        <path d="M2.5 5.2h13v9h-13z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M2.5 5.6l6.5 4.6 6.5-4.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </>
    ),
  },
  ANALYSIS_CONCLUDED: {
    label: "Analysis",
    tone: "neutral",
    icon: (
      <>
        <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M11.7 11.7l3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M5.9 8.1l1.6 1.6 3-3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  COVENANT_EVALUATED: {
    label: "Covenant",
    tone: "neutral",
    icon: (
      <>
        <path d="M9 2.4l5.2 2.3v3.9c0 3-2.2 5.5-5.2 6.4-3-.9-5.2-3.4-5.2-6.4V4.7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M6.8 8.7l1.6 1.6 2.9-3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  FACILITY_MODIFIED: {
    label: "Facility",
    tone: "neutral",
    icon: (
      <>
        <path d="M11.6 3.2l2.4 2.4-7.6 7.6-3.1.7.7-3.1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </>
    ),
  },
  RENDER_AUDIT: {
    label: "Audit",
    tone: "neutral",
    icon: (
      <>
        <rect x="3" y="2.6" width="12" height="12.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 6.4h6M6 9h6M6 11.6h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </>
    ),
  },
};

/** Source citation. NO fake links: without a webLink the id renders as plain
 *  monospace text (A29/A30.2). */
export function ReferenceCitation({ reference }: { reference?: ActivityEntry["reference"] }) {
  if (!reference?.id && !reference?.label) return null;
  const text = reference.label ?? reference.id!;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
      <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
        <path d="M6.5 9.5a3 3 0 004.2 0l2.1-2.1a3 3 0 10-4.2-4.2l-.7.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M9.5 6.5a3 3 0 00-4.2 0L3.2 8.6a3 3 0 104.2 4.2l.7-.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {(reference.source ?? reference.kind) && (
        <span className="font-semibold">{reference.source ?? reference.kind}</span>
      )}
      <span className="font-mono">{text}</span>
    </span>
  );
}

function TimelineRow({
  entry,
  index,
  isLast,
  generatedAt,
  onOpen,
}: {
  entry: ActivityEntry;
  index: number;
  isLast: boolean;
  generatedAt: string;
  onOpen: () => void;
}) {
  const meta = KIND_META[entry.kind] ?? KIND_META.RENDER_AUDIT;
  const isRequest = entry.kind === "REQUEST_RECEIVED";
  const isUser = meta.tone === "user";
  // Three distinct visual identities: inbound client (accent), user-driven
  // (violet), system/record (neutral) — A31.3.
  const markerBg = isRequest ? "var(--accent-wash)" : isUser ? "var(--user-tone-wash)" : "var(--wash-2)";
  const markerFg = isRequest ? "var(--accent)" : isUser ? "var(--user-tone)" : "var(--ink-muted)";
  const rule = isRequest ? "var(--accent)" : isUser ? "var(--user-tone)" : null;

  return (
    <div className="c360-row-in relative flex gap-3.5" style={{ animationDelay: staggerDelay(index) }}>
      {/* Rail */}
      <div className="flex flex-none flex-col items-center">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: markerBg, color: markerFg }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            {meta.icon}
          </svg>
        </span>
        {!isLast && <span className="my-1 w-px flex-1" style={{ background: "var(--border)" }} />}
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={onOpen}
        className={`c360-action-row mb-3 flex-1 rounded-[10px] border border-border bg-raised px-4 py-3 text-left${isUser ? " c360-activity-user" : ""}`}
        style={rule ? { borderLeft: `3px solid ${rule}` } : undefined}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-bold text-ink">{entry.title}</span>
          {isRequest && (
            <span
              className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
              style={{ background: "var(--chip-client-request-bg)", color: "var(--chip-client-request-fg)" }}
            >
              {meta.label}
            </span>
          )}
          <span className="ml-auto text-[11px] text-ink-faint" title={fmtDate(entry.ts)}>
            {isUser ? (
              <span style={{ color: "var(--user-tone)" }} className="font-semibold">
                {entry.actor ?? "You"} · just now
              </span>
            ) : (
              fmtRelative(entry.ts, generatedAt)
            )}
          </span>
        </span>
        {entry.summary && (
          <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-body">{entry.summary}</span>
        )}
        <span className="mt-2 flex flex-wrap items-center gap-3">
          <ReferenceCitation reference={entry.reference} />
          {(entry.detail?.nextSteps?.length ?? 0) > 0 && (
            <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
              {entry.detail!.nextSteps!.length} suggested next step
              {entry.detail!.nextSteps!.length > 1 ? "s" : ""} →
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

export function ActivityTab({ bundle }: { bundle: BorrowerBundle }) {
  const { data, state } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const generatedAt = data.meta?.generatedAt ?? "";
  const accountId = state.accountId ?? bundle.snapshot?.accountId ?? "";

  // Baked events + this session's ACTION_TRIGGERED entries, newest first — the
  // narrative spine reads top-down from "what just happened" (A31.3).
  const entries = useMemo(() => {
    const local = state.sessionActivity[accountId] ?? [];
    return [...local, ...(bundle.activity ?? [])].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  }, [bundle.activity, state.sessionActivity, accountId]);
  const open = entries.find((e) => e.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Activity · audit trail" explain={EXPLAIN} />

      <Card hover={false} className="px-5 py-5">
        {entries.length === 0 ? (
          <EmptyState
            title="No recorded activity in this view"
            body="This relationship carries no activity entries in the current snapshot. Recorded events, concluded analyses and client requests appear here as they arrive."
          />
        ) : (
          <div>
            {entries.map((e, i) => (
              <TimelineRow
                key={e.id}
                entry={e}
                index={i}
                isLast={i === entries.length - 1}
                generatedAt={generatedAt}
                onOpen={() => setOpenId(e.id)}
              />
            ))}
          </div>
        )}
      </Card>

      <NoteCaption note={entries.length ? "Timestamps are shown relative to this render. Source references cite the originating record; links appear once the mail intake is wired." : undefined} />

      {open && <ActivityDetailModal entry={open} bundle={bundle} onClose={() => setOpenId(null)} />}
    </div>
  );
}
