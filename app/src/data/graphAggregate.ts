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

/**
 * Roles the MIRROR side generates: the same edge, described from the far end.
 *
 * "Child" is what the holding company's row calls the operating company;
 * "Company" is what a person's ownership row calls the business. Neither
 * describes the COUNTERPARTY relative to the account being viewed, which is the
 * only thing a banker reading this relationship wants.
 */
const GENERIC_MIRROR_ROLES = new Set(["child", "company", "affiliate", "related", ""]);

/** Does this row's role describe the counterparty in its own terms? */
export function isSpecificRole(role: string | undefined): boolean {
  return !GENERIC_MIRROR_ROLES.has((role ?? "").trim().toLowerCase());
}

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
 * One row per counterparty, NORMALISED TO THE VIEWED ACCOUNT'S PERSPECTIVE.
 *
 * The rule, and it is a rule rather than a score:
 *   - group by counterparty id, falling back to the name when no id is staged;
 *   - keep the role that describes the COUNTERPARTY relative to this account,
 *     which means a specific role beats a generic mirror;
 *   - carry the LARGEST ownership percent either half of the pair knows, since
 *     the mirror routinely carries 0 where the named side carries the figure;
 *   - break every remaining tie on original order, so one payload always
 *     renders one way.
 *
 * Derived from the rule, not from one relationship's four counterparties: a
 * pair of generics, a lone mirror row, a missing percent and a person-account
 * counterparty all still resolve to one coherent line.
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
      // The first row whose role describes the counterparty; else the first row,
      // so a pair of generics still yields exactly one line.
      const best = rows.find((r) => isSpecificRole(r.role)) ?? rows[0];

      // The percent can sit on either half, and the halves disagree: the mirror
      // routinely carries 0 where the named side carries the real figure. Take
      // the largest thing either side actually knows.
      const ownership = rows.reduce<number | null>((acc, r) => {
        const own = connectionOwnership(r);
        if (own === null) return acc;
        return acc === null ? own : Math.max(acc, own);
      }, null);
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


/* --------------------------------------------------- structural signals */

export interface AggregatedGuarantorSignal {
  guarantorAccountId?: string;
  guarantorName?: string;
  riskStatus?: string;
  highestRiskGrade?: string;
  /** How many org rows carried this same signal, one per facility guaranteed. */
  facilityCount: number;
}

/**
 * One row per guarantor, not one per facility they guarantee.
 *
 * Same standing rule as the graph: the org records the involvement against
 * every loan, so a guarantor on six facilities produced six identical alert
 * rows. Six copies of one alert is not six alerts, and rendering them that way
 * buries the other signals underneath.
 */
export function aggregateGuarantorSignals(
  signals: Array<Record<string, unknown>> | undefined,
): AggregatedGuarantorSignal[] {
  const groups = new Map<string, AggregatedGuarantorSignal & { firstSeen: number }>();

  (signals ?? []).forEach((g, i) => {
    const id = typeof g.guarantorAccountId === "string" ? g.guarantorAccountId : undefined;
    const name = typeof g.guarantorName === "string" ? g.guarantorName : undefined;
    const key = id ?? name ?? `row-${i}`;
    const existing = groups.get(key);
    if (existing) {
      existing.facilityCount += 1;
      // A grade or status recorded on any row is the guarantor's.
      existing.riskStatus = existing.riskStatus ?? (typeof g.riskStatus === "string" ? g.riskStatus : undefined);
      existing.highestRiskGrade =
        existing.highestRiskGrade ?? (typeof g.highestRiskGrade === "string" ? g.highestRiskGrade : undefined);
      return;
    }
    groups.set(key, {
      guarantorAccountId: id,
      guarantorName: name,
      riskStatus: typeof g.riskStatus === "string" ? g.riskStatus : undefined,
      highestRiskGrade: typeof g.highestRiskGrade === "string" ? g.highestRiskGrade : undefined,
      facilityCount: 1,
      firstSeen: i,
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map(({ firstSeen: _f, ...row }) => row);
}
