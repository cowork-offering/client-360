import { describe, expect, it } from "vitest";
import {
  NO_CONNECTOR_REFUSAL,
  NO_PACKAGE_REFUSAL,
  nothingFilesRefusal,
  whyAsked,
  whyChecked,
  whyHandoff,
  whyProposed,
  whyRefused,
} from "./explain";
import { catalogField } from "./fieldCatalog";
import type { WorkroomDelta } from "./types";

/* =============================================================================
   THE EXPLANATION LAYER, HELD TO ITS THREE RULES.

   Founder verdict 2026-08-29: the room "feels almost more like guided template
   still, no explanation" — "it can explain also concise in the flow what and why
   it is needed."

   What is proved here is not that a sentence exists. It is that the sentence

     1. carries the state it was composed from (a figure that could only have
        come off this package),
     2. stops at one thought, and
     3. speaks credit rather than schema — no object names, no "junction", no
        tool names, no "invocable".

   Rule 3 is machine-checked over every string this file can produce, because
   that is the one a later edit will break by accident.
   ============================================================================= */

/** Words a banker never has to read. `LLC_BI__` catches every managed API name
 *  in one go, and the rest are the vocabulary the founder called too technical. */
const SCHEMA_WORDS = [
  /LLC_BI__/,
  /\bjunction/i,
  /\binvocable/i,
  /C360WriteGuard/,
  /\ballowlist/i,
  /\bapex\b/i,
  /stage_[a-z_]+/,
  /execute_[a-z_]+/,
];

function speaksCredit(sentence: string) {
  for (const word of SCHEMA_WORDS) expect(sentence).not.toMatch(word);
}

const field = (id: string) => catalogField(id)!;

/** A delta shaped the way `toDelta` shapes one. Only what the explanations read. */
function delta(over: Partial<WorkroomDelta> = {}): WorkroomDelta {
  return {
    id: "d1",
    group: "terms",
    kind: "Term change",
    badge: "b",
    title: "Commitment amount",
    target: "Line of Credit",
    before: "$15M",
    after: "$20M",
    map: [],
    fields: [],
    filed: { recordId: "not filed", verification: "" },
    fileable: true,
    ...over,
  };
}

/* ------------------------------------------------------------------ asked */

describe("beat 1 — why the room needs the figure it is asking for", () => {
  it("names the package total the commitment drives, and the pool it is covered by", () => {
    const why = whyAsked(field("loan.amount"), { committed: 26_000_000, lendable: 34_600_000 });
    expect(why).toContain("$26M");
    expect(why).toContain("$34.60M");
    speaksCredit(why);
  });

  it("still answers where the read carries no collateral pool, without inventing one", () => {
    const why = whyAsked(field("loan.amount"), { committed: 26_000_000 });
    expect(why).toContain("$26M");
    expect(why).not.toContain("$34.60M");
    expect(why).not.toMatch(/undefined|NaN|—/);
  });

  it("gives each of the four filing terms its own reason, and none of them twice", () => {
    const ctx = { committed: 26_000_000 };
    const reasons = ["loan.amount", "loan.maturityDate", "loan.interestRate", "loan.termMonths"].map((id) =>
      whyAsked(field(id), ctx),
    );
    expect(new Set(reasons).size).toBe(4);
    for (const why of reasons) {
      expect(why.length).toBeGreaterThan(0);
      speaksCredit(why);
      // ONE THOUGHT. Two sentences here is the lecture the founder called out.
      expect(why.split(/[.!?] /).length).toBeLessThanOrEqual(1);
    }
  });

  it("says NOTHING rather than filler where it has nothing state-derived to add", () => {
    // A reason keyed on the CATEGORY would answer a guarantee-limit question
    // with a sentence about naming an entity. Silence is the correct answer.
    for (const id of ["package.name", "party.guaranteeLimit", "collateral.amountPledged", "covenant.threshold"]) {
      expect(whyAsked(field(id), { committed: 26_000_000 })).toBe("");
    }
  });
});

/* --------------------------------------------------------------- proposed */

describe("beat 2 — what confirming will actually do", () => {
  it("says the booked facility is untouched, and names the member it clones", () => {
    const why = whyProposed([delta()]);
    expect(why).toContain("clone of Line of Credit");
    expect(why).toContain("booked facilities and the current package stay exactly as they are");
    expect(why).toContain("the bank's own approval");
    speaksCredit(why);
  });

  it("names both members where a product word landed on two", () => {
    expect(whyProposed([delta(), delta({ id: "d2", target: "Equipment" })])).toContain("Line of Credit and Equipment");
  });

  it("counts instead of listing where the change set is wide", () => {
    const wide = ["A", "B", "C"].map((t, i) => delta({ id: `d${i}`, target: t }));
    expect(whyProposed(wide)).toContain("3 members");
  });

  it("stays silent where nothing in the set files, because nothing would be cloned", () => {
    expect(whyProposed([delta({ fileable: false })])).toBe("");
  });
});

/* ---------------------------------------------------------------- checked */

describe("beat 3 — why the coverage check matters here", () => {
  it("names the pool that does not move, and closes on what it still covers", () => {
    const why = whyChecked({ lendable: 34_600_000, covers: true });
    expect(why).toContain("$34.60M");
    expect(why).toContain("does not grow with the commitment");
    expect(why).toContain("still clears the whole commitment");
    speaksCredit(why);
  });

  it("closes the other way when it no longer covers", () => {
    const why = whyChecked({ lendable: 20_000_000, covers: false });
    expect(why).toContain("no longer clears the whole commitment");
    expect(why).not.toContain("still clears");
  });
});

/* ------------------------------------------------------------- handed off */

describe("beat 4 — why an entry is recorded rather than filed", () => {
  it("reads a covenant create as its attachment work, counted, and never as an allowlist", () => {
    const why = whyHandoff(
      delta({
        group: "covenants",
        op: "add",
        fileable: false,
        chainLinks: [
          { object: "a", via: "x", label: "l" },
          { object: "b", via: "y", label: "m" },
        ],
      }),
    );
    expect(why).toContain("2 connected writes");
    expect(why).toContain("nothing is silently dropped");
    speaksCredit(why);
  });

  it("reads a removal as a removal, in each of the three places one can happen", () => {
    for (const group of ["covenants", "security", "structure"] as const) {
      const why = whyHandoff(delta({ group, op: "remove", fileable: false }));
      expect(why).toMatch(/off the facility|Releasing a pledge|CARRY EXCLUSION/);
      speaksCredit(why);
    }
  });

  it("says the org holds no fee records at all rather than implying a missing permission", () => {
    const why = whyHandoff(delta({ group: "terms", op: "add", fileable: false, title: "Fee amount" }));
    expect(why).toContain("holds no fee records");
    speaksCredit(why);
  });

  it("says pricing cannot even be READ here, which is the honest half of that gap", () => {
    const why = whyHandoff(delta({ group: "terms", fileable: false, title: "Pricing spread" }));
    expect(why).toContain("neither read nor written");
    speaksCredit(why);
  });

  it("falls back to the four terms the credit action carries, named", () => {
    const why = whyHandoff(delta({ group: "terms", fileable: false, title: "Payment type" }));
    expect(why).toContain("commitment, rate, maturity and term");
    speaksCredit(why);
  });
});

/* ----------------------------------------------------------------- refused */

describe("beat 5 — why the answer is no, and what would work", () => {
  it("says what filing a compliance status DOES, and where to file it instead", () => {
    const why = whyRefused("covenant.complianceStatus");
    expect(why).toContain("cannot be pulled back");
    expect(why).toContain("Open the covenant review");
    speaksCredit(why);
  });

  it("separates a fact about the asset from a term on the facility", () => {
    const why = whyRefused("collateral.valuation");
    expect(why).toContain("fact about the asset");
    expect(why).toContain("Open the collateral valuation");
  });

  it("routes booking back to the bank's own approval rather than to a workaround", () => {
    for (const id of ["loan.stage", "package.stage"]) {
      const why = whyRefused(id);
      expect(why).toContain("real approvers");
      expect(why).toContain("submit it for approval");
      speaksCredit(why);
    }
  });

  it("has nothing to say about a field this room does not refuse", () => {
    expect(whyRefused("loan.amount")).toBe("");
  });
});

/* --------------------------------------------------------- the room's walls */

describe("every wall states the reason AND one way through it", () => {
  it("explains a disconnected view in banker terms with the control that confirms it", () => {
    expect(NO_CONNECTOR_REFUSAL).toContain("not connected to the bank's systems");
    expect(NO_CONNECTOR_REFUSAL).toContain("nothing here is ever simulated");
    expect(NO_CONNECTOR_REFUSAL).toContain("Reload the page and accept the connection prompt");
    expect(NO_CONNECTOR_REFUSAL).toContain("Sync control");
    speaksCredit(NO_CONNECTOR_REFUSAL);
  });

  it("explains an unanchored relationship and where to look", () => {
    expect(NO_PACKAGE_REFUSAL).toContain("anchored on one product package");
    expect(NO_PACKAGE_REFUSAL).toContain("check what the package read carries");
    speaksCredit(NO_PACKAGE_REFUSAL);
  });

  it("explains a manifest that files nothing, with both ways out", () => {
    const one = nothingFilesRefusal(1);
    expect(one).toContain("All 1 entry needs");
    expect(one).toContain("Add a commitment, rate, maturity or term change");
    expect(one).toContain("take the handoff list to the person who can action it");
    speaksCredit(one);
    expect(nothingFilesRefusal(4)).toContain("All 4 entries need");
  });
});
