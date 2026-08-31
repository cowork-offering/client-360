import type { BorrowerBundle } from "../../data/contract";
import { fmtMoney, fmtDate } from "../../data/format";
import { EmptyPane, Fig, Note, Pane, PaneCard, SecHead, Status } from "./paneKit";

const EXPLAIN =
  "Explain the whitespace here and the next best action.";

/** The amount is the figure; everything else is the line under it. The two used
 *  to be one string, which set "closes Sep 1, 2026" at 20px beside the money. */
interface Nba {
  title: string;
  amount: string;
  sub: string;
  meta: string;
}

export function OpportunitiesTab({ bundle }: { bundle: BorrowerBundle }) {
  const opps = bundle.opportunities?.opportunities ?? [];

  const nbas: Nba[] = opps.map((o) => ({
    title: o.name ?? "Opportunity",
    amount: o.amount != null ? fmtMoney(o.amount) : "",
    sub: o.closeDate ? `closes ${fmtDate(o.closeDate)}` : "",
    meta: o.stage ?? "",
  }));
  nbas.push({
    title: "Win the operating deposits",
    amount: "",
    sub: "Standing cross-sell · no wallet on file",
    meta: "Treasury",
  });

  return (
    <Pane id="opportunities">
      <SecHead kicker="Whitespace" sub="Opportunities & next best actions" explain={EXPLAIN} />

      <div className="pane-grid">
        {nbas.map((n, i) => (
          <div className="opp num" key={i}>
            <b>{n.title}</b>
            {n.amount && (
              <div className="v">
                <Fig>{n.amount}</Fig>
              </div>
            )}
            {n.sub && <span className="p">{n.sub}</span>}
            {/* An open opportunity is warm; the standing cross-sell is not a
                stage, so it stays muted. Status is the word, never a pill. */}
            {n.meta && <Status tone={i < opps.length ? "acc" : "mut"}>{n.meta}</Status>}
          </div>
        ))}
      </div>

      {/* Whitespace — deposit cross-sell (honest: no wallet size invented) */}
      <PaneCard>
        <div className="kicker" style={{ marginBottom: 6 }}>
          The cross-sell story
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink)", textWrap: "pretty" }}>
          This borrower holds committed credit but no operating balances at the bank. The standing next best action is the
          treasury conversation, capturing the operating account, payroll, and treasury-management wallet. No wallet size is
          estimated here (the source org carries no deposit data to size it against).
        </p>
      </PaneCard>

      {opps.length === 0 && (
        <PaneCard>
          <EmptyPane
            title="No open opportunities"
            body="No open opportunities on file, beyond the standing deposit cross-sell."
          />
        </PaneCard>
      )}

      <Note note={bundle.opportunities?.note} />
    </Pane>
  );
}
