import type { BorrowerBundle } from "../../data/contract";
import { fmtPct } from "../../data/format";
import { partyGraph } from "../../data/graphAggregate";
import { EmptyPane, Gap, Note, OwnershipTree, Pane, PaneCard, SecHead, type TreeNode } from "./paneKit";

const EXPLAIN =
  "Explain the ownership structure and who guarantees this credit.";

export function GraphTab({ bundle }: { bundle: BorrowerBundle }) {
  const graph = bundle.graph ?? {};
  const snap = bundle.snapshot ?? { accountId: "" };
  const name = snap.name ?? "—";
  const sector = [snap.industry, snap.naicsCode ? `NAICS ${snap.naicsCode}` : null].filter(Boolean).join(" · ") || "—";

  /* ONE PARTY, ONE EDGE, ALL OF THEM ONTO THE BORROWER. The org stores each
     connection both ways, repeats an involvement once per facility, and the two
     reads describe the same people from different sides. `partyGraph` joins all
     of that before anything renders, so a name reaches the glass exactly once
     carrying every role both reads know — and a guarantor with no equity gets
     the same edge onto the borrower an owner does, instead of being exiled to a
     text card with no line at all (founder, 2026-09-03). */
  const { borrowerLabel, edges } = partyGraph(graph.connections, graph.legalEntities, name);

  const nodes: TreeNode[] = edges.map((e) => ({
    name: e.name,
    detail: e.ownershipPercent != null ? `${fmtPct(e.ownershipPercent, 0)} ownership` : undefined,
    role: e.label,
    direction: e.direction,
  }));

  return (
    <Pane id="graph">
      <PaneCard>
        <SecHead kicker="Household & ownership" sub="Ownership structure" explain={EXPLAIN} />
        {nodes.length ? (
          <OwnershipTree nodes={nodes} borrowerName={name} borrowerSub={sector} borrowerRole={borrowerLabel} />
        ) : (
          <EmptyPane
            title="No related parties on file"
            body="No ownership or guaranty relationships on file for this account."
          />
        )}

        <Note note={graph.note} />
      </PaneCard>

      <div className="pane-grid">
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
