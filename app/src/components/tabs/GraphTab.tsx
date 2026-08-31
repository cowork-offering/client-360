import type { BorrowerBundle } from "../../data/contract";
import { fmtPct } from "../../data/format";
import { collapseConnections, aggregateInvolvements } from "../../data/graphAggregate";
import { EmptyPane, Gap, Note, OwnershipTree, Pane, PaneCard, SecHead, type TreeNode } from "./paneKit";

const EXPLAIN =
  "Explain the ownership structure and who guarantees this credit.";

export function GraphTab({ bundle }: { bundle: BorrowerBundle }) {
  const graph = bundle.graph ?? {};
  // The org stores each connection BOTH ways and repeats an involvement once
  // per facility. Aggregate by identity before rendering anything: raw row
  // multiplicity is the org's storage shape, not a fact about the relationship.
  const conns = collapseConnections(graph.connections);
  const owners = conns.filter((c) => (c.ownershipPercent ?? 0) > 0);
  // Everything the ownership tree cannot show: affiliates, parents with no
  // recorded percent, anything the org related without quantifying.
  const others = conns.filter((c) => !((c.ownershipPercent ?? 0) > 0));
  const les = aggregateInvolvements(graph.legalEntities);
  const guarantors = les.filter((e) => (e.borrowerType ?? "").toLowerCase().includes("guarantor"));

  const snap = bundle.snapshot ?? { accountId: "" };
  const name = snap.name ?? "—";
  const sector = [snap.industry, snap.naicsCode ? `NAICS ${snap.naicsCode}` : null].filter(Boolean).join(" · ") || "—";

  // `collapseConnections` already carries the largest percent either half of a
  // mirrored pair knows, so the aggregate IS the total. The old
  // `totalOwnershipPercent ?? ownershipPercent` fallback read a field the
  // collapsed row does not have and always took the second branch.
  const nodes: TreeNode[] = owners.map((o) => ({
    name: o.counterpartyName ?? "—",
    detail: o.ownershipPercent != null ? `${fmtPct(o.ownershipPercent, 0)} ownership` : "Ownership not quantified",
    role: o.role ?? undefined,
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

      {/* Everything the tree cannot draw, as ratio rows in their own cards.
          The lists sit in the pane grid rather than under the tree so a name
          and its role stay a row, not a dumbbell stretched across the page. */}
      <div className="pane-grid">
        {guarantors.length > 0 && (
          <PaneCard>
            <div className="kicker" style={{ marginBottom: 8 }}>
              Guarantors
            </div>
            <div className="ratio-rows">
              {guarantors.map((g, i) => (
                <div className="rr" key={i}>
                  <span>{g.accountName ?? "—"}</span>
                  <b>{g.borrowerType}</b>
                </div>
              ))}
            </div>
          </PaneCard>
        )}

        {/* RELATED PARTIES: every collapsed connection that is not an owner.
            An affiliate with no ownership percent is still a relationship, and
            the ownership tree has nowhere to put it — it used to render
            nowhere at all. */}
        {others.length > 0 && (
          <PaneCard>
            <div className="kicker" style={{ marginBottom: 8 }}>
              Related parties
            </div>
            <div className="ratio-rows">
              {others.map((c, i) => (
                <div className="rr" key={c.counterpartyId ?? i}>
                  <span>{c.counterpartyName ?? "—"}</span>
                  <b>
                    {c.role ?? "Related"}
                    {c.ownershipPercent != null ? ` · ${fmtPct(c.ownershipPercent, 0)}` : ""}
                  </b>
                </div>
              ))}
            </div>
          </PaneCard>
        )}

        {les.length > 0 && (
          <PaneCard>
            <div className="kicker" style={{ marginBottom: 8 }}>
              Legal entities &amp; roles
            </div>
            <div className="ratio-rows">
              {les.map((e, i) => (
                <div className="rr" key={i}>
                  <span>{e.accountName ?? "—"}</span>
                  <b>
                    {e.relationshipType ?? e.borrowerType ?? "—"}
                    {e.guarantyAmountType ? ` · ${e.guarantyAmountType}` : ""}
                    {e.ownershipPercent != null ? ` · ${fmtPct(e.ownershipPercent, 0)}` : ""}
                    {e.facilityCount > 1 ? ` · ${e.facilityCount} facilities` : ""}
                  </b>
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
