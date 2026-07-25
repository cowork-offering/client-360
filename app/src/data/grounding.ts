/* =============================================================================
   Grounded prompt builder for the LLM connector.

   The LLM tool takes a bare { prompt }. It has NO access to the cockpit's
   staged data, so an ungrounded question would be answered from the model's
   general knowledge — which, for a credit figure in front of a banker, is the
   worst possible failure. Every chat call therefore carries a compact context
   block assembled from the STAGED bundle, plus an instruction to cite only
   those figures.

   Budget: the context block is capped (CONTEXT_BUDGET) so a large book cannot
   blow up the prompt. Sections are added in priority order and the builder
   stops when the budget is spent — the most decision-relevant figures survive.
   ============================================================================= */

import type { BorrowerBundle, C360Data } from "./contract";
import { fmtMoney, fmtDate } from "./format";
import { covenantCushion, fmtCovThreshold, fmtCovVal } from "./finance";
import { isActiveFacility } from "./worklist";

export const CONTEXT_BUDGET = 2000;

const INSTRUCTION =
  "Answer as a commercial-credit copilot: concise, banker's voice, cite only the figures provided above. " +
  "If the answer is not supported by those figures, say so plainly rather than estimating.";

function line(label: string, value: string | undefined | null): string | null {
  return value ? `${label}: ${value}` : null;
}

/** Compact, high-signal rendering of the staged bundle for the current view. */
function contextBlock(bundle: BorrowerBundle | null, accountName: string, tab: string | null): string {
  if (!bundle) return `Account: ${accountName}\n(no staged detail for this relationship)`;

  const snap = bundle.snapshot ?? { accountId: "" };
  const exp = bundle.exposure ?? {};
  const covs = bundle.covenants?.covenants ?? [];
  const facs = (exp.facilities ?? []).filter(isActiveFacility);
  const boom = bundle.boom?.ratios;

  const sections: Array<string | null> = [
    `Account: ${accountName}${snap.accountId ? ` (${snap.accountId})` : ""}`,
    line("Industry", [snap.industry, snap.naicsCode ? `NAICS ${snap.naicsCode}` : null].filter(Boolean).join(" · ")),
    line("Risk rating", snap.primaryRiskRating ? `Grade ${snap.primaryRiskRating}` : null),
    line("Package stage", snap.primaryStage),
    line("Committed", fmtMoney(exp.totalCommitted ?? snap.totalCreditExposure)),
    line("Drawn", fmtMoney(exp.totalOutstanding ?? snap.totalOutstanding)),
    line("Available", exp.totalAvailable != null ? fmtMoney(exp.totalAvailable) : null),
    line("Annual revenue", snap.annualRevenue != null ? fmtMoney(snap.annualRevenue) : null),
    boom
      ? line(
          "Boom ratios",
          [
            boom.ebitda != null ? `EBITDA ${fmtMoney(boom.ebitda)}` : null,
            boom.totalLeverage != null ? `leverage ${boom.totalLeverage}x` : null,
            boom.interestCoverage != null ? `interest coverage ${boom.interestCoverage}x` : null,
          ]
            .filter(Boolean)
            .join(", "),
        )
      : null,
  ];

  // Covenants — the most-asked-about surface; include cushion + next test.
  if (covs.length) {
    const rows = covs.slice(0, 6).map((c) => {
      const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
      const cushion = cu.cushion != null ? `cushion ${cu.cushion < 0 ? "−" : ""}${fmtCovVal(Math.abs(cu.cushion))}` : "cushion n/a";
      const status = c.breached === true ? "BREACHED" : (c.lastEvaluationStatus ?? "");
      return `  - ${c.covenantType ?? "covenant"}: actual ${fmtCovVal(c.actualValue)} vs ${fmtCovThreshold(
        c.covenantType,
        c.actualValue,
        c.thresholdValue,
      )}, ${cushion}${status ? `, ${status}` : ""}${c.nextEvaluationDate ? `, next test ${fmtDate(c.nextEvaluationDate)}` : ""}`;
    });
    sections.push(`Covenants (${covs.length}):\n${rows.join("\n")}`);
  }

  // Facilities — active only; closed facilities are not live exposure.
  if (facs.length) {
    const rows = facs.slice(0, 6).map(
      (f) =>
        `  - ${f.name ?? f.productType ?? "facility"}: committed ${fmtMoney(f.committed)}, drawn ${fmtMoney(
          f.outstanding,
        )}${f.maturityDate ? `, matures ${fmtDate(f.maturityDate)}` : ""}`,
    );
    sections.push(`Active facilities (${facs.length}):\n${rows.join("\n")}`);
  }

  if (bundle.verdict) sections.push(`Standing verdict: ${bundle.verdict}`);
  if (tab) sections.push(`The banker is looking at the "${tab}" tab.`);

  // Spend the budget in priority order; drop what doesn't fit.
  const out: string[] = [];
  let used = 0;
  for (const s of sections) {
    if (!s) continue;
    if (used + s.length + 1 > CONTEXT_BUDGET) continue;
    out.push(s);
    used += s.length + 1;
  }
  return out.join("\n");
}

/** Book-level context for the home view (no account in scope). */
function bookContext(data: C360Data): string {
  const pf = data.portfolio ?? { accounts: [] };
  const bt = pf.bookTotals ?? {};
  const sig = pf.signals ?? {};
  const parts = [
    `Book: ${bt.accountCount ?? pf.accounts.length} relationships`,
    bt.totalCommitted != null ? `committed ${fmtMoney(bt.totalCommitted)}` : null,
    bt.totalOutstanding != null ? `drawn ${fmtMoney(bt.totalOutstanding)}` : null,
    sig.breachedCount != null ? `${sig.breachedCount} breached covenants` : null,
    sig.covenantsDueSoon?.length ? `${sig.covenantsDueSoon.length} covenant tests due` : null,
    sig.maturitiesSoon?.length ? `${sig.maturitiesSoon.length} maturities in window` : null,
  ].filter(Boolean);

  const top = pf.accounts
    .slice(0, 8)
    .map((a) => `  - ${a.name}: TCE ${fmtMoney(a.tce)}, drawn ${fmtMoney(a.outstanding)}${a.riskRating ? `, grade ${a.riskRating}` : ""}`)
    .join("\n");

  const block = `${parts.join(", ")}\nAccounts:\n${top}`;
  return block.length > CONTEXT_BUDGET ? block.slice(0, CONTEXT_BUDGET) : block;
}

/** Assemble the full prompt sent to the LLM connector. */
export function buildGroundedPrompt(args: {
  data: C360Data;
  bundle: BorrowerBundle | null;
  accountName: string | null;
  tab: string | null;
  question: string;
}): string {
  const { data, bundle, accountName, tab, question } = args;
  const context = accountName ? contextBlock(bundle, accountName, tab) : bookContext(data);
  return [
    "You are answering inside a commercial-credit relationship cockpit.",
    "",
    "CONTEXT (the only figures you may cite):",
    context,
    "",
    `QUESTION: ${question}`,
    "",
    INSTRUCTION,
  ].join("\n");
}
