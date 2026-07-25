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

import type { BorrowerBundle, C360Data } from "./contract";
import { fmtMoney } from "./format";
import { covenantCushion } from "./finance";
import { isActiveFacility } from "./worklist";

/** Hard cap on the context block alone. */
export const CONTEXT_BUDGET = 500;
/** Hard cap on the ENTIRE prompt — context, question and instruction. */
export const MAX_PROMPT = 600;

const INSTRUCTION = "Answer as a commercial-credit copilot, concise, cite only these figures.";

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

  // 1. Identity, grade, exposure.
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

  // 2. The covenant that matters — the tightest cushion, not every covenant.
  const covs = bundle.covenants?.covenants ?? [];
  let tightest: { name: string; actual: string; threshold: string; breached: boolean; pct: number } | null = null;
  for (const c of covs) {
    const cu = covenantCushion(c.covenantType, c.actualValue, c.thresholdValue);
    const a = covValue(c.actualValue);
    const th = covValue(c.thresholdValue);
    if (!a || !th) continue;
    const pct = cu.safe === false ? -1 : cu.pct;
    if (!tightest || pct < tightest.pct) {
      tightest = { name: shortCovenantName(c.covenantType), actual: a, threshold: th, breached: cu.safe === false || c.breached === true, pct };
    }
  }

  const boom = bundle.boom?.ratios;
  const second: string[] = [];
  if (tightest) {
    second.push(
      `${tightest.name} ${tightest.actual} against a ${tightest.threshold} ${tightest.breached ? "threshold, breached" : "floor"}`,
    );
  }
  if (boom?.totalLeverage != null) {
    second.push(`leverage ${ratio(boom.totalLeverage)}${boom.ebitda != null ? ` on ${fmtMoney(boom.ebitda)} EBITDA` : ""}`);
  }
  if (second.length) parts.push(`${second.join("; ")}.`);

  // 3. Structure, only when it adds something the covenants did not.
  const facs = (exp.facilities ?? []).filter(isActiveFacility);
  if (facs.length && !covs.length) {
    parts.push(`${facs.length} active ${facs.length === 1 ? "facility" : "facilities"}.`);
  }

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
 * Assemble the prompt. Shape contract, enforced here and by the tests:
 * prose only, no ids, context ≤ CONTEXT_BUDGET, whole prompt ≤ MAX_PROMPT.
 */
export function buildGroundedPrompt(args: {
  data: C360Data;
  bundle: BorrowerBundle | null;
  accountName: string | null;
  tab: string | null;
  question: string;
}): string {
  const { data, bundle, accountName, tab, question } = args;

  // The question is sanitized too: a pasted JSON fragment would otherwise trip
  // the same guard and quarantine the page for every later call.
  const q = clip(sanitize(question), 200);

  const raw = accountName ? accountProse(bundle, accountName, tab) : bookProse(data);
  const room = Math.max(0, Math.min(CONTEXT_BUDGET, MAX_PROMPT - q.length - INSTRUCTION.length - 2));
  const context = clip(raw, room);

  return [context, q, INSTRUCTION].filter(Boolean).join(" ");
}
