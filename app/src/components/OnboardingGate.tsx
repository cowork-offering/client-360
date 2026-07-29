import {
  ATTESTATION_HUMAN_ONLY,
  ONBOARDING_TOOLS_PENDING,
  ONBOARDING_TOOLS_PENDING_CODE,
  type OnboardingAction,
} from "../actions/onboardingActions";

/**
 * The honest gate.
 *
 * A banker pressed a real button and this is what came back: the write did not
 * happen, here is why, here is where it will happen when it does. No spinner
 * that resolves green, no toast that says "sent". The code is carried in the
 * card because a support conversation about a gate that has no name is a
 * conversation nobody can close.
 */
export function OnboardingGateCard({ action, onDismiss }: { action: OnboardingAction; onDismiss: () => void }) {
  return (
    <div
      data-gate={ONBOARDING_TOOLS_PENDING_CODE}
      className="rounded-[12px] px-5 py-4"
      style={{ background: "var(--warning-bg)", border: "1px solid var(--border-strong)" }}
    >
      <div className="flex items-start gap-3.5">
        <svg width="20" height="20" viewBox="0 0 20 20" className="mt-px flex-none" style={{ color: "var(--warning)" }}>
          <circle cx="10" cy="10" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 6.2v4.4M10 13.4v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--warning)" }}>
              Not filed
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
              {ONBOARDING_TOOLS_PENDING_CODE}
            </span>
          </div>
          <div className="text-[13.5px] font-bold text-ink">{action.label}</div>
          <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--warning-prose)", textWrap: "pretty" as never }}>
            {ONBOARDING_TOOLS_PENDING}
          </div>
          {action.note && (
            <div className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--warning-prose)", textWrap: "pretty" as never }}>
              {action.note}
            </div>
          )}
          {action.humanOnly && (
            <div className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--warning-prose)", textWrap: "pretty" as never }}>
              {ATTESTATION_HUMAN_ONLY}
            </div>
          )}
          <div className="mt-2.5 text-[11.5px] text-ink-faint">Would write to {action.target}</div>
          <button
            type="button"
            onClick={onDismiss}
            className="c360-press mt-3 rounded-[8px] border border-border-strong bg-raised px-3 py-1.5 text-[11.5px] font-semibold text-ink-body hover:border-accent hover:text-accent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
