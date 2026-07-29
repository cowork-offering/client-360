import type { ReactNode } from "react";
import { STATUS, type Tone } from "../../../data/finance";
import type { OnboardingCase, ScreeningResult } from "../../../data/onboarding";
import { RESULT_LABEL } from "../../../data/onboarding";

/* The onboarding tabs borrow the credit surfaces' grammar wholesale: the same
   Card, the same uppercase column head, the same STATUS tones. Status is TEXT
   in a table row, coloured by tone — never a wall of pills (founder doctrine).
   Only two things wear a badge here, and both are provenance rather than
   status: "Simulated (demo)" and "sample". */

export function screeningTone(result: ScreeningResult): Tone {
  switch (result) {
    case "Hit":
      return "red";
    case "PotentialMatch":
      return "amber";
    case "Pending":
      return "amber";
    case "NotRun":
      return "neutral";
    default:
      return "green";
  }
}

export function severityTone(severity: "critical" | "warning" | "info"): Tone {
  return severity === "critical" ? "red" : severity === "warning" ? "amber" : "neutral";
}

/** A status fact, rendered as coloured text on the row it belongs to. */
export function StatusText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="text-[12.5px] font-bold" style={{ color: STATUS[tone].fg }}>
      {children}
    </span>
  );
}

export function ResultText({ result }: { result: ScreeningResult }) {
  return <StatusText tone={screeningTone(result)}>{RESULT_LABEL[result]}</StatusText>;
}

/**
 * The provenance stamp that every screening row carries.
 *
 * §3.4 — the label propagates with the evidence. A simulated result that loses
 * its label on the way to the screen is indistinguishable from a real one, and
 * that is the single most dangerous thing this surface could do.
 */
export function SimulatedBadge() {
  return (
    <span
      className="ml-2 inline-flex flex-none items-center rounded bg-wash-2 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-ink-label"
      title="Not a screening provider result. This row was generated for the prototype."
    >
      Simulated (demo)
    </span>
  );
}

export function ColumnHead({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div
      className="grid gap-3.5 px-6 py-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

export function Row({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div
      className="c360-row-in grid items-center gap-3.5 border-t border-divider px-6 py-3.5 text-[13px]"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

/** The sample-data banner every onboarding tab carries once, at the top. It is
 *  not decoration: this whole surface is baked, and saying so on every tab is
 *  cheaper than one person mistaking it for the org. */
export function SampleNote({ kase }: { kase: OnboardingCase }) {
  if (kase._sample_only !== true) return null;
  return (
    <div className="rounded-[10px] border border-dashed border-border-strong bg-wash px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-label">
      Sample onboarding case. No record on this tab exists in the org, and no screening result here came from a provider.
    </div>
  );
}
