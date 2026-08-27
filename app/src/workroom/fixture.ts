/* =============================================================================
   THE HARTWELL PACKAGE, AS THE ROOM READS IT.

   Every figure here is a REAL Hartwell figure (knowledge/DEMO-RELATIONSHIP.md,
   carried through the blessed mock v2.2). Pro-forma arithmetic is labelled as
   such wherever the room shows it; nothing in this file is invented money.

   This is the SCRIPTED read the shell runs on for all three modes. The wiring
   waves replace the engine, not this file's shape: a real engine hands back the
   same members, the same package position and the same source rows, resolved
   from the cockpit's own bundle instead of from here.
   ============================================================================= */

import type { HaveRow, PackageMember } from "./types";

/* THE CHIP SAYS THE PRODUCT, and the RECORD ID is held on `id` where a click
   and a React key can resolve on it. Printing "HW1001" on the face of a member
   chip put a record id in the room's opening view, which is exactly the reading
   the founder called hardcoded; the id is still here, it is simply no longer
   what a banker is asked to read. */

/** The package's committed total today, in millions. Every pro-forma figure the
 *  manifest shows is this number plus what has landed in the rail. */
export const COMMITTED_MM = 46.0;

export const MEMBERS: PackageMember[] = [
  {
    id: "HW1001",
    key: "Revolver",
    short: "Revolver",
    tag: "Booked",
    product: "Revolving line of credit",
    amount: "$15.0MM",
    detail: "$9,200,000 outstanding · SOFR+275, 7.60% · matures 2027-03-15",
    utilisation: 61,
    available: "$5.8MM available",
  },
  {
    id: "HW1002",
    key: "Equipment",
    short: "Equipment",
    tag: "Booked",
    product: "Equipment",
    amount: "$8.0MM",
    detail: "$5.9MM outstanding · 6.85% fixed",
  },
  {
    id: "HW1003",
    key: "Construction",
    short: "Construction",
    tag: "Booked",
    product: "Construction",
    amount: "$12.0MM",
    detail: "$7.35MM outstanding · grade 5",
  },
  {
    id: "HW1004",
    key: "Purchase",
    short: "Purchase",
    tag: "Booked",
    product: "Purchase",
    amount: "$5.0MM",
    detail: "$4.42MM outstanding · 6.25% fixed",
  },
  {
    id: "HW1005",
    key: "Equipment",
    short: "Equipment",
    tag: "Booked",
    product: "Equipment",
    amount: "$3.5MM",
    detail: "$3.01MM outstanding · 7.35% fixed",
  },
  {
    id: "HW1006",
    key: "Seasonal",
    short: "Seasonal",
    tag: "Booked",
    product: "Seasonal line of credit",
    amount: "$2.5MM",
    detail: "$1.15MM outstanding · SOFR+300, 7.85% · matures 2026-06-30",
  },
  {
    id: "HW1007",
    key: "Equipment",
    short: "Equipment",
    tag: "Proposal",
    product: "Equipment",
    amount: "$3.0MM",
    detail: "Staged, not booked · showcase member",
    proposed: true,
  },
];

/** What the package holds today. Rows are addressed by key so each mode's
 *  source tray can show the ones its own story reads. */
export const HAVE: Record<string, HaveRow> = {
  position: {
    label: "Package position",
    value: "7 of 7 members · $46.0MM committed",
    detail:
      "Package a5Fbb000000IHFJEA4. $31,030,000 drawn, $14,970,000 unused across the booked six. Risk rating 4, stage Complete, status Approved. Borrower is the operating company, guaranteed by Hartwell Industrial Holdings LLC and James Hartwell unlimited, Elena Hartwell limited to $5.0MM on HW1001.",
  },
  revolver: {
    label: "The member in question",
    value: "HW1001 · Revolving line of credit · $15,000,000",
    detail:
      "$9,200,000 outstanding, 61% drawn. SOFR+275, 7.60% today. Closed 2024-03-15, matures 2027-03-15. Risk grade 4.",
  },
  seasonal: {
    label: "The member in question",
    value: "HW1006 · Seasonal line of credit · $2,500,000",
    detail:
      "$1,150,000 outstanding, 46% drawn. SOFR+300, 7.85% today. Closed 2025-06-30, matures 2026-06-30. Risk grade 5. Receivables of $1,600,000 are pledged to it at 100%.",
  },
  maturities: {
    label: "Maturing inside the window",
    value: "2 of 7 members mature before 2026-12-31",
    detail:
      "HW1006 seasonal line of credit, $2,500,000, matures 2026-06-30. HW1003 construction, $12,000,000, matures 2026-11-01 and carries policy exception a4rbb000003NxldAAC at Major / Mitigated. Nothing else on the package matures before 2028.",
  },
  covenants: {
    label: "Covenants",
    value: "6 covenants, 6 compliant, 2 loan junctions",
    detail:
      "Fixed charge coverage 1.22x against a 1.15x floor, 7 bps of cushion. Debt service coverage 1.38x against 1.25x. Minimum liquidity $6.8MM against a $5.0MM floor, tested at account level. Borrowing base certificate junctions to HW1001, Kokomo completion junctions to HW1003. No facility level liquidity test exists on HW1001.",
  },
  collateral: {
    label: "Collateral pool",
    value: "$48,000,000 appraised · $34,600,000 lendable",
    detail:
      "Receivables $12.0MM at 80%, inventory $8.0MM at 50%, equipment $10.0MM at 75%, real estate $14.0MM at 75%. Those four are pledged to the dollar, $31,600,000 lendable against $31,600,000 pledged across seven rows. The Mazak tooling at $4.0MM and 75% is appraised and unpledged, $3,000,000 lendable and the only headroom in the pool.",
  },
};

/** The client's own words, segmented so the peek can highlight what the agent
 *  parsed out of them. Modify only: no other mode has an email, and a room with
 *  no email never mentions one. */
export const CLIENT_EMAIL: { text: string; parsed?: true }[] = [
  { text: "Good morning,\n\nThe Kokomo tooling package is further along than we planned. The " },
  { text: "Mazak", parsed: true },
  { text: " cells land in " },
  { text: "October", parsed: true },
  {
    text: " and we need to fund the deposit and the install before the aerospace programme ramps in Q1.\n\nWe would like to increase our operating line from ",
  },
  { text: "15 to 20 million", parsed: true },
  { text: " to fund the " },
  { text: "Kokomo tooling ramp", parsed: true },
  {
    text: " and to carry the receivable build that comes with it. Elena can send the June figures and the updated equipment schedule today.\n\nLet me know what you need from us.\n\nJames Hartwell\nPresident and CEO\nHartwell Precision Manufacturing LLC",
  },
];

/** The governance sentence, identical in all three modes because the governance
 *  is. Rendered as a peek off the plan card. */
export const GOVERNANCE =
  "Nothing has been written up to this point; the chips were staged intent. Approval redeems a single use token, the execution delegates to the same clone, stage and book mechanics the org already runs, and any org validation message is carried through verbatim.";
