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

     - INVOLVEMENTS repeat PER FACILITY, FOR EVERY PARTY. The org writes one
       row per (party, role, loan), so the 2026-09-02 read of Hartwell carries
       22 rows for 5 parties: the borrower on 7 loans, two unlimited guarantors
       on 6 each, a limited guarantor on 2, a related entity on 1. Six identical
       lines told a banker nothing the first one did not; twenty-two lines over
       five names is worse, because it reads as twenty-two obligations.

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
 * The role an involvement row plays, in the org's own word.
 *
 * `relationshipType` is the graph read's own role word and `borrowerType` is
 * what the same rows carry when it is blank. "Involved" is the honest last
 * resort: a role we cannot read is not a borrower by default.
 */
export function involvementRole(e: LegalEntity): string {
  return (e.relationshipType ?? "").trim() || (e.borrowerType ?? "").trim() || "Involved";
}

/** IS THIS ROW A GUARANTY. `Guarantor`, `Limited Guarantor` and the graph
 *  read's own "Personal Guaranty" wording all are: a limited guaranty is a
 *  guaranty with a cap on it, and answering "who guarantees this" without the
 *  limited ones would leave a real obligor off the answer. */
export const isGuarantyRole = (e: LegalEntity): boolean => /guarant/i.test(involvementRole(e));

/**
 * One row per (party, role), with the facility count and the loans behind it.
 *
 * The org records the involvement once per loan, so a borrower on seven
 * facilities produces seven identical rows and a guarantor on six produces six.
 * Those lines tell a banker nothing they did not know from the first; "6
 * facilities" tells them the shape of the obligation.
 *
 * THE COUNT IS DISTINCT LOANS, NOT ROWS. A read that carries the same party on
 * the same loan twice is duplication of exactly the kind this module exists to
 * collapse, and counting it as two facilities would put the multiplicity back
 * in a number instead of in a list. A group carrying no loan id at all is
 * relationship-wide and counts as the one involvement it is.
 */
export function aggregateInvolvements(entities: LegalEntity[] | undefined): AggregatedInvolvement[] {
  const groups = new Map<string, AggregatedInvolvement & { firstSeen: number; rows: number }>();

  (entities ?? []).forEach((e, i) => {
    const key = `${e.accountName ?? ""}|${e.borrowerType ?? ""}|${e.relationshipType ?? ""}`;
    const existing = groups.get(key);
    const loanId = typeof e.loanId === "string" ? e.loanId : undefined;

    if (existing) {
      existing.rows += 1;
      if (loanId && !existing.loanIds.includes(loanId)) existing.loanIds.push(loanId);
      // A percent, a guaranty type or a contingent amount recorded on ANY row of
      // the group is the group's: the org leaves the field blank on the copies.
      existing.ownershipPercent = existing.ownershipPercent ?? num(e.ownershipPercent);
      existing.guarantyAmountType = existing.guarantyAmountType ?? (e.guarantyAmountType ?? undefined);
      existing.contingentAmount = existing.contingentAmount ?? num(e.contingentAmount);
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
      rows: 1,
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map(({ firstSeen: _firstSeen, rows, ...row }) => ({ ...row, facilityCount: row.loanIds.length || rows }));
}

/* ------------------------------------------------------------- the roster

   ONE PARTY, ONE LINE, WHATEVER THE READ CALLS THEM.

   The two graph reads describe the same people from different sides, and on a
   real book they OVERLAP: Hartwell Industrial Holdings is the 100 percent
   parent in `connections` AND the unlimited guarantor on all six loans in
   `legalEntities`. Rendering the connection in one card and the involvement in
   another put the same name on the graph tab three times (2026-09-02, the
   22-row read), which is the standing rule broken by two reads instead of by
   one. The roster is the join: every party the relationship carries, once,
   holding everything both reads know about them. */

export interface RosterParty {
  /** The name, spelled the way the read that carries it spells it. */
  name: string;
  counterpartyId?: string;
  /** The ownership edge, where the connections read carries one for this name. */
  connection?: CollapsedConnection;
  /** Every involvement this party holds, one row per role. */
  involvements: AggregatedInvolvement[];
}

/**
 * EVERY PARTY ON THIS RELATIONSHIP, ONCE.
 *
 * Connections first, in the order they collapse, then the parties only the
 * involvement rows name. Joined on the NAME, because the involvement rows carry
 * no account id: the graph read gives ids to counterparties and not to legal
 * entities, so the name is the only key both sides hold.
 */
export function relationshipRoster(
  connections: Connection[] | undefined,
  entities: LegalEntity[] | undefined,
): RosterParty[] {
  const out: RosterParty[] = [];
  const byName = new Map<string, RosterParty>();

  for (const c of collapseConnections(connections)) {
    const name = (c.counterpartyName ?? "").trim();
    if (!name) continue;
    const party: RosterParty = { name, counterpartyId: c.counterpartyId, connection: c, involvements: [] };
    byName.set(name.toLowerCase(), party);
    out.push(party);
  }

  for (const e of aggregateInvolvements(entities)) {
    const name = (e.accountName ?? "").trim();
    if (!name) continue;
    const held = byName.get(name.toLowerCase());
    if (held) {
      held.involvements.push(e);
      continue;
    }
    const party: RosterParty = { name, involvements: [e] };
    byName.set(name.toLowerCase(), party);
    out.push(party);
  }

  return out;
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
