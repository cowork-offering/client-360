/* =============================================================================
   THE CLIENT PAGE'S DESK, ON THE SESSION BRAIN.

   The client chat used to travel a 600-character gateway prompt with the
   current tab injected, and a "rundown" came back as tab talk and generic
   credit padding (founder, 2026-09-03: "the normal chat is awful; it should be
   page agnostic"). The rooms feel like a session because the model answers
   with the whole book in view; the desk now gets the same footing.

   PAGE-AGNOSTIC BY CONSTRUCTION: the context is the relationship, never the
   tab. Figures come from the bundle the cockpit already read from the bank's
   systems; nothing here calls a tool, so nothing here can invent a read.
   ============================================================================= */

import type { BorrowerBundle, C360Data } from "../data/contract";
import { fmtDate, fmtMoney } from "../data/format";
import { isActiveFacility } from "../data/worklist";
import { askSession, sampleAvailable } from "./sampleDoor";

const CONTEXT_CAP = 7000;

const DESK_RULES =
  "You are the credit desk for this relationship. Answer in plain prose, no headings, no markdown, no bullet characters. " +
  "Use only the figures in the context; when something is not there, say this view does not carry it, in one clause, and move on. " +
  "Never mention tabs, views or where the reader is standing. A rundown is a lead sentence, then the facts that matter, at most six sentences.";

function facilityLine(f: {
  productType?: string | null;
  committed?: number | null;
  outstanding?: number | null;
  maturityDate?: string | null;
  interestRate?: number | null;
  stage?: string | null;
}): string {
  return [
    f.productType ?? "facility",
    f.committed != null ? `${fmtMoney(f.committed)} committed` : null,
    f.outstanding != null ? `${fmtMoney(f.outstanding)} drawn` : null,
    f.interestRate != null ? `${f.interestRate}%` : null,
    f.maturityDate ? `matures ${fmtDate(f.maturityDate)}` : null,
    f.stage && f.stage !== "Booked" ? `(${f.stage})` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** The whole relationship as prose, uncapped by the gateway's tiny budget. */
export function deskContext(bundle: BorrowerBundle, accountName: string): string {
  const parts: string[] = [];
  const sn = (bundle.snapshot ?? {}) as unknown as Record<string, unknown>;

  parts.push(
    [
      `${accountName}`,
      sn.industry ? `${sn.industry}` : null,
      sn.primaryRiskRating != null ? `risk grade ${sn.primaryRiskRating}` : null,
      sn.annualRevenue != null ? `annual revenue ${fmtMoney(Number(sn.annualRevenue))}` : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  );

  const facs = (bundle.exposure?.facilities ?? []).filter(isActiveFacility);
  if (facs.length) {
    const committed = facs.reduce((a, f) => a + (f.committed ?? 0), 0);
    const drawn = facs.reduce((a, f) => a + (f.outstanding ?? 0), 0);
    parts.push(`Facilities: ${fmtMoney(committed)} committed, ${fmtMoney(drawn)} drawn across ${facs.length}.`);
    for (const f of facs) parts.push(facilityLine(f) + ".");
  }

  const covs = bundle.covenants?.covenants ?? [];
  for (const c of covs) {
    parts.push(
      [
        c.covenantType ?? "Covenant",
        c.latestComplianceStatus ? `${c.latestComplianceStatus}` : null,
        c.actualValue != null ? `last ${c.actualValue}` : null,
        c.nextEvaluationDate ? `next test ${fmtDate(c.nextEvaluationDate)}` : null,
      ]
        .filter(Boolean)
        .join(", ") + ".",
    );
  }

  if (sn.nextReviewDate) parts.push(`Next annual review ${fmtDate(String(sn.nextReviewDate))}.`);

  const acts = bundle.activity ?? [];
  for (const a of acts.slice(0, 6)) {
    const t = (a as { title?: string; ts?: string }).title;
    const ts = (a as { ts?: string }).ts;
    if (t) parts.push(`Recent: ${t}${ts ? ` (${fmtDate(ts.slice(0, 10))})` : ""}.`);
  }

  const opps = (bundle.opportunities as { opportunities?: Array<{ name?: string; amount?: number; stage?: string }> } | undefined)
    ?.opportunities;
  for (const o of (opps ?? []).slice(0, 4)) {
    if (o?.name) parts.push(`Open opportunity: ${o.name}${o.amount != null ? `, ${fmtMoney(o.amount)}` : ""}${o.stage ? `, ${o.stage}` : ""}.`);
  }

  let out = parts.join(" ");
  if (out.length > CONTEXT_CAP) out = out.slice(0, CONTEXT_CAP);
  return out;
}

/** Whether the desk can take this ask on the session brain. */
export const deskAvailable = (): boolean => sampleAvailable();

/** Ask the desk. Throws the sample door's own failure shapes; the caller keeps
 *  its gateway fallback. */
export async function askDesk(args: {
  data: C360Data;
  bundle: BorrowerBundle;
  accountName: string;
  question: string;
  signal?: AbortSignal;
  onText?: (update: { text: string }) => void;
}): Promise<string> {
  const prompt = `${DESK_RULES}\n\nContext:\n${deskContext(args.bundle, args.accountName)}\n\nQuestion: ${args.question}`;
  return askSession(prompt, { tier: "default", kind: "reply", signal: args.signal, onText: args.onText });
}
