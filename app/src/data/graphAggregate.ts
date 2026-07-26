/* =============================================================================
   THE ORG STORES BOTH DIRECTIONS, AND ONE ROW PER CHILD.

   STANDING RULE, founder-set 2026-07-26: a real org read WILL carry
   bidirectional and per-child duplication. Every list surface aggregates by
   IDENTITY; none of them renders raw row multiplicity.

   Two shapes of duplication, both real and both observed on Hartwell:

     - CONNECTIONS are MIRRORED. The org stores each relationship twice, once
       from each side, and the read returns both: 8 rows for 4 relationships.
       The pair is not two facts, it is one fact written down twice, and the two
       halves are NOT equally informative — "Parent, 100 percent" and "Child,
       null" are the same holding-company edge seen from opposite ends.

     - INVOLVEMENTS repeat PER FACILITY. The same Borrower row appears once for
       every loan in the package: 6 identical rows at 100 percent for one
       borrower with six facilities.

   Collapsing is a presentation decision, not a data correction. The tool
   returns true org rows; the tab is what owes the banker one line per real
   thing.
   ============================================================================= */

import type { Connection, LegalEntity } from "./contract";

/** Roles the mirror side generates, which carry no information of their own.
 *  "Child" is the reflection of "Parent"; "Company" the reflection of an owner. */
const MIRROR_ROLES = new Set(["child", "company", "affiliate"]);

const isMirrorRole = (role: string | undefined) => MIRROR_ROLES.has((role ?? "").trim().toLowerCase());

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The ownership this row actually knows: direct, then indirect, then the
 *  rollup, and only when the rollup says something (0 is the mirror's default). */
export function connectionOwnership(c: Connection): number | null {
  const direct = num(c.ownershipPercent);
  if (direct !== null) return direct;
  const indirect = num(c.indirectOwnershipPercent);
  if (indirect !== null) return indirect;
  const total = num(c.totalOwnershipPercent);
  return total !== null && total > 0 ? total : null;
}

/**
 * How much this side of a mirrored pair actually tells us. Higher wins.
 *
 * A named role dominates every numeric signal: "Owner" with no percent is more
 * use to a banker than "Company" with one, because the second is the mirror's
 * own artefact.
 */
function informationScore(c: Connection): number {
  let score = 0;
  if (!isMirrorRole(c.role)) score += 8;
  if (num(c.ownershipPercent) !== null) score += 4;
  if (num(c.indirectOwnershipPercent) !== null) score += 2;
  if ((num(c.totalOwnershipPercent) ?? 0) > 0) score += 1;
  return score;
}

export interface CollapsedConnection {
  counterpartyId?: string;
  counterpartyName?: string;
  /** The meaningful role, taken from the more informative direction. */
  role?: string;
  ownershipPercent: number | null;
  isActive?: boolean;
  /** How many org rows collapsed into this one. 2 means a mirrored pair. */
  mirroredRows: number;
}

/**
 * One row per counterparty, merged from however many directions the org stored.
 *
 * Deterministic throughout: rows group by counterparty id (falling back to the
 * name when the id is absent), the winner is the highest information score, and
 * ties break on the original order so the same payload always renders the same
 * way.
 */
export function collapseConnections(connections: Connection[] | undefined): CollapsedConnection[] {
  const groups = new Map<string, { rows: Connection[]; firstSeen: number }>();

  (connections ?? []).forEach((c, i) => {
    const key = c.counterpartyId ?? c.counterpartyName ?? `row-${i}`;
    const g = groups.get(key);
    if (g) g.rows.push(c);
    else groups.set(key, { rows: [c], firstSeen: i });
  });

  return [...groups.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map(({ rows }) => {
      let best = rows[0];
      let bestScore = informationScore(best);
      for (const row of rows.slice(1)) {
        const score = informationScore(row);
        // Strictly greater: an equal score keeps the earlier row, which is what
        // makes the tie-break deterministic.
        if (score > bestScore) {
          best = row;
          bestScore = score;
        }
      }
      // Ownership is taken from whichever side knows it, not only the winner:
      // the mirror can carry the percent while the named side does not.
      const ownership = rows.reduce<number | null>((acc, r) => acc ?? connectionOwnership(r), null);
      return {
        counterpartyId: best.counterpartyId,
        counterpartyName: best.counterpartyName,
        role: best.role,
        ownershipPercent: ownership,
        isActive: rows.some((r) => r.isActive !== false),
        mirroredRows: rows.length,
      };
    });
}

export interface AggregatedInvolvement {
  accountName?: string;
  borrowerType?: string;
  relationshipType?: string;
  ownershipPercent: number | null;
  guarantyAmountType?: string;
  contingentAmount?: number | null;
  /** How many facilities carry this same involvement. */
  facilityCount: number;
  /** The loans it was recorded against, for the expanded view. */
  loanIds: string[];
}

/**
 * One row per (entity, role), with the facility count.
 *
 * The org records the involvement once per loan, so a borrower on six
 * facilities produces six identical rows. Six identical lines tell a banker
 * nothing they did not know from the first; "6 facilities" tells them the shape
 * of the package.
 */
export function aggregateInvolvements(entities: LegalEntity[] | undefined): AggregatedInvolvement[] {
  const groups = new Map<string, AggregatedInvolvement & { firstSeen: number }>();

  (entities ?? []).forEach((e, i) => {
    const key = `${e.accountName ?? ""}|${e.borrowerType ?? ""}|${e.relationshipType ?? ""}`;
    const existing = groups.get(key);
    const loanId = typeof e.loanId === "string" ? e.loanId : undefined;

    if (existing) {
      existing.facilityCount += 1;
      if (loanId && !existing.loanIds.includes(loanId)) existing.loanIds.push(loanId);
      // A percent recorded on any row of the group is the group's percent.
      existing.ownershipPercent = existing.ownershipPercent ?? num(e.ownershipPercent);
      return;
    }

    groups.set(key, {
      accountName: e.accountName,
      borrowerType: e.borrowerType,
      relationshipType: e.relationshipType,
      ownershipPercent: num(e.ownershipPercent),
      guarantyAmountType: e.guarantyAmountType ?? undefined,
      contingentAmount: num(e.contingentAmount),
      facilityCount: 1,
      loanIds: loanId ? [loanId] : [],
      firstSeen: i,
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map(({ firstSeen: _firstSeen, ...row }) => row);
}
