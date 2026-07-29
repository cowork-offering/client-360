import { useApp } from "../../../state/appState";
import { fmtDate, fmtRelative } from "../../../data/format";
import { documentCounts, type OnboardingCase } from "../../../data/onboarding";
import { Card, SectionHead, EmptyState, NoteCaption } from "../../ui";
import { ColumnHead, Row, SampleNote, StatusText } from "./shared";

const EXPLAIN = "Which identity documents are on file for this prospect, and who verified them?";

const DOC_COLS = "1.5fr 1fr 1fr 1fr 1.6fr";

/** Expiry is a fact the org's own field gives us for free — a document that has
 *  expired is not evidence, whatever its status says. */
function expiryTone(expirationDate: string | null, generatedAt: string): "red" | "amber" | null {
  if (!expirationDate) return null;
  const exp = new Date(expirationDate).getTime();
  const now = new Date(generatedAt).getTime();
  if (Number.isNaN(exp) || Number.isNaN(now)) return null;
  const days = Math.round((exp - now) / 86_400_000);
  if (days < 0) return "red";
  if (days <= 90) return "amber";
  return null;
}

export function DocumentsTab({ kase }: { kase: OnboardingCase }) {
  const { data } = useApp();
  const generatedAt = data.meta?.generatedAt ?? "";
  const docs = kase.documents ?? [];
  const counts = documentCounts(kase);

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Onboarding · documents" subtitle="Identity evidence" explain={EXPLAIN} />
      <SampleNote kase={kase} />

      <Card className="flex flex-wrap items-center gap-8 px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Verified</div>
          <div className="tnum mt-0.5 text-[23px] font-extrabold" style={{ color: "var(--positive)" }}>
            {counts.verified}
          </div>
        </div>
        <div className="self-stretch w-px bg-border" />
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Awaiting verification</div>
          <div className="tnum mt-0.5 text-[23px] font-extrabold" style={{ color: counts.pending ? "var(--warning)" : "var(--ink)" }}>
            {counts.pending}
          </div>
        </div>
        <div className="self-stretch w-px bg-border" />
        <div className="min-w-[240px] flex-1 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
          Verification is a named human and a timestamp, recorded on the document itself. A document with no verifier is not verified, whoever uploaded it.
        </div>
      </Card>

      {docs.length ? (
        <Card className="py-1">
          <div className="kicker px-6 pb-1.5 pt-4">Identity documents</div>
          <ColumnHead cols={DOC_COLS}>
            <span>Party</span>
            <span>Type</span>
            <span>Issuing country</span>
            <span>Expires</span>
            <span>Verification</span>
          </ColumnHead>
          {docs.map((d) => {
            const tone = expiryTone(d.expirationDate, generatedAt);
            return (
              <div key={d.documentId}>
                <Row cols={DOC_COLS}>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-bold text-ink">{d.partyName}</div>
                    <div className="mt-px text-[11.5px] text-ink-muted">
                      {d.documentNumberMasked ?? "no number recorded"} · {d.source === "intake" ? "uploaded by applicant" : "received by banker"}
                    </div>
                  </div>
                  <span className="text-[12.5px] font-semibold text-ink-body">{d.documentType}</span>
                  <span className="text-[12.5px] text-ink-label">{d.issuingCountry ?? "—"}</span>
                  <span className="tnum text-[12.5px]" style={tone ? { color: `var(--${tone === "red" ? "critical" : "warning"})`, fontWeight: 700 } : undefined}>
                    {d.expirationDate ? fmtDate(d.expirationDate) : "—"}
                  </span>
                  <div className="min-w-0">
                    {d.status === "Verified" && d.verifiedBy ? (
                      <>
                        <StatusText tone="green">Verified</StatusText>
                        <div className="mt-px truncate text-[11.5px] text-ink-muted">
                          {d.verifiedBy} · {fmtRelative(d.verifiedOn, generatedAt)}
                        </div>
                      </>
                    ) : d.status === "Pending" ? (
                      <>
                        <StatusText tone="amber">Pending verification</StatusText>
                        <div className="mt-px text-[11.5px] text-ink-muted">no verifier recorded</div>
                      </>
                    ) : (
                      <>
                        <StatusText tone="neutral">Outstanding</StatusText>
                        <div className="mt-px text-[11.5px] text-ink-muted">not received</div>
                      </>
                    )}
                  </div>
                </Row>
                {d.note && (
                  <div className="border-t border-divider px-6 pb-3 pt-2 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
                    {d.note}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      ) : (
        <Card className="p-6">
          <EmptyState
            title="No documents on file"
            body="Nothing has been received against this case. Identity evidence is the first thing due diligence needs."
          />
        </Card>
      )}

      <NoteCaption note={kase.note} />
    </div>
  );
}
