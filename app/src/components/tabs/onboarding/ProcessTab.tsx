import { useApp } from "../../../state/appState";
import { fmtDate, fmtMoney, fmtRelative } from "../../../data/format";
import {
  ATTESTATION_REASON,
  ONBOARDING_STAGES,
  STAGE_LABEL,
  TYPE_LABEL,
  daysInStage,
  stageIndex,
  type OnboardingCase,
} from "../../../data/onboarding";
import { STATUS } from "../../../data/finance";
import { Card, SectionHead, EmptyState, NoteCaption } from "../../ui";
import { Row, ColumnHead, SampleNote, StatusText, severityTone } from "./shared";

const EXPLAIN = "Where does this onboarding case stand, and what is holding it out of the next stage?";

const BLOCK_COLS = "1.7fr 3fr 1.1fr";

/** The four stages, in the org's order, with the current one lit. The fourth is
 *  drawn as a LOCKED step wherever clearance is absent: the case cannot reach
 *  Complete, and a tracker that showed it as merely "next" would be lying. */
function StageTrack({ kase, generatedAt }: { kase: OnboardingCase; generatedAt: string }) {
  const current = stageIndex(kase.stage);
  const days = daysInStage(kase, generatedAt);
  const locked = !kase.clearance?.present;

  return (
    <Card className="px-6 py-5">
      <div className="kicker mb-3.5">Stage</div>
      <div className="flex flex-col gap-0">
        {ONBOARDING_STAGES.map((stage, i) => {
          const event = (kase.stageHistory ?? []).find((e) => e.stage === stage);
          const done = i < current;
          const active = i === current;
          const terminalLocked = stage === "Complete" && locked;
          const color = terminalLocked
            ? "var(--critical)"
            : active
              ? "var(--accent)"
              : done
                ? "var(--positive)"
                : "var(--ink-faint)";

          return (
            <div key={stage} className="flex gap-3.5">
              {/* rail */}
              <div className="flex w-4 flex-none flex-col items-center">
                <span
                  className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: done || active ? color : "transparent", border: `1.5px solid ${color}` }}
                />
                {i < ONBOARDING_STAGES.length - 1 && <span className="w-px flex-1" style={{ background: "var(--border)" }} />}
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13.5px]" style={{ color, fontWeight: active || terminalLocked ? 700 : 600 }}>
                    {STAGE_LABEL[stage]}
                  </span>
                  {active && days != null && (
                    <span className="text-[11.5px] text-ink-muted">
                      {days === 0 ? "entered today" : `${days} day${days === 1 ? "" : "s"} in stage`}
                    </span>
                  )}
                  {terminalLocked && (
                    <span className="text-[11.5px] font-semibold" style={{ color: "var(--critical)" }}>
                      locked
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-faint">
                  {event?.enteredAt
                    ? `${fmtDate(event.enteredAt)} · ${fmtRelative(event.enteredAt, generatedAt)}${event.advancedBy ? ` · ${event.advancedBy}` : ""}`
                    : terminalLocked
                      ? ATTESTATION_REASON
                      : "not reached"}
                </div>
                {event?.note && (
                  <div className="mt-1 text-[12px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
                    {event.note}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** What the prospect CLAIMED, arriving through the client-facing front door.
 *  Rendered as claims, labelled as claims, never merged into the bank's facts. */
function IntakeCard({ kase, generatedAt }: { kase: OnboardingCase; generatedAt: string }) {
  const intake = kase.intake;
  if (!intake) return null;
  return (
    <Card className="px-6 py-5">
      <div className="kicker mb-2">Arrived through client intake</div>
      <div className="grid gap-x-8 gap-y-2.5 text-[12.5px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Submission</div>
          <div className="mt-0.5 font-semibold text-ink">{intake.submissionId}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Received</div>
          <div className="mt-0.5 font-semibold text-ink">
            {fmtDate(intake.receivedAt)} · {fmtRelative(intake.receivedAt, generatedAt)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Channel</div>
          <div className="mt-0.5 font-semibold text-ink">{intake.channel}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-ink-label">Claimed identity</div>
          <div className="mt-0.5 font-semibold text-ink">{intake.claimedEmail}</div>
          {intake.claimedContact && <div className="mt-px text-[11.5px] text-ink-muted">{intake.claimedContact}</div>}
        </div>
      </div>
      {intake.note && (
        <div className="mt-3.5 border-t border-divider pt-3 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
          {intake.note}
        </div>
      )}
    </Card>
  );
}

export function ProcessTab({ kase }: { kase: OnboardingCase }) {
  const { data } = useApp();
  const generatedAt = data.meta?.generatedAt ?? "";
  const blocking = kase.blockingItems ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Onboarding · process" subtitle={`${TYPE_LABEL[kase.type]} · ${kase.status}`} explain={EXPLAIN} />
      <SampleNote kase={kase} />

      {kase.verdict && (
        <Card className="px-6 py-4">
          <div className="text-[14px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
            {kase.verdict}
          </div>
        </Card>
      )}

      <StageTrack kase={kase} generatedAt={generatedAt} />

      <IntakeCard kase={kase} generatedAt={generatedAt} />

      <Card className="py-1">
        <div className="kicker px-6 pb-1.5 pt-4">Blocking items</div>
        {blocking.length ? (
          <>
            <ColumnHead cols={BLOCK_COLS}>
              <span>Item</span>
              <span>Why it holds</span>
              <span>Holds out of</span>
            </ColumnHead>
            {blocking.map((b) => (
              <Row key={b.itemId} cols={BLOCK_COLS}>
                <StatusText tone={severityTone(b.severity)}>{b.title}</StatusText>
                <span className="text-[12.5px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
                  {b.detail}
                </span>
                <span className="text-[12.5px] text-ink-label">{STAGE_LABEL[b.blocksStage]}</span>
              </Row>
            ))}
          </>
        ) : (
          <div className="px-6 pb-2">
            <EmptyState
              title="Nothing blocking except the attestation"
              body="Every diligence item on this case is closed. What remains is the clearance gate, on the Attestation tab."
            />
          </div>
        )}
      </Card>

      {kase.targetDeal && (
        <Card className="flex flex-wrap items-center gap-8 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold text-ink-label">The deal this becomes</div>
            <div className="mt-0.5 text-[19px] font-extrabold text-ink">{kase.targetDeal.headline}</div>
            <div className="mt-px text-[12px] text-ink-muted">{kase.targetDeal.product}</div>
          </div>
          <div className="self-stretch w-px bg-border" />
          <div>
            <div className="text-[11px] font-semibold text-ink-label">Indicative amount</div>
            <div className="tnum mt-0.5 text-[23px] font-extrabold">{fmtMoney(kase.targetDeal.amount)}</div>
          </div>
          <div className="min-w-[240px] flex-1 text-[11.5px] leading-relaxed text-ink-faint" style={{ textWrap: "pretty" as never }}>
            Indicative only. No product package, facility or credit action exists on this relationship until the case completes and the deal is originated.
          </div>
        </Card>
      )}

      <div
        className="flex items-start gap-3.5 rounded-[14px] px-5 py-4"
        style={{ background: STATUS.red.bg }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" className="mt-px flex-none" style={{ color: "var(--critical)" }}>
          <rect x="4.5" y="8.5" width="11" height="8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 8.5V6.4a3 3 0 016 0v2.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--critical)" }}>
            Terminal gate
          </div>
          <div className="text-[14px] font-medium leading-relaxed" style={{ color: "var(--critical)", textWrap: "pretty" as never }}>
            {ATTESTATION_REASON}
          </div>
        </div>
      </div>

      <NoteCaption note={kase.note} />
    </div>
  );
}
