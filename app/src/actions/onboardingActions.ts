/* =============================================================================
   ONBOARDING WRITE SEAM — declared, visible, and honestly closed.

   Same doctrine as the credit action registry: the action is REAL, the button
   is real, the flow is visible, and nothing fakes a write. What is different is
   that the credit actions route to a staged plan today, and these do not,
   because `Customer360Write` does not carry them yet. So they route to one
   gate card that says exactly that, in the same voice.

   When the tools land, each entry gains its `tool` wiring and the gate falls
   away. The copy below is the ONLY thing standing between the banker and a
   claim this build cannot back.
   ============================================================================= */

import type { ActionIcon, Availability } from "./registry";
import type { OnboardingCase } from "../data/onboarding";

export const ONBOARDING_TOOLS_PENDING_CODE = "ONBOARDING_TOOLS_PENDING";

export const ONBOARDING_TOOLS_PENDING =
  "Onboarding write tools are not yet deployed to the org. This prototype shows the full flow; filing will light up when Customer360Write ships.";

/** The attestation is not merely unwired — it is human-gated by design, and it
 *  would remain so on the day the tools land. Saying only "not deployed yet"
 *  would imply the button eventually does it for you. It never will. */
export const ATTESTATION_HUMAN_ONLY =
  "Clearance is attested by a named human, never by an agent and never by this cockpit. When the tools ship, this records WHO attested and when; it does not decide.";

/** The onboarding lifecycle's own categories. Separate from the credit
 *  registry's Analyze/Originate/Service/Risk because a case that is not booked
 *  yet does none of those things — but the GRAMMAR is identical, so both sets
 *  render as categorised rows in the one actions panel. */
export type OnboardingCategory = "Process" | "Diligence" | "Clearance";

export const ONBOARDING_CATEGORY_ORDER: OnboardingCategory[] = ["Process", "Diligence", "Clearance"];

export interface OnboardingAction {
  id: string;
  label: string;
  category: OnboardingCategory;
  description: string;
  icon: ActionIcon;
  /** The org write it will make when the tools land — named now so the seam is
   *  auditable rather than aspirational. */
  target: string;
  /** True for the one action a human must always perform themselves. */
  humanOnly?: boolean;
  /** What the banker would otherwise assume happened anyway. Rendered on the
   *  gate, because "not filed" leaves an obvious next question — did anything
   *  change on screen? — and the answer belongs next to the refusal. */
  note?: string;
}

export const ONBOARDING_ACTIONS: OnboardingAction[] = [
  {
    id: "advance-stage",
    label: "Advance stage",
    category: "Process",
    icon: "renew",
    description:
      "Moves the case to the next stage on LLC_BI__Onboarding__c. Complete is refused unless a clearance record exists, whatever the caller asks for.",
    target: "LLC_BI__Onboarding__c.LLC_BI__Stage__c",
  },
  {
    id: "record-screening",
    label: "Record screening result",
    category: "Diligence",
    icon: "review",
    description:
      "Files an immutable screening row: type, result, provider, screened-on. A simulated result is stored labelled as simulated and stays that way.",
    target: "KYC_Screening__c",
  },
  {
    id: "attach-document",
    label: "Attach identity document",
    category: "Diligence",
    icon: "memo",
    description:
      "Records an identity document against a party, with its type, issuing country and expiry. Verification is a separate, named act.",
    target: "FinServ__IdentificationDocument__c",
  },
  {
    id: "attest-clearance",
    label: "Attest KYC clearance",
    category: "Clearance",
    icon: "covenant",
    description:
      "Records that a named human cleared this case, on what basis, at what time. This is the only thing that unlocks Complete.",
    target: "KYC_Clearance__c",
    humanOnly: true,
  },
];

/** The onboarding half of the control-centre honesty rule (A27.3): an action
 *  the case cannot support stays VISIBLE and disabled with a reason a banker
 *  wrote. Read only from the case — no clock, no network. */
export function onboardingAvailability(action: OnboardingAction, kase: OnboardingCase): Availability {
  if (action.id === "attest-clearance" && kase.clearance?.present) {
    return { available: false, reason: "Already attested on this case." };
  }
  return { available: true };
}
