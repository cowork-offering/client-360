import type { WorkroomDelta } from "../../workroom/types";
import { pricingDerivedReason } from "./pricingGate";

/* =============================================================================
   REQUESTED VS DERIVED (Cowork feedback, 2026-09-03).

   A whisper carrying two lines ("increase the 15M line of credit to 20M" and
   one more) landed FOUR cards on the manifest, and the rail said "4 changes"
   with no further word. The extra two are BY DESIGN: the pricing gate
   (pricingGate.ts) adds the amortised term and the first payment date once an
   amount or a term moves, because Salesforce will not price a loan without
   them. Nothing was invented; the count that did not say so was the defect.

   THE SPLIT IS A DERIVED VALUE ITSELF, not a flag threaded through
   construction. `WorkroomDelta` and the engine that lands a pricing answer
   (`Workroom.tsx`'s `landPricing`, off the byte-fenced `workroom/engine.ts`)
   predate this distinction, so nothing marks a delta at the moment it is
   built. `pricingDerivedReason` reads the one structural fact that already
   tells the two apart, which field the entry wires, and this module is
   where every count line and every card badge goes to ask the same question
   the same way.

   `derived` / `derivedReason` ride here as an escape hatch for anywhere else
   in this editable tree that composes a delta the banker did not name: none
   does today (`newFacilityArm.ts`'s involvement entry always carries a party
   and a role the banker gave it), so the pricing check is the only rule that
   fires. The day another arm needs it, `{ ...delta, derived: true,
   derivedReason: "..." }` is still a `WorkroomDelta` everywhere the
   byte-fenced code reads one (TypeScript widens on assignment, it does not
   narrow), so no fenced file has to change to add a second rule here.
   ============================================================================= */

export type DerivedWorkroomDelta = WorkroomDelta & { derived?: boolean; derivedReason?: string };

/** Why the room put this on the plan without being asked, or null on an
 *  ordinary, banker-named entry. */
export function derivedReasonOf(delta: WorkroomDelta): string | null {
  const marked = delta as DerivedWorkroomDelta;
  if (marked.derivedReason) return marked.derivedReason;
  if (marked.derived) return pricingDerivedReason(delta) ?? "The room added this so the plan can be priced.";
  return pricingDerivedReason(delta);
}

export function isDerivedDelta(delta: WorkroomDelta): boolean {
  return derivedReasonOf(delta) !== null;
}

export interface DerivedSplit {
  total: number;
  requested: number;
  derived: number;
}

/** The manifest, split the way the rail now has to say it: what the banker
 *  typed, and what the room added on its own. */
export function countSplit(entries: readonly WorkroomDelta[]): DerivedSplit {
  const derived = entries.reduce((n, e) => n + (isDerivedDelta(e) ? 1 : 0), 0);
  return { total: entries.length, requested: entries.length - derived, derived };
}

/** "2 requested · 2 derived", or null where nothing on the rail is derived:
 *  an ordinary plan carries no clause and reads exactly as it always has. */
export function splitClause(entries: readonly WorkroomDelta[]): string | null {
  const { requested, derived } = countSplit(entries);
  return derived > 0 ? `${requested} requested · ${derived} derived` : null;
}

/**
 * WIDEN AN EXISTING " · "-JOINED COUNT LINE with the split, right after the
 * leading "N changes" clause and before whatever the line already said next
 * (member counts, new-member counts). The count itself is computed elsewhere,
 * `figuresFor` in the byte-fenced `workroom/manifest.ts`, and never
 * re-derived here: only the presentation widens, so a line this does not
 * recognise (no " · ", or the empty-rail sentence) comes back unchanged.
 */
export function withDerivedSplit(countLine: string, entries: readonly WorkroomDelta[]): string {
  const clause = splitClause(entries);
  if (!clause || countLine === "Nothing staged") return countLine;
  const parts = countLine.split(" · ");
  parts.splice(1, 0, clause);
  return parts.join(" · ");
}

/** The same widening for a plain "N noun" fragment built inline rather than
 *  routed through `figuresFor`: the review chip and the plan-read card. */
export function countPhrase(count: number, noun: string, entries: readonly WorkroomDelta[]): string {
  const clause = splitClause(entries);
  return clause ? `${count} ${noun} · ${clause}` : `${count} ${noun}`;
}
