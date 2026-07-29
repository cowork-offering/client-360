import { useState } from "react";
import { useApp } from "../../../state/appState";
import { fmtDate, fmtRelative } from "../../../data/format";
import {
  ATTESTATION_REASON,
  completionBlockers,
  canComplete,
  type OnboardingCase,
} from "../../../data/onboarding";
import { ONBOARDING_ACTIONS, type OnboardingAction } from "../../../actions/onboardingActions";
import { Card, SectionHead, NoteCaption } from "../../ui";
import { OnboardingTicket } from "../../OnboardingTicket";
import { SampleNote, StatusText } from "./shared";

const EXPLAIN = "What is the clearance state on this case, and what does attesting unlock?";

const ATTEST_ACTION: OnboardingAction =
  ONBOARDING_ACTIONS.find((a) => a.id === "attest-clearance") ?? ONBOARDING_ACTIONS[0];

export function AttestationTab({ kase }: { kase: OnboardingCase }) {
  const { data } = useApp();
  const generatedAt = data.meta?.generatedAt ?? "";
  const [ticket, setTicket] = useState(false);

  const clearance = kase.clearance ?? { present: false, clearedBy: null, clearedOn: null, basis: null };
  // Everything except the clearance itself. A case with an empty list here is
  // the "ready, awaiting attestation" state — the whole point of this tab.
  const otherBlockers = completionBlockers(kase).filter((r) => r !== "Awaiting human KYC clearance attestation");
  const ready = !clearance.present && otherBlockers.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionHead kicker="Onboarding · attestation" subtitle="KYC clearance gate" explain={EXPLAIN} />
      <SampleNote kase={kase} />

      <Card className="px-6 py-5">
        <div className="kicker mb-2">Clearance state</div>
        {clearance.present ? (
          <>
            <div className="text-[23px] font-extrabold" style={{ color: "var(--positive)" }}>
              Attested
            </div>
            <div className="mt-1.5 text-[13px] text-ink-body">
              {clearance.clearedBy ?? "Unnamed"} · {clearance.clearedOn ? fmtDate(clearance.clearedOn) : "no timestamp recorded"}
            </div>
            {clearance.basis && (
              <div className="mt-2 text-[12.5px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
                {clearance.basis}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-[23px] font-extrabold" style={{ color: ready ? "var(--warning)" : "var(--ink-muted)" }}>
              {ready ? "Ready, awaiting attestation" : "Not attested"}
            </div>
            <div className="mt-1.5 max-w-[700px] text-[13px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
              {ready
                ? "Every diligence item on this case is closed. No clearance record exists, so the case cannot complete, and nothing here will create one on a banker's behalf."
                : ATTESTATION_REASON}
            </div>
          </>
        )}
      </Card>

      <Card className="py-1">
        <div className="kicker px-6 pb-2 pt-4">What has to be true</div>
        <div className="flex flex-col">
          <GateRow
            label="Client attestation received"
            met={clearance.clientAttestationReceived === true}
            detail={
              clearance.clientAttestationReceived
                ? `Received ${clearance.clientAttestationOn ? fmtRelative(clearance.clientAttestationOn, generatedAt) : "— no date recorded"}`
                : "The client has not attested to the information they supplied."
            }
          />
          <GateRow
            label="Diligence items closed"
            met={otherBlockers.length === 0}
            detail={
              otherBlockers.length === 0
                ? "No open blocking item on this case."
                : `${otherBlockers.length} open: ${otherBlockers.join("; ")}.`
            }
          />
          <GateRow
            label="Human KYC clearance attested"
            met={clearance.present}
            detail={
              clearance.present
                ? `Attested by ${clearance.clearedBy ?? "an unnamed user"}.`
                : "No clearance record exists. Only a named human can create one, and the refusal is enforced in Apex, not here."
            }
          />
        </div>
      </Card>

      <Card className="px-6 py-5">
        <div className="kicker mb-1.5">What attesting unlocks</div>
        <div className="max-w-[700px] text-[13px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
          A clearance record is the only thing that lets this case reach Complete. On Complete the relationship leaves the onboarding
          pipeline, joins the book, and the classic Customer 360 tabs mount in place of these. Nothing else moves it — not a stage
          advance, not a clean screen, not an agent.
        </div>
        <div className="mt-3 text-[12.5px]">
          <span className="text-ink-label">Case can complete: </span>
          {canComplete(kase) ? <StatusText tone="green">Yes</StatusText> : <StatusText tone="red">No</StatusText>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setTicket(true)}
            disabled={clearance.present}
            className="c360-press c360-accent-btn inline-flex flex-none items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[12px] font-semibold disabled:opacity-45"
          >
            Attest KYC clearance
          </button>
          <span className="text-[11.5px] text-ink-faint">
            {clearance.present ? "Already attested on this case." : "Opens the full attestation ticket. Nothing is written today."}
          </span>
        </div>
        {ticket && <OnboardingTicket action={ATTEST_ACTION} kase={kase} onClose={() => setTicket(false)} />}
      </Card>

      <NoteCaption note={kase.note} />
    </div>
  );
}

function GateRow({ label, met, detail }: { label: string; met: boolean; detail: string }) {
  return (
    <div className="grid items-start gap-3.5 border-t border-divider px-6 py-3.5" style={{ gridTemplateColumns: "1.4fr 0.7fr 2.4fr" }}>
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <StatusText tone={met ? "green" : "amber"}>{met ? "Met" : "Not met"}</StatusText>
      <span className="text-[12.5px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
        {detail}
      </span>
    </div>
  );
}
