import type { OnboardingCase, OnboardingParty } from "../../../data/onboarding";
import { fmtPct } from "../../../data/format";
import { Card, SectionHead, EmptyState, GapChip, NoteCaption, StatCell, StatDivider, StatStrip } from "../../ui";
import { ColumnHead, Row, SampleNote, StatusText } from "./shared";

const EXPLAIN = "Who owns this prospect, how much of it, and which of those edges are confirmed?";

const PARTY_COLS = "1.9fr 1fr 1.1fr 0.9fr 1.2fr";

const SOURCE_LABEL: Record<OnboardingParty["source"], string> = {
  fsc: "FSC relationship",
  ncino: "nCino connection",
  intake: "Claimed on intake",
};

function PartyRows({ parties }: { parties: OnboardingParty[] }) {
  return (
    <>
      <ColumnHead cols={PARTY_COLS}>
        <span>Party</span>
        <span>Role</span>
        <span>Reciprocal</span>
        <span>Ownership</span>
        <span>Status</span>
      </ColumnHead>
      {parties.map((p) => (
        <div key={p.partyId}>
          <Row cols={PARTY_COLS}>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-bold text-ink">{p.name}</div>
              <div className="mt-px text-[11.5px] text-ink-muted">
                {p.partyType} · {SOURCE_LABEL[p.source]}
              </div>
            </div>
            <span className="text-[12.5px] font-semibold text-ink-body">{p.role}</span>
            <span className="text-[12.5px] text-ink-label">{p.reciprocalRole}</span>
            <span className="tnum text-[13px] font-bold text-ink">
              {p.ownershipPercent == null ? "—" : fmtPct(p.ownershipPercent)}
            </span>
            {p.confirmed ? (
              <StatusText tone="green">Confirmed</StatusText>
            ) : (
              <StatusText tone="amber">Unconfirmed</StatusText>
            )}
          </Row>
          {p.note && (
            <div className="border-t border-divider px-6 pb-3 pt-2 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
              {p.note}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function PartiesTab({ kase }: { kase: OnboardingCase }) {
  const parties = kase.parties ?? [];
  // Claimed parties are held apart from seeded edges for the same reason intake
  // is held apart from the bank's facts: one is evidence, the other is an
  // assertion by the applicant.
  const seeded = parties.filter((p) => p.source !== "intake");
  const claimed = parties.filter((p) => p.source === "intake");

  const ownershipTotal = parties.reduce<number | null>(
    (acc, p) => (p.ownershipPercent == null ? acc : (acc ?? 0) + p.ownershipPercent),
    null,
  );
  const walked = ownershipTotal != null && ownershipTotal >= 99.5;

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Onboarding · parties" subtitle="Ownership and control" explain={EXPLAIN} />
      <SampleNote kase={kase} />

      <StatStrip>
        <StatCell
          label="Ownership accounted for"
          value={ownershipTotal == null ? "—" : fmtPct(ownershipTotal)}
          color={walked ? "var(--positive)" : "var(--warning)"}
        />
        <StatDivider />
        <StatCell label="Parties on file" value={String(parties.length)} sub={parties.length === 1 ? "party" : "parties"} />
        <StatDivider />
        <div className="min-w-[240px] flex-1 self-center">
          <GapChip
            title="Beneficial ownership is read, never written here"
            provenance="Edges are pre-seeded with typed roles and confirmed by a human. Nothing in this cockpit creates or edits one."
          />
        </div>
      </StatStrip>

      {seeded.length ? (
        <Card className="py-1">
          <div className="kicker px-6 pb-1.5 pt-4">Seeded relationships</div>
          <PartyRows parties={seeded} />
        </Card>
      ) : (
        <Card className="p-6">
          <EmptyState
            title="No ownership edges seeded"
            body="No relationship has been recorded against this prospect yet. Ownership has to be established before due diligence can close."
          />
        </Card>
      )}

      {claimed.length > 0 && (
        <Card className="py-1">
          <div className="kicker px-6 pb-1.5 pt-4">Claimed, unconfirmed</div>
          <div className="px-6 pb-1 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
            Stated by the applicant on the intake form. Nothing below has been corroborated by the bank.
          </div>
          <PartyRows parties={claimed} />
        </Card>
      )}

      <NoteCaption note={kase.note} />
    </div>
  );
}
