import type { BorrowerBundle } from "../../data/contract";
import { fmtPct } from "../../data/format";
import { relationshipRoster, type AggregatedInvolvement, type RosterParty } from "../../data/graphAggregate";
import { EmptyPane, Gap, Note, OwnershipTree, Pane, PaneCard, SecHead, type TreeNode } from "./paneKit";

const EXPLAIN =
  "Explain the ownership structure and who guarantees this credit.";

/** One involvement, in the org's own words, with the shape of the obligation.
 *  "Guarantor · Unlimited · 6 facilities" is one fact said once; six rows each
 *  saying "Guarantor" is the org's storage shape leaking onto the glass. */
function roleLine(e: AggregatedInvolvement, withPercent: boolean): string {
  return [
    e.relationshipType ?? e.borrowerType ?? "Involved",
    e.guarantyAmountType || null,
    withPercent && e.ownershipPercent != null ? fmtPct(e.ownershipPercent, 0) : null,
    e.facilityCount > 1 ? `${e.facilityCount} facilities` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Everything the reads say about one party's ROLE, on one line: the ownership
 * edge first, then each involvement. Never the party's name, which is the row.
 *
 * The involvement row's own percent is printed only where no ownership edge
 * carries one. On a guaranty row the org writes 100 for the share of the
 * obligation, and printing that beside a 60 percent equity stake reads as a
 * contradiction the credit file does not contain.
 */
function rolesOf(p: RosterParty, opts: { ownershipShown?: boolean } = {}): string {
  const equity = p.connection?.ownershipPercent ?? null;
  const own = p.connection
    ? [p.connection.role ?? "Related", !opts.ownershipShown && equity != null ? fmtPct(equity, 0) : null].filter(Boolean).join(" · ")
    : null;
  return [own, ...p.involvements.map((e) => roleLine(e, equity === null))].filter(Boolean).join(" · ") || "Related";
}

export function GraphTab({ bundle }: { bundle: BorrowerBundle }) {
  const graph = bundle.graph ?? {};
  /* ONE PARTY, ONE ROW. The org stores each connection BOTH ways and repeats an
     involvement once per facility, AND the two reads describe the same people:
     the parent company is also the guarantor on every loan. The roster joins
     them before anything renders, so a name reaches the glass exactly once
     carrying everything both reads know about it. */
  const roster = relationshipRoster(graph.connections, graph.legalEntities);
  const owners = roster.filter((p) => (p.connection?.ownershipPercent ?? 0) > 0);
  // Everyone the ownership tree cannot draw: the borrower itself, guarantors
  // with no equity, affiliates, anything the org related without quantifying.
  const others = roster.filter((p) => !owners.includes(p));

  const snap = bundle.snapshot ?? { accountId: "" };
  const name = snap.name ?? "—";
  const sector = [snap.industry, snap.naicsCode ? `NAICS ${snap.naicsCode}` : null].filter(Boolean).join(" · ") || "—";

  // `collapseConnections` already carries the largest percent either half of a
  // mirrored pair knows, so the aggregate IS the total. The role line carries
  // the involvements too: an owner who also guarantees the credit is one party
  // holding two facts, not two rows in two cards.
  const nodes: TreeNode[] = owners.map((o) => ({
    name: o.name,
    detail: `${fmtPct(o.connection!.ownershipPercent!, 0)} ownership`,
    role: rolesOf(o, { ownershipShown: true }),
  }));

  return (
    <Pane id="graph">
      <PaneCard>
        <SecHead kicker="Household & ownership" sub="Ownership structure" explain={EXPLAIN} />
        {nodes.length ? (
          <OwnershipTree nodes={nodes} borrowerName={name} borrowerSub={sector} />
        ) : (
          <EmptyPane
            title="No ownership edges on file"
            body="No ownership relationships on file for this account."
          />
        )}

        <Note note={graph.note} />
      </PaneCard>

      {/* Everyone the tree cannot draw, as ratio rows in ONE card. Guarantors
          used to have a card of their own and the legal entities another, which
          on the 22-row read printed the same guarantor three times across the
          tab. One roster, one row each, every role on the row. */}
      <div className="pane-grid">
        {others.length > 0 && (
          <PaneCard>
            <div className="kicker" style={{ marginBottom: 8 }}>
              Parties &amp; roles
            </div>
            <div className="ratio-rows">
              {others.map((p, i) => (
                <div className="rr" key={p.counterpartyId ?? p.name ?? i}>
                  <span>{p.name}</span>
                  <b>{rolesOf(p)}</b>
                </div>
              ))}
            </div>
          </PaneCard>
        )}

        <PaneCard>
          <div className="kicker" style={{ marginBottom: 8 }}>
            Decision ledger
          </div>
          <Gap
            title="Decision ledger not wired in this artifact"
            provenance="Lives in the deal workspace / experience-mcp (recall_decisions)"
          />
        </PaneCard>
      </div>
    </Pane>
  );
}
