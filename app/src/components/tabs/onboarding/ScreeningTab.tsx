import { useApp } from "../../../state/appState";
import { fmtRelative } from "../../../data/format";
import { SCREENING_LABEL, worstScreening, type OnboardingCase } from "../../../data/onboarding";
import { Card, SectionHead, EmptyState, NoteCaption } from "../../ui";
import { ColumnHead, ResultText, Row, SampleNote, SimulatedBadge, StatusText, screeningTone } from "./shared";
import { STATUS } from "../../../data/finance";

const EXPLAIN = "What did the screens return on this prospect and its parties, and which result is holding the case?";

const SCREEN_COLS = "1.5fr 1.1fr 1.2fr 1.2fr";

export function ScreeningTab({ kase }: { kase: OnboardingCase }) {
  const { data } = useApp();
  const generatedAt = data.meta?.generatedAt ?? "";
  const rows = kase.screenings ?? [];
  const worst = worstScreening(kase);
  const blockingById = new Map((kase.blockingItems ?? []).map((b) => [b.itemId, b]));

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Onboarding · screening" subtitle="Sanctions, PEP, adverse media and KYB" explain={EXPLAIN} />
      <SampleNote kase={kase} />

      <Card className="flex flex-wrap items-center gap-8 px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Worst result on the case</div>
          <div className="mt-0.5 text-[23px] font-extrabold" style={{ color: STATUS[screeningTone(worst)].fg }}>
            <ResultText result={worst} />
          </div>
        </div>
        <div className="self-stretch w-px bg-border" />
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Screens run</div>
          <div className="tnum mt-0.5 text-[23px] font-extrabold">{rows.length}</div>
        </div>
        <div className="self-stretch w-px bg-border" />
        <div className="min-w-[260px] flex-1 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
          Every row below was generated for this prototype and is labelled Simulated (demo). No screening provider was called, and a simulated result never loses its label on the way to this screen.
        </div>
      </Card>

      {rows.length ? (
        <Card className="py-1">
          <div className="kicker px-6 pb-1.5 pt-4">Screening evidence</div>
          <ColumnHead cols={SCREEN_COLS}>
            <span>Party</span>
            <span>Screen</span>
            <span>Result</span>
            <span>Screened</span>
          </ColumnHead>
          {rows.map((s) => {
            const block = s.blockingItemId ? blockingById.get(s.blockingItemId) : undefined;
            return (
              <div key={s.screeningId}>
                <Row cols={SCREEN_COLS}>
                  <span className="truncate text-[13.5px] font-bold text-ink">{s.partyName}</span>
                  <span className="text-[12.5px] font-semibold text-ink-body">{SCREENING_LABEL[s.screeningType]}</span>
                  <span>
                    <ResultText result={s.result} />
                    {s.simulated && <SimulatedBadge />}
                  </span>
                  <span className="text-[12.5px] text-ink-label">
                    {s.screenedOn ? fmtRelative(s.screenedOn, generatedAt) : "not run"}
                    <span className="ml-1.5 text-[11.5px] text-ink-faint">{s.provider}</span>
                  </span>
                </Row>
                {s.findings && (
                  // Findings are the provider's words, not ours. Quoted and
                  // fenced so nothing in them reads as an instruction to anyone.
                  <div className="border-t border-divider px-6 pb-3.5 pt-2.5">
                    <div className="kicker mb-1">Finding, as returned</div>
                    <blockquote
                      className="rounded-[8px] bg-wash px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-body"
                      style={{ borderLeft: "3px solid var(--border-strong)", textWrap: "pretty" as never }}
                    >
                      {s.findings}
                    </blockquote>
                    {block && (
                      <div className="mt-2 text-[12px]">
                        <span className="text-ink-label">Drives blocking item: </span>
                        <StatusText tone={block.severity === "critical" ? "red" : "amber"}>{block.title}</StatusText>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      ) : (
        <Card className="p-6">
          <EmptyState
            title="No screening run"
            body="No sanctions, PEP, adverse-media or KYB screen has been recorded against this case. That is an absence, not a clearance."
          />
        </Card>
      )}

      <NoteCaption note={kase.note} />
    </div>
  );
}
