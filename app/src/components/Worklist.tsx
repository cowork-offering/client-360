import { useMemo, useState } from "react";
import { useApp } from "../state/appState";
import { buildWorklistRows, type WorklistRow } from "../data/worklistRows";
import { fmtMoney, fmtDays } from "../data/format";
import { gradeTone } from "../data/finance";
import type { ReasonCode } from "../data/contract";
import { REASON_META } from "./reasons";
import { CopyPromptDialog } from "./CopyPromptDialog";

/* =============================================================================
   THE WORKLIST — the landing's third beat.

   ROWS, NOT A TABLE. The mint's queue is a stack of solid white cards: who,
   what is wrong in words, what it is worth, and an arrow. The sortable
   tanstack header, the search field and the reason-filter rail are gone from
   this surface; rule 45 put search behind the header's ⌘K chip, which is the
   palette this app already ships. The DATA is untouched — the same
   buildWorklistRows over the same derived worklist, in the same severity order.

   STATUS IS TYPOGRAPHY (systemNonNegotiable), never pill soup: a coloured word
   with a 5px dot. Rule 20: hover is LIFT + SHADOW only — an inset accent bar
   reads as a spine and is banned. Rule 13: no per-row meters, no sparklines.
   The numbers carry it.
   ============================================================================= */

interface Status {
  tone: "good" | "warn" | "bad" | "acc" | "mut";
  text: string;
}

const REASON_TONE: Record<ReasonCode, Status["tone"]> = {
  CLIENT_REQUEST: "acc",
  COVENANT_BREACH: "bad",
  COVENANT_EXCEPTION: "warn",
  COVENANT_DUE: "warn",
  MATURITY_NEAR: "acc",
  MODIFICATION_CLUSTER: "mut",
  GUARANTOR_SIGNAL: "warn",
  RECENTLY_MODIFIED: "mut",
};

const GRADE_TONE: Record<string, Status["tone"]> = {
  green: "good",
  amber: "warn",
  red: "bad",
  purple: "acc",
  neutral: "mut",
};

/** The row's status line. A reason that HAS a date says the date: "Test due" on
 *  its own is a category, "Test due · 2d ago" is the reason you are looking at
 *  this row. Reasons the data carries no clock for stay bare rather than
 *  borrowing one. */
function statusesFor(r: WorklistRow): Status[] {
  const out: Status[] = [];
  if (r.riskRating != null) {
    out.push({ tone: GRADE_TONE[gradeTone(r.riskRating)] ?? "mut", text: `Grade ${r.riskRating}` });
  }
  for (const code of r.reasons) {
    const short = REASON_META[code].short;
    let text = short;
    let tone = REASON_TONE[code];
    if ((code === "COVENANT_DUE" || code === "COVENANT_EXCEPTION") && r.nextTestDays != null) {
      text = `${short} · ${fmtDays(r.nextTestDays)}`;
      if (r.nextTestDays < 0) tone = "bad";
    } else if (code === "MATURITY_NEAR" && r.maturityDays != null) {
      text = `${short} · ${fmtDays(r.maturityDays)}`;
    }
    out.push({ tone, text });
  }
  if (!r.staged) out.push({ tone: "mut", text: "not staged" });
  if (r.sample) out.push({ tone: "mut", text: "sample" });
  return out;
}

function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}

export function Worklist() {
  const { data, worklist, dispatch } = useApp();
  const rows = useMemo(() => buildWorklistRows(data, worklist), [data, worklist]);
  const [unstaged, setUnstaged] = useState<WorklistRow | null>(null);

  function openRow(r: WorklistRow) {
    if (r.staged) dispatch({ type: "OPEN_ACCOUNT", accountId: r.accountId });
    else setUnstaged(r); // A17 — copy-prompt explainer, never an empty workspace
  }

  return (
    <div style={{ marginTop: 36 }}>
      <div className="eyebrow">
        <span className="kicker">Worklist</span>
      </div>
      <div className="wl-head">Needs action</div>

      {rows.length === 0 ? (
        <div className="card wl-empty">
          Queue clear. No relationship in the book is outside tolerance on this snapshot.
        </div>
      ) : (
        <div className="wl">
          {rows.map((r, i) => {
            const breach = r.reasons.includes("COVENANT_BREACH");
            return (
              <div
                key={r.accountId}
                role="button"
                tabIndex={0}
                data-open={r.accountId}
                onClick={() => openRow(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openRow(r);
                  }
                }}
                className="wlrow"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span className={`mono${breach ? " bad" : ""}`}>{initialsOf(r.name)}</span>
                <span className="who">
                  <b>{r.name}</b>
                  <span>
                    {r.industry}
                    {r.naicsCode ? ` · NAICS ${r.naicsCode}` : ""}
                  </span>
                </span>
                <span className="sts">
                  {statusesFor(r).map((s) => (
                    <span key={s.text} className={`st ${s.tone}`}>
                      {s.text}
                    </span>
                  ))}
                </span>
                <span className="amt num">
                  <b>{fmtMoney(r.tce)}</b>
                  <span>total exposure</span>
                </span>
                <span className="go">→</span>
              </div>
            );
          })}
        </div>
      )}

      {unstaged && (
        <CopyPromptDialog
          cause="unstaged"
          accountName={unstaged.name}
          accountId={unstaged.accountId}
          onClose={() => setUnstaged(null)}
        />
      )}
    </div>
  );
}
