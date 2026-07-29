import { useState } from "react";
import { ONBOARDING_TABS, useApp, type OnboardingTab } from "../state/appState";
import {
  STAGE_LABEL,
  TYPE_LABEL,
  daysInStage,
  documentCounts,
  worstScreening,
  RESULT_LABEL,
  type OnboardingCase,
} from "../data/onboarding";
import { STATUS } from "../data/finance";
import { PageContainer } from "./ui";
import { AccentureCaretWatermark, AmbientWash } from "./brand";
import { OnboardingTabContent } from "./tabs/onboarding";
import { OnboardingTicket } from "./OnboardingTicket";
import { ONBOARDING_ACTIONS, type OnboardingAction } from "../actions/onboardingActions";
import { screeningTone } from "./tabs/onboarding/shared";

/* The L2 shell for a case that is not booked yet.

   It is the SAME shell: same frosted verdict bar, same breadcrumb, same stat
   strip, same tab rail, same page container. What differs is what a pre-booking
   relationship actually has — a stage instead of a rating, blocking items
   instead of covenants, a target deal instead of exposure. Borrowing the credit
   surfaces' anchors here would mean rendering rating and TCE cells for a
   relationship that has neither, which is the one thing this cockpit does not
   do. */

function StatCell({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="flex min-h-[46px] flex-col justify-center rounded-[9px] px-3 py-2" style={{ background: "var(--surface-overlay)" }}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-label">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tnum text-[14px] font-bold" style={valueColor ? { color: valueColor } : undefined}>
          {value}
        </span>
        {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
      </span>
    </div>
  );
}

/** The onboarding equivalent of the package-stage chip beside the borrower name. */
function StageChip({ kase }: { kase: OnboardingCase }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[11px] font-bold"
      style={{ background: "var(--accent-wash)", color: "var(--accent)" }}
      title="LLC_BI__Stage__c"
    >
      {STAGE_LABEL[kase.stage]}
    </span>
  );
}

export function OnboardingWorkspace({ kase }: { kase: OnboardingCase }) {
  const { data, state, dispatch } = useApp();
  const generatedAt = data.meta?.generatedAt ?? "";
  const [ticket, setTicket] = useState<OnboardingAction | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const days = daysInStage(kase, generatedAt);
  const docs = documentCounts(kase);
  const worst = worstScreening(kase);
  const blocking = (kase.blockingItems ?? []).length;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div
        className="sticky top-0"
        style={{
          zIndex: "var(--z-verdict)",
          background: "var(--frost-bar)",
          backdropFilter: "blur(18px) saturate(1.5)",
          WebkitBackdropFilter: "blur(18px) saturate(1.5)",
          boxShadow: "var(--frost-shadow)",
        }}
      >
        <PageContainer className="relative overflow-hidden py-4">
          <AmbientWash />
          <AccentureCaretWatermark />
          <div className="relative min-w-0 flex-1">
            <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-ink-label">
              <button
                type="button"
                onClick={() => dispatch({ type: "GO_HOME" })}
                className="inline-flex items-center gap-1.5 font-bold"
                style={{ color: "var(--accent)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <path d="M9 3L5 7l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                In onboarding
              </button>
              <span style={{ color: "var(--crumb-sep)" }}>/</span>
              <span>{[kase.industry, kase.jurisdiction].filter(Boolean).join(" · ") || "—"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[28px] font-extrabold leading-tight tracking-tight">{kase.name}</span>
              <StageChip kase={kase} />
              {kase._sample_only && (
                <span className="rounded bg-wash-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-label">sample</span>
              )}
            </div>
            {kase.verdict && (
              <div className="my-2 max-w-[760px] text-[14px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
                {kase.verdict}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-stretch gap-2.5">
              <StatCell label="Type" value={TYPE_LABEL[kase.type]} />
              <StatCell label="Days in stage" value={days == null ? "—" : String(days)} sub={days === 1 ? "day" : "days"} />
              <StatCell
                label="Blocking"
                value={String(blocking)}
                valueColor={blocking ? STATUS.amber.fg : STATUS.green.fg}
                sub={blocking === 1 ? "item" : "items"}
              />
              <StatCell label="Screening" value={RESULT_LABEL[worst]} valueColor={STATUS[screeningTone(worst)].fg} />
              <StatCell label="Documents" value={`${docs.verified}/${docs.total}`} sub="verified" />
              <span className="ml-auto flex items-center gap-2 self-center">
                <button
                  type="button"
                  onClick={() => setActionsOpen((v) => !v)}
                  aria-expanded={actionsOpen}
                  className="c360-press c360-accent-btn inline-flex flex-none items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-semibold"
                >
                  <svg width="13" height="13" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M3 5.4h12M3 9h12M3 12.6h7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Onboarding Actions
                </button>
              </span>
            </div>
          </div>
        </PageContainer>

        <div className="border-t border-divider">
          <PageContainer className="no-scrollbar flex gap-1 overflow-x-auto">
            {ONBOARDING_TABS.map((t) => {
              const active = state.onboardingTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => dispatch({ type: "SET_ONBOARDING_TAB", tab: t.id as OnboardingTab })}
                  className="c360-press whitespace-nowrap px-3 pb-3 pt-3.5 text-[13.5px]"
                  style={{
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--accent)" : "var(--ink-muted)",
                    borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </PageContainer>
        </div>
      </div>

      <PageContainer className="py-6">
        {actionsOpen && (
          <div className="mb-4 rounded-[14px] bg-raised px-6 py-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="kicker mb-1">Onboarding actions</div>
            <div className="mb-3.5 max-w-[700px] text-[12.5px] leading-relaxed text-ink-body" style={{ textWrap: "pretty" as never }}>
              Every action below is the real write this case needs, named by the object it lands on. Each opens the full
              ticket — briefing, plan, confirmation — and stops at the honest boundary, because none of them files today.
            </div>
            <div className="flex flex-col gap-2.5">
              {ONBOARDING_ACTIONS.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start gap-3 border-t border-divider pt-2.5">
                  <div className="min-w-[240px] flex-1">
                    <div className="text-[13px] font-bold text-ink">{a.label}</div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-ink-muted" style={{ textWrap: "pretty" as never }}>
                      {a.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTicket(a)}
                    className="c360-press mt-0.5 flex-none rounded-[8px] border border-border-strong bg-raised px-3 py-1.5 text-[11.5px] font-semibold text-ink-body hover:border-accent hover:text-accent"
                  >
                    Run
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {ticket && <OnboardingTicket action={ticket} kase={kase} onClose={() => setTicket(null)} />}

        <div key={state.onboardingTab} className="c360-tab-in">
          <OnboardingTabContent tab={state.onboardingTab} kase={kase} />
        </div>
      </PageContainer>
    </div>
  );
}
