import type { BrainReadBlocks, BrainTurn } from "../../channel/brainLane";
import type { Facility, LegalEntity } from "../../data/contract";
import { facilityProduct } from "../../data/facilityStage";
import { fmtCovThreshold, fmtCovVal } from "../../data/finance";
import { fmtDate, fmtMoney } from "../../data/format";
import { isActiveFacility } from "../../data/worklist";
import { classifyCovenant } from "../../domain/covenantStatus";
import type { ReadSource } from "./readCard";

/* =============================================================================
   THE READ, PACKED FOR THE DESK (F2).

   The brain answered "the data is not carried" three times in the 2026-09-01
   drive over a bundle that held every one of those facts. Nothing was wrong
   with the brain: the envelope carried a line, some labels and the staged plan,
   and nothing else. This packs what the room ALREADY READ into the envelope.

   IT FORMATS; IT NEVER DERIVES. Every figure here is printed by the same
   helpers the glass prints with (`fmtMoney`, `fmtDate`, `classifyCovenant`), so
   an answer and the card beside it can never disagree about a number. No
   derivation, no roll-up, no ratio that the read does not already carry.

   AND IT SAYS WHAT IT DOES NOT HOLD. `notCarried` is the other half of the
   contract: a topic no read on this cockpit carries must be refusable BY NAME,
   because an absent block reported as an empty fact is the failure the whole
   grounding pass exists to end.
   ============================================================================= */

/** The relationship-wide scope word, used wherever a row hangs off no facility. */
const RELATIONSHIP = "across the relationship";

/** What NO read on this cockpit carries, stated the same way every time.
 *
 *  FEES: no read tool puts fee rows on the bundle (readCard.ts says the same at
 *  the card). PRICING: the org populates a rate, and a spread on floating
 *  facilities, but the INDEX NAME is not stored anywhere and must never be
 *  inferred from a rate (handoff 2026-09-01, decision ledger). */
const NOT_CARRIED = [
  "the fees already charged on these facilities",
  "the rate index name - this org does not store one, so no index may be named",
  "the spread, which no read on this cockpit carries",
];

/** The facilities in the conversation: active, scoped to the anchored package.
 *  The SAME scoping `readCard.ts` uses, so the blocks and the cards agree. */
function scoped(src: ReadSource): Facility[] {
  return (src.bundle?.exposure?.facilities ?? [])
    .filter(isActiveFacility)
    .filter((f) => !src.productPackageId || f.productPackageId === src.productPackageId);
}

const nameOf = (f: Facility, relationship: string) => facilityProduct(f, relationship) || "Facility";

/**
 * A PERSON OR A COMPANY, only where the ORG'S OWN WORD says so.
 *
 * No read carries an entity-kind flag, so this reads the role words the org
 * wrote and nothing else. ABSENT IS NOT "corporate": guessing a natural person
 * from a name is exactly the kind of invention the pack forbids.
 */
function kindOf(e: LegalEntity): "corporate" | "person" | undefined {
  const words = `${e.borrowerType ?? ""} ${e.relationshipType ?? ""}`.toLowerCase();
  if (/\b(individual|person|personal|natural)\b/.test(words)) return "person";
  if (/\b(corporate|corporation|entity|company|llc|business)\b/.test(words)) return "corporate";
  return undefined;
}

function covenantBlock(src: ReadSource): BrainReadBlocks["covenants"] {
  const covenants = src.bundle?.covenants?.covenants ?? [];
  if (!covenants.length) return undefined;
  const facilities = scoped(src);
  const byLoan = new Map(facilities.map((f) => [f.loanId ?? "", nameOf(f, src.accountName)]));
  return covenants.map((c) => {
    const attached = (c.attachedLoans ?? [])
      .map((a) => (a.loanId ? byLoan.get(a.loanId) : undefined))
      .filter((n): n is string => Boolean(n));
    const verdict = classifyCovenant(c);
    return {
      name: (c.covenantType ?? "").trim() || "Covenant",
      // IN THE COVENANT'S OWN UNIT, through the room's own formatters. A raw
      // 5000000 on the envelope reads as "5000000" in the line item's rail,
      // which is worse than no rail at all.
      threshold:
        typeof c.thresholdValue === "number"
          ? fmtCovThreshold(c.covenantType, c.actualValue, c.thresholdValue)
          : "not carried",
      measured: typeof c.actualValue === "number" ? fmtCovVal(c.actualValue, c.covenantType) : undefined,
      lastEvaluated: c.lastEvaluationDate ? fmtDate(c.lastEvaluationDate) : undefined,
      nextTest: c.nextEvaluationDate ? fmtDate(c.nextEvaluationDate) : undefined,
      frequency: c.frequency,
      status: verdict.label,
      severity: verdict.severity,
      scope: attached.length ? attached.join(", ") : RELATIONSHIP,
    };
  });
}

function involvementBlock(src: ReadSource): BrainReadBlocks["involvements"] {
  const entities = src.bundle?.graph?.legalEntities ?? [];
  if (!entities.length) return undefined;
  const byLoan = new Map(scoped(src).map((f) => [f.loanId ?? "", nameOf(f, src.accountName)]));
  return entities.map((e) => ({
    name: e.accountName ?? "Unnamed party",
    role: (e.relationshipType ?? "").trim() || (e.borrowerType ?? "").trim() || "Involved",
    kind: kindOf(e),
    scope: (e.loanId ? byLoan.get(e.loanId) : undefined) ?? RELATIONSHIP,
    detail:
      typeof e.ownershipPercent === "number"
        ? `${e.ownershipPercent}% ownership`
        : typeof e.contingentAmount === "number"
          ? `${fmtMoney(e.contingentAmount)} contingent`
          : undefined,
  }));
}

function collateralBlock(src: ReadSource): BrainReadBlocks["collateral"] {
  const rows: NonNullable<BrainReadBlocks["collateral"]> = [];
  for (const f of scoped(src)) {
    const scope = nameOf(f, src.accountName);
    for (const c of f.collateral ?? []) {
      rows.push({
        asset: c.collateralDescription ?? c.collateralName ?? c.collateralType ?? "Collateral",
        type: c.collateralType,
        advanceRate: typeof c.advanceRate === "number" ? `${c.advanceRate}%` : undefined,
        pledged: typeof c.amountPledged === "number" ? fmtMoney(c.amountPledged) : undefined,
        lendable: typeof c.currentLendableValue === "number" ? fmtMoney(c.currentLendableValue) : undefined,
        scope,
      });
    }
  }
  return rows.length ? rows : undefined;
}

function exposureBlock(src: ReadSource): BrainReadBlocks["exposure"] {
  const facilities = scoped(src);
  if (!facilities.length) return undefined;
  const sum = (pick: (f: Facility) => number | null | undefined) =>
    facilities.reduce((n, f) => n + (typeof pick(f) === "number" ? (pick(f) as number) : 0), 0);
  return {
    committed: fmtMoney(sum((f) => f.committed)),
    drawn: fmtMoney(sum((f) => f.outstanding)),
    available: fmtMoney(sum((f) => f.available)),
    facilities: facilities.length,
  };
}

function pricingBlock(src: ReadSource): BrainReadBlocks["pricing"] {
  const rows = scoped(src)
    .filter((f) => typeof f.interestRate === "number")
    .map((f) => ({ facility: nameOf(f, src.accountName), rate: `${f.interestRate}%` }));
  return rows.length ? rows : undefined;
}

/** What the cockpit holds of the CORRESPONDENCE, said only where the envelope
 *  actually carries a message. A room with no connector must not talk about a
 *  mailbox it never looked at; a room WITH one must be able to refuse a THREAD
 *  by name rather than passing off its single search hit as the whole
 *  exchange. */
const MAIL_NOT_CARRIED =
  "correspondence beyond the one message in CONTEXT.mail - this cockpit reads one search hit, never a thread, and no attachment";

/** WHAT THE ROOM HAS ALREADY READ, packed. Absent where it stands on no read. */
export function buildReadBlocks(src: ReadSource | undefined, hasMail = false): BrainReadBlocks | undefined {
  if (!src?.bundle) return undefined;
  return {
    covenants: covenantBlock(src),
    involvements: involvementBlock(src),
    collateral: collateralBlock(src),
    exposure: exposureBlock(src),
    pricing: pricingBlock(src),
    notCarried: hasMail ? [...NOT_CARRIED, MAIL_NOT_CARRIED] : NOT_CARRIED,
  };
}

/* ------------------------------------------------------------ the thread

   WHAT MAKES IT CHAT. A room that hands over one line at a time answers each
   line as if it were the first, which is exactly the "step by step, not
   intuitive" the founder named. The banker's own words travel VERBATIM; the
   room's are clipped, because a room quoting itself at length crowds out the
   reads the answer actually needs.                                          */

/** How many exchanges travel. Six is two or three full turns, which is as far
 *  back as a banker's "it" and "that one" ever reach. */
const THREAD_TURNS = 6;

/** The longest an agent line travels. A clipped line ends on a word. */
const AGENT_CLIP = 180;

function clip(text: string, cap: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= cap) return line;
  const cut = line.slice(0, cap);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > cap / 2 ? cut.slice(0, lastSpace) : cut).trim()}...`;
}

/** The last few exchanges, oldest first. Empty where nothing has been said. */
export function threadDigest(turns: BrainTurn[], limit: number = THREAD_TURNS): BrainTurn[] | undefined {
  const kept = turns
    .filter((t) => t.text.trim().length > 0)
    .slice(-limit)
    .map((t) => ({ who: t.who, text: t.who === "banker" ? t.text.trim() : clip(t.text, AGENT_CLIP) }));
  return kept.length ? kept : undefined;
}
