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
import { fmtMoney } from "./format";

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

/** The two fields any involvement row carries a role in, raw or aggregated. */
export interface RoleWords {
  relationshipType?: string | null;
  borrowerType?: string | null;
}

/**
 * The role an involvement row plays, in the org's own word.
 *
 * `relationshipType` is the graph read's own role word and `borrowerType` is
 * what the same rows carry when it is blank. "Involved" is the honest last
 * resort: a role we cannot read is not a borrower by default.
 */
export function involvementRole(e: RoleWords): string {
  return (e.relationshipType ?? "").trim() || (e.borrowerType ?? "").trim() || "Involved";
}

/** IS THIS ROW A GUARANTY. `Guarantor`, `Limited Guarantor` and the graph
 *  read's own "Personal Guaranty" wording all are: a limited guaranty is a
 *  guaranty with a cap on it, and answering "who guarantees this" without the
 *  limited ones would leave a real obligor off the answer. */
export const isGuarantyRole = (e: RoleWords): boolean => /guarant/i.test(involvementRole(e));

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


/* ------------------------------------------------------ the party edges

   EVERY PARTY EDGE TERMINATES ON THE BORROWER ACCOUNT.

   Founder, 2026-09-03, anchored on the graph pane: "line from James Hartwell is
   not going to the borrower." Two defects sat behind the one symptom.

     - Only parties carrying an ownership percent became nodes. A guarantor with
       no equity reached the glass as a text row in a side card with no edge at
       all, so the read's own answer to "who guarantees this" was drawn nowhere.

     - The party that DID get an edge and happened to sit directly above the
       borrower got a straight vertical path, whose bounding box is zero pixels
       wide. An objectBoundingBox gradient refuses to paint a shape with no
       width (SVG 1.1 §13.2.4), so that one edge rendered as nothing.

   The graph the two reads support is a STAR: the borrower account in the
   middle, ONE edge per party, the role on the edge. Facilities are not nodes
   and must not become them — a guarantor on six of seven loans is one
   obligation with a coverage count, not six lines into six boxes.
   ======================================================================== */

/** Which way the ownership runs, told by the role word the collapse kept. */
export type EdgeDirection = "toBorrower" | "fromBorrower";

/** Roles where the COUNTERPARTY holds the equity: the arrow lands on the
 *  borrower. Both halves of the Hartwell read are here — the holding company
 *  is the "Parent", the two people are "Owner" and "Co-Owner". */
const PARTY_OWNS_ACCOUNT = /owner|parent|shareholder|member|principal|holding/i;
/** Roles where the ACCOUNT holds the equity: the arrow points back at the
 *  party. "Child" survives the mirror collapse only when no side described the
 *  counterparty in its own terms, and then it is the fact. */
const ACCOUNT_OWNS_PARTY = /child|subsidiar/i;

export function edgeDirection(roles: string[]): EdgeDirection {
  if (roles.some((r) => PARTY_OWNS_ACCOUNT.test(r))) return "toBorrower";
  return roles.some((r) => ACCOUNT_OWNS_PARTY.test(r)) ? "fromBorrower" : "toBorrower";
}

export interface PartyEdge {
  /** The party, and the source node of the edge. */
  name: string;
  counterpartyId?: string;
  /** Every role this party holds, once each, connection role first. */
  roles: string[];
  /** The edge label: the roles, the guaranty type and cap, the coverage. */
  label: string;
  /** Equity in the borrower, and ONLY from the connections read. */
  ownershipPercent: number | null;
  direction: EdgeDirection;
}

export interface PartyGraph {
  /** The one node every edge terminates on. */
  borrowerName: string;
  /** What the involvement read says about the borrower itself. */
  borrowerLabel: string;
  edges: PartyEdge[];
}

/** Push a segment unless the label already carries that word. */
function pushOnce(into: string[], seen: Set<string>, word: string | null | undefined): void {
  const w = (word ?? "").trim();
  if (!w || seen.has(w.toLowerCase())) return;
  seen.add(w.toLowerCase());
  into.push(w);
}

/**
 * One party's roles, in the org's own words, on one line.
 *
 * The guaranty type and its cap ride with the guaranty role, and the coverage
 * count rides with the involvement it counts: "Guarantor · Unlimited · 6
 * facilities" is the shape of the obligation said once.
 *
 * THE INVOLVEMENT'S OWN `ownershipPercent` IS NOT EQUITY. The org writes 100 on
 * a guaranty row for the share of the obligation, and on the borrower's own row
 * for the share it borrows. Printing it beside a name in an ownership tree
 * claims a stake the credit file does not record, so equity comes from the
 * connections read alone.
 */
function partyLabel(connectionRole: string | undefined, involvements: AggregatedInvolvement[]): string {
  const segs: string[] = [];
  const seen = new Set<string>();
  pushOnce(segs, seen, connectionRole);
  for (const e of involvements) {
    pushOnce(segs, seen, involvementRole(e));
    if (e.guarantyAmountType) segs.push(e.guarantyAmountType);
    if (isGuarantyRole(e) && e.contingentAmount != null) segs.push(fmtMoney(e.contingentAmount));
    if (e.facilityCount > 1) segs.push(`${e.facilityCount} facilities`);
  }
  return segs.join(" · ");
}

/**
 * THE STAR: the borrower account, and one edge per party onto it.
 *
 * Built off the roster, so a party the two reads both name is one edge holding
 * everything both know — never one edge for the ownership and a second for the
 * guaranty. The borrower's own involvement is not an edge to itself: it is the
 * label on the node the edges land on.
 */
export function partyGraph(
  connections: Connection[] | undefined,
  entities: LegalEntity[] | undefined,
  borrowerName: string,
): PartyGraph {
  const key = borrowerName.trim().toLowerCase();
  const roster = relationshipRoster(connections, entities);
  let borrowerLabel = "";
  const edges: PartyEdge[] = [];

  for (const p of roster) {
    if (p.name.trim().toLowerCase() === key) {
      borrowerLabel = partyLabel(undefined, p.involvements);
      continue;
    }
    const roles = [
      ...(p.connection?.role ? [p.connection.role] : []),
      ...p.involvements.map(involvementRole),
    ].filter((r, i, all) => all.findIndex((o) => o.toLowerCase() === r.toLowerCase()) === i);

    edges.push({
      name: p.name,
      counterpartyId: p.counterpartyId,
      roles,
      label: partyLabel(p.connection?.role, p.involvements),
      ownershipPercent: p.connection?.ownershipPercent ?? null,
      direction: edgeDirection(roles),
    });
  }

  return { borrowerName, borrowerLabel, edges };
}
