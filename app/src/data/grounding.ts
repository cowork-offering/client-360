/* =============================================================================
   Grounded prompt builder for the LLM connector.

   The tool takes a bare { prompt } and has NO access to cockpit data, so every
   question must carry the figures it needs. But HOW those figures are carried
   is demo-critical:

   PAYLOAD SHAPE IS A RELIABILITY CONSTRAINT (live diagnosis 2026-07-25).
   Large machine-generated STRUCTURED payloads on the artifact→connector
   boundary read as exfiltration-shaped to the shell's outbound-content guard.
   Two gateway blocks — each followed by connector-wide page quarantine — hit
   immediately after an Explain-prefilled ask, while hand-typed short questions
   ran 8-9 deep with no issue. The context is therefore:

     - PROSE ONLY. No braces, brackets, pipes, no field:value lists, no
       markdown tables, no JSON fragments.
     - NO RECORD IDS. The account NAME is all a narrative answer needs; an
       18-char Salesforce id adds nothing for the model and is exactly the
       token shape an exfiltration filter looks for.
     - HARD-CAPPED — context at CONTEXT_BUDGET, whole prompt at MAX_PROMPT.

   `sanitize()` is a belt-and-braces final pass so a future edit cannot
   reintroduce a forbidden shape. If you want to add a list here, add it to the
   UI instead — the model does not need it.
   ============================================================================= */

import type { BorrowerBundle, C360Data, Covenant } from "./contract";
import {
  RESULT_LABEL,
  SCREENING_LABEL,
  STAGE_LABEL,
  TYPE_LABEL,
  daysInStage,
  documentCounts,
  worstScreening,
  type OnboardingCase,
} from "./onboarding";
import { fmtDate, fmtMoney } from "./format";
import { covenantCushion } from "./finance";
import { isActiveFacility } from "./worklist";

/** Hard cap on the context block alone. */
export const CONTEXT_BUDGET = 500;
/** Hard cap on the ENTIRE prompt — context, question and instruction. */
export const MAX_PROMPT = 600;

/* The model is a general Bedrock endpoint with no cockpit knowledge. Left to
   itself it speculates ("the graph likely shows...", "implied ~$15.75M") and
   invents units ("17 bps" for a 0.17x cushion). Both are unacceptable in front
   of a banker, so the instruction forbids inference outright and gives the
   model a SAFE ALTERNATIVE — naming the tab that holds the missing figure —
   which is more useful than a guess anyway. */
const INSTRUCTION =
  "Answer as a commercial-credit copilot, concise. Use only these figures; if one is not here, say it is not staged and name the tab that holds it. Never infer or estimate.";

/** Final guarantee: strip the shapes the outbound guard reacts to. */
export function sanitize(s: string): string {
  return s
    .replace(/[{}[\]|]/g, "") // structured-payload punctuation
    .replace(/\b[A-Za-z0-9]{15,}\b/g, "") // record ids (15/18-char Salesforce and friends)
    .replace(/\s*\n\s*/g, " ") // never a multi-line block
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

/** Ratio in banker prose: 1.42x — never 1.42× or a bare JSON number. */
function ratio(n: number | null | undefined): string | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return `${Number(n).toFixed(2)}x`;
}

/** Money or ratio, whichever the covenant's magnitude implies. */
function covValue(n: number | null | undefined): string | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.abs(n) >= 1000 ? fmtMoney(n) : ratio(n);
}

const SHORT_NAMES: Array<[RegExp, string]> = [
  [/debt service|dscr|dsc\b/i, "DSCR"],
  [/debt-to-worth|debt to worth|leverage/i, "leverage covenant"],
  [/liquidity/i, "liquidity"],
  [/fixed asset|capex/i, "capex limit"],
  [/net worth/i, "net worth"],
];

function shortCovenantName(type: string | undefined): string {
  const t = type ?? "covenant";
  for (const [re, short] of SHORT_NAMES) if (re.test(t)) return short;
  return t.length > 24 ? t.slice(0, 24) : t;
}

/** Clip without leaving a dangling half-sentence. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (stop > max * 0.4 ? cut.slice(0, stop + 1) : cut).trim();
}

/** Cushion PRE-COMPUTED in both forms so the model never does unit maths.
 *  The "17 bps" and "13.6 percent" errors in the live transcript were both the
 *  model converting a ratio it was handed raw. */
function cushionPhrase(c: Covenant): string | null {
  const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
  if (cu.cushion === null) return null;
  const abs = covValue(Math.abs(cu.cushion));
  if (!abs) return null;
  return cu.safe === false ? `breached by ${abs}` : `cushion ${abs} or about ${cu.pct} percent`;
}

/** One covenant as a full sentence clause, cushion included. */
function covenantClause(c: Covenant): string | null {
  const a = covValue(c.actualValue);
  const th = covValue(c.thresholdValue);
  if (!a || !th) return null;
  const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
  const parts = [`${shortCovenantName(c.covenantType)} ${a} against a ${th} ${cu.safe === false ? "threshold" : "floor"}`];
  const cush = cushionPhrase(c);
  if (cush) parts.push(cush);
  if (c.nextEvaluationDate) parts.push(`next test ${fmtDate(c.nextEvaluationDate)}`);
  return parts.join(", ");
}

/** Covenants sorted tightest-first (breached ahead of everything). */
function byTightest(covs: Covenant[]): Covenant[] {
  return covs
    .filter((c) => c.actualValue != null && c.thresholdValue != null)
    .slice()
    .sort((a, b) => {
      const ca = covenantCushion(a.covenantType, a.actualValue, a.thresholdValue);
      const cb = covenantCushion(b.covenantType, b.actualValue, b.thresholdValue);
      return (ca.safe === false ? -1 : ca.pct) - (cb.safe === false ? -1 : cb.pct);
    });
}

function shortProductType(name?: string, product?: string): string {
  const s = (product ?? name ?? "facility").toLowerCase();
  if (s.includes("revolv")) return "revolver";
  if (s.includes("term")) return "term loan";
  if (s.includes("capex")) return "capex facility";
  if (s.includes("line")) return "line of credit";
  return "facility";
}

/** Tab-specific figures — selected INSTEAD of the generic sentence, so the
 *  budget goes to what the banker is actually looking at. Everything here comes
 *  from staged data; an unstaged tab simply contributes nothing and the
 *  instruction tells the model to say so. */
function tabSentence(bundle: BorrowerBundle, tab: string | null): string | null {
  const exp = bundle.exposure ?? {};
  const covs = bundle.covenants?.covenants ?? [];
  const facs = (exp.facilities ?? []).filter(isActiveFacility);
  const boom = bundle.boom?.ratios;

  if (tab === "Exposure & Collateral") {
    if (!facs.length) return null;
    const list = facs
      .slice(0, 3)
      .map((f) => {
        const bits = [fmtMoney(f.committed), shortProductType(f.name, f.productType)].filter(Boolean).join(" ");
        return f.outstanding != null ? `${bits}, ${fmtMoney(f.outstanding)} drawn` : bits;
      })
      .join("; ");
    const more = facs.length > 3 ? ` and ${facs.length - 3} more` : "";
    // Coverage is the org's own figures, not a sum over the facility rows: a
    // cross-pledged asset repeats its lendable value on every pledge, so a sum
    // here would ground the model in a number nothing else on screen shows.
    const bits: string[] = [];
    if (exp.totalUniqueCollateralLendableValue != null) {
      bits.push(`lendable ${fmtMoney(exp.totalUniqueCollateralLendableValue)}`);
    }
    if (exp.coverageRatio != null) bits.push(`coverage ${exp.coverageRatio.toFixed(2)}x`);
    const under = facs.filter((f) => f.coverageShortfall === true).length;
    if (under) bits.push(`${under} ${under === 1 ? "facility" : "facilities"} under-covered`);
    const coverage = bits.length ? ` Collateral: ${bits.join(", ")}.` : "";
    return `${facs.length} active ${facs.length === 1 ? "facility" : "facilities"}: ${list}${more}.${coverage}`;
  }

  if (tab === "Covenants") {
    const clauses = byTightest(covs).slice(0, 2).map(covenantClause).filter(Boolean) as string[];
    if (!clauses.length) return null;
    // Capitalise each clause so joining with a full stop still reads as prose.
    return `${clauses.map((c) => c[0].toUpperCase() + c.slice(1)).join(". ")}.`;
  }

  if (tab === "Activity") {
    const req = (bundle.requests ?? [])[0];
    const ask = req?.ask ?? (bundle.activity ?? []).find((a) => a.kind === "REQUEST_RECEIVED")?.detail?.ask;
    if (!ask) return null;
    const what = (ask.type ?? "request").replace(/[_-]+/g, " ");
    const move = ask.from != null && ask.to != null ? ` from ${fmtMoney(ask.from)} to ${fmtMoney(ask.to)}` : "";
    return `Open client request: ${what}${move}.`;
  }

  if (tab === "Financials") {
    if (!boom) return null;
    const bits = [
      boom.ebitda != null ? `EBITDA ${fmtMoney(boom.ebitda)}` : null,
      boom.totalLeverage != null ? `leverage ${ratio(boom.totalLeverage)}` : null,
      boom.interestCoverage != null ? `interest coverage ${ratio(boom.interestCoverage)}` : null,
    ].filter(Boolean);
    return bits.length ? `${bits.join(", ")}.` : null;
  }

  if (tab === "Relationship Graph") {
    const conns = bundle.graph?.connections ?? [];
    const owners = conns.filter((c) => (c.totalOwnershipPercent ?? c.ownershipPercent ?? 0) > 0);
    const guarantors = (bundle.graph?.legalEntities ?? []).filter((e) =>
      (e.borrowerType ?? "").toLowerCase().includes("guarantor"),
    );
    if (!owners.length && !guarantors.length) return null;
    const o = owners
      .slice(0, 2)
      .map((c) => `${c.counterpartyName ?? "owner"} ${c.totalOwnershipPercent ?? c.ownershipPercent} percent`)
      .join(", ");
    const g = guarantors.length ? `${guarantors.length} guarantor${guarantors.length === 1 ? "" : "s"} on file` : "";
    return [o ? `Owners: ${o}.` : "", g ? `${g}.` : ""].filter(Boolean).join(" ");
  }

  if (tab === "Opportunities") {
    const opp = (bundle.opportunities?.opportunities ?? [])[0];
    if (!opp) return null;
    const bits = [opp.name, opp.amount != null ? fmtMoney(opp.amount) : null, opp.stage].filter(Boolean).join(", ");
    return `Open opportunity: ${bits}.`;
  }

  if (tab === "Structural Signals") {
    const sig = bundle.signals ?? {};
    const bits: string[] = [];
    const near = (sig.maturityWatch ?? []).find((m) => m.daysUntilMaturity != null);
    if (near) bits.push(`nearest maturity in ${near.daysUntilMaturity} days`);
    if (sig.modifications?.length) bits.push(`${sig.modifications.length} modifications`);
    if (sig.guarantorSignals?.length) bits.push(`${sig.guarantorSignals.length} guarantor signals`);
    return bits.length ? `Signals: ${bits.join(", ")}.` : null;
  }

  // No tab (or one with nothing staged): the generic read — tightest covenant
  // plus leverage, which is what a banker asks about first.
  const generic: string[] = [];
  const tightest = byTightest(covs)[0];
  if (tightest) {
    const clause = covenantClause(tightest);
    if (clause) generic.push(clause);
  }
  if (boom?.totalLeverage != null) {
    generic.push(`leverage ${ratio(boom.totalLeverage)}${boom.ebitda != null ? ` on ${fmtMoney(boom.ebitda)} EBITDA` : ""}`);
  }
  // With no covenants staged, the facility count is the next most useful
  // structural fact — and it must reflect ACTIVE facilities only.
  if (!tightest && facs.length) {
    generic.push(`${facs.length} active ${facs.length === 1 ? "facility" : "facilities"}`);
  }
  return generic.length ? `${generic.join("; ")}.` : null;
}

/** 2-4 flowing sentences about the account in view. No ids, no lists. */
function accountProse(bundle: BorrowerBundle | null, accountName: string, tab: string | null): string {
  const tabLine = tab ? `Viewing the ${tab} tab.` : "";
  if (!bundle) {
    return sanitize([`${accountName} has no staged detail in this view.`, tabLine].filter(Boolean).join(" "));
  }

  const parts: string[] = [];
  const snap = bundle.snapshot ?? { accountId: "" };
  const exp = bundle.exposure ?? {};
  const committed = exp.totalCommitted ?? snap.totalCreditExposure;
  const drawn = exp.totalOutstanding ?? snap.totalOutstanding;

  // Lead sentence is ALWAYS identity, grade and exposure.
  const lead = [
    accountName,
    snap.primaryRiskRating ? `Grade ${snap.primaryRiskRating}` : null,
    committed != null
      ? `${fmtMoney(committed)} committed${drawn != null ? ` with ${fmtMoney(drawn)} drawn` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (lead) parts.push(`${lead}.`);

  const tabInfo = tabSentence(bundle, tab);
  if (tabInfo) parts.push(tabInfo);
  if (tabLine) parts.push(tabLine);

  return sanitize(parts.join(" "));
}

/** Book-level prose for the home view. */
function bookProse(data: C360Data): string {
  const pf = data.portfolio ?? { accounts: [] };
  const bt = pf.bookTotals ?? {};
  const sig = pf.signals ?? {};

  const count = bt.accountCount ?? pf.accounts.length;
  const lead = [
    `Book of ${count} ${count === 1 ? "relationship" : "relationships"}`,
    bt.totalCommitted != null
      ? `${fmtMoney(bt.totalCommitted)} committed${bt.totalOutstanding != null ? ` with ${fmtMoney(bt.totalOutstanding)} drawn` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const flags: string[] = [];
  if (sig.breachedCount) flags.push(`${sig.breachedCount} breached ${sig.breachedCount === 1 ? "covenant" : "covenants"}`);
  if (sig.covenantsDueSoon?.length) flags.push(`${sig.covenantsDueSoon.length} tests due`);
  if (sig.maturitiesSoon?.length) flags.push(`${sig.maturitiesSoon.length} maturities near`);

  return sanitize([`${lead}.`, flags.length ? `${flags.join(", ")}.` : ""].filter(Boolean).join(" "));
}

/**
 * Onboarding prose.
 *
 * Same shape contract as the credit prose — no ids, no lists, no braces — and
 * the same refusal to overstate. Two things are always said: that the screening
 * figures are simulated, and that only a human attestation completes the case.
 * A model grounded in this can answer "where does Meridian stand" without ever
 * being in a position to claim the case is cleared.
 */
function onboardingProse(kase: OnboardingCase, generatedAt: string, tab: string | null): string {
  const parts: string[] = [];
  const days = daysInStage(kase, generatedAt);
  const docs = documentCounts(kase);
  const worst = worstScreening(kase);

  parts.push(
    `${kase.name} is an onboarding case, type ${TYPE_LABEL[kase.type]}, at stage ${STAGE_LABEL[kase.stage]}` +
      (days != null ? ` for ${days} days` : "") +
      ".",
  );

  if (kase.intake) parts.push("It arrived through the client intake service, so its stated details are claimed by the applicant and unverified.");

  const owners = (kase.parties ?? []).filter((p) => p.ownershipPercent != null);
  if (owners.length) {
    parts.push(
      "Ownership: " +
        owners.map((p) => `${p.name} ${p.ownershipPercent} percent as ${p.role}`).join(", ") +
        ".",
    );
  }

  parts.push(
    `Documents: ${docs.verified} of ${docs.total} verified. Screening worst result ${RESULT_LABEL[worst]}, all results simulated for this prototype.`,
  );

  const hit = (kase.screenings ?? []).find((x) => x.result === "Hit" || x.result === "PotentialMatch");
  if (hit) parts.push(`The ${SCREENING_LABEL[hit.screeningType]} screen on ${hit.partyName} returned ${RESULT_LABEL[hit.result]} and is unresolved.`);

  const blocking = kase.blockingItems ?? [];
  if (blocking.length) parts.push(`Blocking: ${blocking.map((b) => b.title).join(", ")}.`);

  parts.push(
    kase.clearance?.present
      ? "KYC clearance has been attested by a named human."
      : "No KYC clearance record exists, so the case cannot complete. Only a human attestation moves it.",
  );

  if (tab) parts.push(`Viewing the ${tab} tab.`);
  return sanitize(parts.join(" "));
}

/**
 * Assemble the prompt. Shape contract, enforced here and by the tests:
 * prose only, no ids, context ≤ CONTEXT_BUDGET, whole prompt ≤ MAX_PROMPT.
 */
export function buildGroundedPrompt(args: {
  data: C360Data;
  bundle: BorrowerBundle | null;
  accountName: string | null;
  tab: string | null;
  question: string;
  /** Set when the view is an onboarding case, which has no bundle by design. */
  kase?: OnboardingCase | null;
}): string {
  const { data, bundle, accountName, tab, question, kase } = args;

  // The question is sanitized too: a pasted JSON fragment would otherwise trip
  // the same guard and quarantine the page for every later call.
  const q = clip(sanitize(question), 200);

  const raw = kase
    ? onboardingProse(kase, data.meta?.generatedAt ?? "", tab)
    : accountName
      ? accountProse(bundle, accountName, tab)
      : bookProse(data);
  const room = Math.max(0, Math.min(CONTEXT_BUDGET, MAX_PROMPT - q.length - INSTRUCTION.length - 2));
  const context = clip(raw, room);

  return [context, q, INSTRUCTION].filter(Boolean).join(" ");
}
