import type { BorrowerBundle, Connection } from "../../data/contract";
import { fmtPct } from "../../data/format";
import { collapseConnections, aggregateInvolvements } from "../../data/graphAggregate";
import { Card, SectionHead, GapChip, EmptyState, NoteCaption } from "../ui";

const EXPLAIN =
  "Explain the ownership structure and who guarantees this credit.";

function OwnershipTree({ owners, borrowerName, sector }: { owners: Connection[]; borrowerName: string; sector: string }) {
  if (!owners.length) {
    return <EmptyState title="No ownership edges on file" body="No ownership relationships on file for this account." />;
  }
  const railInset = +(50 / owners.length).toFixed(2);
  const boxes = owners.map((o, i) => {
    const centerPct = +(((i + 0.5) / owners.length) * 100).toFixed(2);
    const pct = o.totalOwnershipPercent ?? o.ownershipPercent;
    return { centerPct, name: o.counterpartyName ?? "—", pct: pct != null ? fmtPct(pct, 0) : "—", role: o.role ?? "" };
  });
  const connectors = boxes.map((o, i) => (
    <div key={i} className="absolute top-0 h-5 w-0.5" style={{ background: "var(--tree-line)", left: `calc(${o.centerPct}% - 1px)` }} />
  ));

  return (
    <div className="flex w-full flex-col items-center py-1">
      <div className="relative h-5 w-full">
        <div className="absolute top-0 h-0.5 rounded" style={{ background: "var(--tree-line)", left: `${railInset}%`, right: `${railInset}%` }} />
        {connectors}
      </div>
      <div className="flex w-full">
        {boxes.map((o, i) => (
          <div key={i} className="flex min-w-0 flex-1 justify-center px-2.5">
            <div
              className="flex min-h-[82px] w-full max-w-[200px] flex-col items-center justify-center gap-1 rounded-[12px] px-3.5 py-3 text-center"
              style={{ background: "var(--surface-overlay)", boxShadow: "var(--shadow-node)" }}
            >
              <div className="text-[13px] font-bold leading-tight">{o.name}</div>
              <div className="text-[12px] text-ink-muted">{o.pct}</div>
              {o.role && (
                <div className="inline-block rounded-[6px] px-2.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent-wash)", color: "var(--accent)" }}>
                  {o.role}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="relative h-5 w-full">
        {connectors}
        <div className="absolute bottom-0 h-0.5 rounded" style={{ background: "var(--tree-line)", left: `${railInset}%`, right: `${railInset}%` }} />
      </div>
      <div className="h-5 w-0.5" style={{ background: "var(--tree-line)" }} />
      <div
        className="min-w-[220px] rounded-[13px] bg-raised px-7 py-4 text-center"
        style={{ border: "2px solid var(--accent)", boxShadow: "var(--shadow-borrower)" }}
      >
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Borrower</div>
        <div className="text-[14.5px] font-bold">{borrowerName}</div>
        <div className="mt-0.5 text-[12px] text-ink-muted">{sector}</div>
      </div>
    </div>
  );
}

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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
      <Card watermark className="p-6">
        <SectionHead kicker="Household & Ownership" subtitle="Ownership structure" explain={EXPLAIN} />
        <OwnershipTree owners={owners} borrowerName={name} sector={sector} />
        {guarantors.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {guarantors.map((g, i) => (
              <span key={i} className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-bold text-ink-body" style={{ background: "var(--surface-overlay)" }}>
                {g.accountName ?? "—"} · {g.borrowerType}
              </span>
            ))}
          </div>
        )}
        {/* RELATED PARTIES: every collapsed connection that is not an owner.
            An affiliate with no ownership percent is still a relationship, and
            the ownership tree has nowhere to put it — it used to render
            nowhere at all. */}
        {others.length > 0 && (
          <div className="mt-5">
            <div className="kicker mb-2">Related parties</div>
            {others.map((c, i) => (
              <div key={c.counterpartyId ?? i} className="flex items-center justify-between border-t border-divider py-2.5 text-[13px]">
                <span className="font-semibold">{c.counterpartyName ?? "—"}</span>
                <span className="text-ink-body">
                  {c.role ?? "Related"}
                  {c.ownershipPercent != null ? ` · ${fmtPct(c.ownershipPercent, 0)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {les.length > 0 && (
          <div className="mt-5">
            <div className="kicker mb-2">Legal entities & roles</div>
            {les.map((e, i) => (
              <div key={i} className="flex items-center justify-between border-t border-divider py-2.5 text-[13px]">
                <span className="font-semibold">{e.accountName ?? "—"}</span>
                <span className="text-ink-body">
                  {e.relationshipType ?? e.borrowerType ?? "—"}
                  {e.guarantyAmountType ? ` · ${e.guarantyAmountType}` : ""}
                  {e.ownershipPercent != null ? ` · ${fmtPct(e.ownershipPercent, 0)}` : ""}
                  {e.facilityCount > 1 ? ` · ${e.facilityCount} facilities` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <NoteCaption note={graph.note} />
      </Card>

      <Card className="p-6">
        <div className="kicker mb-1.5">Decision Ledger</div>
        <div className="mb-4 text-[16px] font-bold">Credit history</div>
        <GapChip title="Decision ledger not wired in this artifact" provenance="Lives in the deal workspace / experience-mcp (recall_decisions)" />
      </Card>
    </div>
  );
}
