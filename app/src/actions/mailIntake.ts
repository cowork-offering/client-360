/* =============================================================================
   WHAT THE CLIENT ACTUALLY ASKED FOR (founder: "when is the action coming out
   of there?").

   A matched client email should propose the action it describes. This module
   reads the subject and the body preview and extracts ONLY what the text says:
   an intent, an amount, and which of THIS relationship's real facilities the
   client meant.

   NO LLM AND NO INVENTION. Every field here is either lifted from the message
   or matched against a facility that exists in the staged bundle. When the text
   does not say, the field is absent and the suggestion degrades to "this may
   contain a request" with nothing prefilled. A number guessed into a money field
   is the one outcome worth more than any convenience this feature buys.
   ============================================================================= */

import type { BorrowerBundle, ClientRequest, Facility } from "../data/contract";
import { bookedFacilities } from "../data/facilityStage";
import { fmtMoney } from "../data/format";

export type RequestIntent = "increase" | "decrease" | "extend" | "renew" | "payoff" | "new_facility";

/** Verbs a banker would recognise, and the intent each one names. */
const INTENT_PATTERNS: Array<[RegExp, RequestIntent]> = [
  [/\b(increase|raise|uplift|upsize|expand|more room|higher limit)\b/i, "increase"],
  [/\b(decrease|reduce|lower|downsize|reduction)\b/i, "decrease"],
  [/\b(extend|extension|push out|prolong|longer tenor)\b/i, "extend"],
  [/\b(renew|renewal|roll over|rollover)\b/i, "renew"],
  [/\b(pay ?off|payoff|repay in full|settle|redeem)\b/i, "payoff"],
  [/\b(new facility|additional facility|new line|new loan|apply for)\b/i, "new_facility"],
];

/** Words that name a facility KIND, mapped to what the org calls its products. */
const FACILITY_WORDS: Array<[RegExp, string[]]> = [
  [/\b(line of credit|loc|revolver|revolving|working capital)\b/i, ["line of credit", "revolver", "working capital"]],
  [/\b(construction)\b/i, ["construction"]],
  [/\b(equipment|machinery)\b/i, ["equipment"]],
  [/\b(term loan|term)\b/i, ["term"]],
  [/\b(mortgage|real estate|property)\b/i, ["real estate", "mortgage", "purchase"]],
];

/**
 * Money, including the informal ways people actually write it.
 *
 * "15Mio", "20 Mio", "$15MM", "15M", "$15,000,000", "15 million". The unit is
 * what makes a number an amount: a bare "15" is not a facility size and is
 * deliberately not matched.
 */
const MONEY = /(?:[$€£]\s*)?(\d[\d,]*(?:\.\d+)?)\s*(mio|mm|m\b|million|k\b|thousand|bn|billion)/gi;

const MULTIPLIER: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mm: 1e6, mio: 1e6, million: 1e6,
  bn: 1e9, billion: 1e9,
};

export interface ExtractedAmount {
  value: number;
  /** Exactly as the client wrote it, for the citation. */
  literal: string;
}

/** Every money amount the text states, in order of appearance. */
export function extractAmounts(text: string): ExtractedAmount[] {
  const out: ExtractedAmount[] = [];
  for (const m of text.matchAll(MONEY)) {
    const digits = Number(m[1].replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase().replace(/\b$/, "");
    const mult = MULTIPLIER[unit] ?? MULTIPLIER[unit.replace(/\W/g, "")];
    if (!Number.isFinite(digits) || !mult) continue;
    out.push({ value: digits * mult, literal: m[0].trim() });
  }
  return out;
}

export function extractIntent(text: string): RequestIntent | null {
  for (const [pattern, intent] of INTENT_PATTERNS) if (pattern.test(text)) return intent;
  return null;
}

/**
 * Which of THIS relationship's facilities the client meant.
 *
 * Two signals, both anchored in real data: the product word the client used,
 * and how close a stated amount is to a facility's actual commitment. A word
 * with no matching facility yields nothing — the cockpit does not invent a
 * facility because the client named a product the relationship does not have.
 */
export function matchFacility(text: string, bundle: BorrowerBundle | null, amounts: ExtractedAmount[]): Facility | null {
  const candidates = bookedFacilities(bundle);
  if (!candidates.length) return null;

  const words = FACILITY_WORDS.filter(([pattern]) => pattern.test(text)).flatMap(([, terms]) => terms);
  const named = candidates.filter((f) => {
    const hay = `${f.name ?? ""} ${f.productType ?? ""}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });

  if (named.length === 1) return named[0];

  // The client's CURRENT figure, when they state one, disambiguates: "from
  // $15M to $20M" names the facility carrying 15.
  const pool = named.length ? named : candidates;
  for (const amount of amounts) {
    const near = pool.filter((f) => f.committed != null && Math.abs(f.committed - amount.value) / amount.value <= 0.02);
    if (near.length === 1) return near[0];
  }

  // Ambiguous by construction. Naming one of several would be a guess.
  return null;
}

export interface MailRequest {
  intent: RequestIntent | null;
  facility: Facility | null;
  /** What the client is asking the commitment to become. */
  targetAmount: number | null;
  /** The facility's figure today, when the client stated it. */
  currentAmount: number | null;
  /** Exactly as written, for the citation. */
  literals: string[];
  /** True when there is enough to prefill a ticket. */
  actionable: boolean;
}

/**
 * Read one matched email as a request.
 *
 * `actionable` is the honest gate: it needs an intent, a facility that exists,
 * and a target amount. Anything less renders as "may contain a request" and
 * prefills nothing.
 */
export function readMailRequest(
  hit: { subject?: string; preview?: string },
  bundle: BorrowerBundle | null,
): MailRequest | null {
  const text = `${hit.subject ?? ""} ${hit.preview ?? ""}`.trim();
  if (!text) return null;

  const intent = extractIntent(text);
  const amounts = extractAmounts(text);
  const facility = matchFacility(text, bundle, amounts);

  // Nothing at all to say: not a request, and no card.
  if (!intent && !amounts.length) return null;

  // "from X to Y" — the larger of two is the target for an increase, the
  // smaller for a decrease. One amount is the target.
  let currentAmount: number | null = null;
  let targetAmount: number | null = null;
  if (amounts.length === 1) {
    targetAmount = amounts[0].value;
  } else if (amounts.length >= 2) {
    const [a, b] = amounts;
    currentAmount = a.value;
    targetAmount = b.value;
  }

  return {
    intent,
    facility,
    targetAmount,
    currentAmount,
    literals: amounts.map((a) => a.literal),
    actionable: Boolean(intent && facility && targetAmount !== null),
  };
}

/** The banker-facing line on the suggestion card. */
export function describeRequest(req: MailRequest): string {
  if (!req.actionable) return "Client message may contain a request";
  const verb =
    req.intent === "increase" ? "increase" :
    req.intent === "decrease" ? "reduce" :
    req.intent === "extend" ? "extend" :
    req.intent === "renew" ? "renew" :
    req.intent === "payoff" ? "pay off" : "open";
  const name = req.facility?.name ?? req.facility?.productType ?? "facility";
  const from = req.currentAmount ?? req.facility?.committed ?? null;
  const money = from !== null ? `${fmtMoney(from)} → ${fmtMoney(req.targetAmount)}` : fmtMoney(req.targetAmount);
  return `Client request: ${verb} ${name} ${money}`;
}


/* ------------------------------------------------- into the existing rails */

/**
 * A read request, as the ClientRequest the panel already understands.
 *
 * This is the whole integration. The modification ticket ALREADY prefills its
 * commitment from `bundle.requests[0].ask.to` with CLIENT_REQUEST provenance and
 * the message as its citation — that path was built for Sterling's staged
 * request. A mail-derived request enters by the same door, so the prefill, the
 * provenance chip and the citation all work without a second mechanism.
 *
 * Only an ACTIONABLE request converts. An ambiguous one is a card that opens an
 * empty ticket, never a number quietly placed in a money field.
 */
export function toClientRequest(
  hit: { id?: string; subject?: string; preview?: string; from?: string; webLink?: string; receivedAt?: string },
  req: MailRequest,
): ClientRequest | null {
  if (!req.actionable || req.targetAmount === null) return null;
  return {
    id: `mail-req-${hit.id ?? hit.subject ?? "unknown"}`,
    receivedAt: hit.receivedAt,
    status: "Open",
    channel: "email",
    summary: hit.subject ?? hit.preview,
    ask: {
      type: req.intent === "increase" ? "facility_increase" : (req.intent ?? undefined),
      from: req.currentAmount ?? req.facility?.committed ?? undefined,
      to: req.targetAmount,
      facilityName: req.facility?.name,
    },
    reference: { kind: "m365-message", id: hit.id, webLink: hit.webLink, source: hit.from },
  };
}

/* NO MAIL PATH MAPS TO A REGISTRY ACTION ANY MORE (founder, 2026-09-03).
   `suggestedActionFor` lived here and answered "loan-modification" for almost
   every message, which is how an inbound email opened the PRE-WORKROOM action
   panel. An inbound message now opens the facility workroom on itself; the
   registry action stays exactly where it is, for the surfaces that offer it as
   an action rather than as a reading of someone's mail. */
