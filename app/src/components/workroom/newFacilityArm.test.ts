import { describe, expect, it } from "vitest";
import {
  isNewFacilityMember,
  namesANewFacility,
  newFacilityDelta,
  readAmortisation,
  readAmount,
  readFirstPayment,
  readNewFacility,
  readNewFacilityTarget,
  readProduct,
  readPurpose,
  readPurposeValue,
  readTermMonths,
  newFacilityCreateEntry,
  newFacilityFeeEntry,
  newFacilityMember,
  newFacilityRemovalRefusal,
  stagedNewFacilities,
  PURPOSE_HANDOFF,
} from "./newFacilityArm";
import { readScope, type Draft, type ElicitContext } from "./elicit";
import { armOf, armPayload, armSummary, armStepPairs, isArmStep, type NewFacilitySpec } from "./orgArms";
import type { StagePayloads } from "../../channel/writeTools";
import type { ElicitMember } from "./elicit";

const LOC = "a4Zbb0000027MaYEAU";

const MEMBERS: ElicitMember[] = [
  {
    id: LOC,
    key: "line of credit",
    label: "Line of Credit ($15M)",
    orgName: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00",
    shortName: "Line of Credit - $15,000,000.00",
  } as ElicitMember,
];

const LINE = "add a new 3M equipment loan with a 60 month term for CNC line expansion";
const FULL = `${LINE} amortised over 60 months first payment 2026-10-01`;

const ctx = (over: Partial<Parameters<typeof readNewFacility>[0]> = {}) => ({
  line: FULL,
  mode: "modify" as const,
  members: MEMBERS,
  staged: 0,
  generatedAt: "2026-09-03T08:00:00.000Z",
  ...over,
});

type Payload = StagePayloads["loan-modification"];
const basePayload = (over: Partial<Payload> = {}): Payload =>
  ({
    idempotencyKey: "k",
    rationale: "r",
    facilityIds: [LOC],
    productPackageId: "a5Fbb000000IHFJEA4",
    ...over,
  }) as Payload;

describe("reading the founder's line", () => {
  it("reads the product, the amount, the term and the purpose out of one sentence", () => {
    expect(readProduct(LINE)).toBe("Equipment");
    expect(readAmount(LINE)).toBe(3_000_000);
    expect(readTermMonths(LINE)).toBe(60);
    expect(readPurpose(LINE)).toBe("CNC line expansion");
    // AND THE ORG'S OWN VALUE IT READS ONTO. The field is a RESTRICTED picklist,
    // so the banker's words are what the room reads and the coded value is what
    // the plan carries.
    expect(readPurposeValue("CNC line expansion")).toBe("business_expansion");
  });

  it("does not read the TERM as money, which is the decimal slip in the other direction", () => {
    expect(readAmount("add a new equipment loan with a 60 month term")).toBeNull();
    expect(readAmount("add a new equipment loan of $3,000,000")).toBe(3_000_000);
    expect(readAmount("add a new 3 million dollar equipment loan")).toBe(3_000_000);
  });

  it("reads a term written in years, and nothing it was not given", () => {
    expect(readTermMonths("add a new equipment loan over 5 years")).toBe(60);
    expect(readTermMonths("add a new equipment loan")).toBeNull();
  });

  it("refuses a purpose phrase that is really a target", () => {
    expect(readPurpose("add a covenant for the 15M line of credit")).toBeNull();
    expect(readPurpose("for CNC line expansion")).toBe("CNC line expansion");
  });

  it("reads the two pricing answers in the words a banker writes them", () => {
    expect(readAmortisation("amortised over 240 months")).toBe(240);
    expect(readAmortisation("25 year amortisation")).toBe(300);
    expect(readFirstPayment("first payment 2026-10-01")).toBe("2026-10-01");
    expect(readFirstPayment("first payment date is Oct 1, 2026")).toBe("2026-10-01");
  });

  it("knows a create line from a navigational one", () => {
    expect(namesANewFacility(LINE)).toBe(true);
    expect(namesANewFacility("let's modify a new loan")).toBe(false);
    expect(namesANewFacility("increase the 15M line to 20M")).toBe(false);
  });
});

describe("the elicitation, which holds no state between turns", () => {
  it("asks for the product first, and offers only what the record type carries", () => {
    const read = readNewFacility(ctx({ line: "add a new loan" }));
    expect(read?.kind).toBe("ask");
    if (read?.kind !== "ask") return;
    expect(read.text).toContain("What product is the new facility?");
    expect(read.options?.map((o) => o.label)).toContain("Equipment");
    expect(read.options?.map((o) => o.label)).not.toContain("Term");
  });

  it("asks each question with the WHOLE sentence typed back, so nothing is remembered", () => {
    const first = readNewFacility(ctx({ line: "add a new loan" }));
    if (first?.kind !== "ask") throw new Error("expected an ask");
    const withProduct = first.options!.find((o) => o.label === "Equipment")!.say;
    expect(withProduct).toContain("add a new loan");

    const second = readNewFacility(ctx({ line: withProduct }));
    if (second?.kind !== "ask") throw new Error("expected an ask");
    expect(second.text).toContain("How much is the new equipment?");
  });

  it("asks the amount, then the term, then the purpose, in that order", () => {
    const amount = readNewFacility(ctx({ line: "add a new equipment loan" }));
    expect(amount?.kind === "ask" && amount.text).toContain("How much");

    const term = readNewFacility(ctx({ line: "add a new 3M equipment loan" }));
    expect(term?.kind === "ask" && term.text).toContain("What term");

    const purpose = readNewFacility(ctx({ line: "add a new 3M equipment loan with a 60 month term" }));
    expect(purpose?.kind === "ask" && purpose.text).toContain("primary loan purpose");
  });

  it("RUNS THE PRICING GATE on the new facility, the amortised term then the first payment date", () => {
    const amort = readNewFacility(ctx({ line: LINE }));
    expect(amort?.kind).toBe("ask");
    if (amort?.kind !== "ask") return;
    expect(amort.text).toContain("amortisation term");
    expect(amort.text).toContain("nCino needs the amount, the term, the amortised term and the first payment date");
    expect(amort.options?.[0].label).toBe("Same as the term (60 months)");

    const next = readNewFacility(ctx({ line: amort.options![0].say }));
    expect(next?.kind).toBe("ask");
    if (next?.kind !== "ask") return;
    expect(next.text).toContain("first payment date");
    expect(next.options?.map((o) => o.label)).toEqual(["1 October 2026", "1 November 2026"]);
  });

  it("stages the card once all six answers are in the line", () => {
    const read = readNewFacility(ctx());
    expect(read?.kind).toBe("card");
    if (read?.kind !== "card") return;
    expect(read.spec).toEqual<NewFacilitySpec>({
      label: "new:1",
      product: "Equipment",
      amount: 3_000_000,
      termMonths: 60,
      purpose: "business_expansion",
      amortizedTermMonths: 60,
      firstPaymentDate: "2026-10-01",
    });
    expect(read.said).toContain("$3MM Equipment goes onto the new version");
    // AND IT NAMES THE ORG'S VALUE IT READ THE BANKER'S WORDS ONTO.
    expect(read.said).toContain('"CNC line expansion" reads onto Business expansion (business_expansion)');
    expect(read.said).toContain("new loan rather than a version of one");
  });

  it("numbers the second one new:2", () => {
    const read = readNewFacility(ctx({ staged: 1 }));
    expect(read?.kind === "card" && read.spec.label).toBe("new:2");
  });

  it("hands a RENEWAL the honest sentence, naming what stage_renewal does and does not do", () => {
    const read = readNewFacility(ctx({ mode: "renew" }));
    expect(read?.kind).toBe("handoff");
    if (read?.kind !== "handoff") return;
    expect(read.text).toContain("stage_renewal plans one");
    expect(read.text).toContain("Run this as a modification");
  });

  it("leaves the CREATE route alone: that room's own tool files a facility", () => {
    expect(readNewFacility(ctx({ mode: "create" }))).toBeNull();
  });
});

describe("the card, and the wire under it", () => {
  const card = () => {
    const read = readNewFacility(ctx());
    if (read?.kind !== "card") throw new Error("expected a card");
    return newFacilityDelta(read.spec, { anchorId: LOC, anchorLabel: "Line of Credit ($15M)" });
  };

  it("reads as its own manifest entry, and as an ADD", () => {
    const d = card();
    expect(d.kind).toBe("New facility");
    expect(d.op).toBe("add");
    expect(d.title).toBe("$3MM Equipment");
    expect(d.target).toBe("the new package version");
    expect(d.newMember).toBe(true);
    expect(d.committedDeltaMM).toBe(3);
    expect(d.fileable).toBe(true);
  });

  it("carries the facility on the arm and a REAL member on the wire", () => {
    const d = card();
    expect(armOf(d)).toEqual({
      kind: "newFacility",
      recordId: "new:1",
      targetLoanId: "new:1",
      facility: {
        label: "new:1",
        product: "Equipment",
        amount: 3_000_000,
        termMonths: 60,
        purpose: "business_expansion",
        amortizedTermMonths: 60,
        firstPaymentDate: "2026-10-01",
      },
    });
    /* THE ENGINE BUILDS `facilityIds` FROM THIS FIELD. A label here would put
       "new:1" into the payload's facility list and the org would refuse the
       whole plan, so the wire anchors on a booked member and the ARM carries
       the label. */
    expect(d.fieldWire?.facilityId).toBe(LOC);
  });

  it("lifts out of fieldChangesJson into newFacilitiesJson, and leaves facilityIds alone", () => {
    const d = card();
    const payload = armPayload(
      basePayload({ fieldChangesJson: JSON.stringify([{ field: d.fieldWire!.field, value: d.fieldWire!.value, targetLoanId: LOC }]) }),
    );
    expect(payload.fieldChangesJson).toBeUndefined();
    expect(JSON.parse(String(payload.newFacilitiesJson))).toEqual([
      {
        label: "new:1",
        product: "Equipment",
        amount: 3_000_000,
        termMonths: 60,
        purpose: "business_expansion",
        amortizedTermMonths: 60,
        firstPaymentDate: "2026-10-01",
      },
    ]);
    expect(payload.facilityIds).toEqual([LOC]);
  });

  it("ALWAYS sends targetLoanId on an arm aimed at a label, even on a single-facility plan", () => {
    const attach = {
      field: "__c360OrgArm",
      value: JSON.stringify({ kind: "covenantAttach", recordId: "a3Bbb000000S0bNEAS", targetLoanId: "new:1" }),
      targetLoanId: LOC,
    };
    const payload = armPayload(basePayload({ fieldChangesJson: JSON.stringify([attach]) }));
    expect(JSON.parse(String(payload.covenantAttachesJson))).toEqual([
      { covenantId: "a3Bbb000000S0bNEAS", targetLoanId: "new:1" },
    ]);
  });

  it("still omits targetLoanId for an ordinary single-facility arm", () => {
    const exclusion = {
      field: "__c360OrgArm",
      value: JSON.stringify({ kind: "covenantExclusion", recordId: "a3Bbb000000S0bNEAS", targetLoanId: LOC }),
      targetLoanId: LOC,
    };
    const payload = armPayload(basePayload({ fieldChangesJson: JSON.stringify([exclusion]) }));
    expect(JSON.parse(String(payload.covenantExclusionsJson))).toEqual([{ covenantId: "a3Bbb000000S0bNEAS" }]);
  });

  it("names its own plan steps, so a plan that skipped it can be caught before the token is spent", () => {
    const pairs = armStepPairs([card()]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].writeStepId).toBe("new_facility_0");
    expect(pairs[0].verifyStepId).toBe("new_facility_verify_0");
    expect(isArmStep("new_facility_0")).toBe(true);
    expect(isArmStep("new_facility_purpose_0")).toBe(false);
  });

  it("counts into the arm summary in the banker's own words", () => {
    expect(armSummary([card()])).toBe("1 net-new facility on the new version.");
  });
});

describe("naming it on a later line", () => {
  const card = () => {
    const read = readNewFacility(ctx());
    if (read?.kind !== "card") throw new Error("expected a card");
    return newFacilityDelta(read.spec, { anchorId: LOC, anchorLabel: "Line of Credit ($15M)" });
  };

  it("finds the net-new facilities on the manifest, in the order they were staged", () => {
    expect(stagedNewFacilities([card()])).toEqual([{ label: "new:1", product: "Equipment", title: "$3MM Equipment" }]);
  });

  it("resolves \"the new loan\" to the label where exactly one is staged", () => {
    const staged = stagedNewFacilities([card()]);
    expect(readNewFacilityTarget("add a DSC covenant >= 1.30 on the new loan", staged)).toEqual({
      label: "new:1",
      title: "$3MM Equipment",
    });
  });

  it("settles two of them on the product word, and asks where nothing settles it", () => {
    const staged = [
      { label: "new:1", product: "Equipment", title: "$3MM Equipment" },
      { label: "new:2", product: "Line of Credit", title: "$1MM Line of Credit" },
    ];
    expect(readNewFacilityTarget("add Elena Hartwell as limited guarantor on the new equipment loan", staged)).toEqual({
      label: "new:1",
      title: "$3MM Equipment",
    });
    expect(readNewFacilityTarget("add a DSC covenant on the new loan", staged)).toEqual({ ambiguous: staged });
  });

  it("says nothing about a line that names no new facility", () => {
    const staged = stagedNewFacilities([card()]);
    expect(readNewFacilityTarget("add a DSC covenant on the 15M line of credit", staged)).toBeNull();
    expect(readNewFacilityTarget("add a DSC covenant on the new loan", [])).toBeNull();
  });
});


/* ================================================== THE SCOPE MEMBER AND ITS LANES */

const SPEC = {
  label: "new:1",
  product: "Equipment",
  amount: 3_000_000,
  termMonths: 60,
  purpose: "business_expansion",
  amortizedTermMonths: 60,
  firstPaymentDate: "2026-10-01",
};

const BOOK = { covenants: [], assets: [], liens: ["1st"], parties: [] };
const CTX = {
  members: [...MEMBERS, newFacilityMember(SPEC)],
  focused: null,
  book: BOOK,
  plan: [],
  relationship: "Hartwell",
  catalog: null,
} as unknown as ElicitContext;

const draft = (over: Partial<Draft>): Draft =>
  ({ surface: "covenant", slots: {}, scope: ["new:1"], scopeWord: true, unused: null, ...over }) as Draft;

describe("the facility this plan is creating, as a scope member", () => {
  const scoped = [...MEMBERS, newFacilityMember(SPEC)];

  it("is a member whose ID IS ITS LABEL, so no third identifier exists", () => {
    const m = newFacilityMember(SPEC);
    expect(m.id).toBe("new:1");
    expect(m.label).toBe("$3MM Equipment");
    expect(m.key).toBe("equipment");
    expect(m.committed).toBe(3_000_000);
    // The org has not named it: nothing here pretends to know what it will pick.
    expect(m.orgName).toBeNull();
    expect(m.shortName).toBeNull();
    expect(isNewFacilityMember(m.id)).toBe(true);
    expect(isNewFacilityMember(LOC)).toBe(false);
  });

  it("settles \"the new loan\" on it, and says which facility it read", () => {
    const read = readScope("add a DSC covenant of 1.30 on the new loan", scoped);
    expect(read.ids).toEqual(["new:1"]);
    expect(read.said).toContain("the facility this plan is creating");
  });

  it("settles \"the new equipment loan\" on it rather than fanning out over the booked ones", () => {
    const read = readScope("add Elena Hartwell as limited guarantor on the new equipment loan", scoped);
    expect(read.ids).toEqual(["new:1"]);
  });

  it("leaves a line that does NOT say new exactly where it was", () => {
    const read = readScope("add a DSC covenant of 1.30 on the 15M line of credit", scoped);
    expect(read.ids).toEqual([LOC]);
  });

  it("settles it on the dollar qualifier too, because it carries its own commitment", () => {
    const read = readScope("add a covenant on the 3M loan", scoped);
    expect(read.ids).toEqual(["new:1"]);
  });

  it("ASKS where two of them answer to the same words", () => {
    const two = [
      ...MEMBERS,
      newFacilityMember(SPEC),
      newFacilityMember({ ...SPEC, label: "new:2", amount: 1_000_000 }),
    ];
    const read = readScope("add a covenant on the new loan", two);
    expect(read.ids).toEqual([]);
    expect(read.ambiguous).toBe(true);
  });
});

describe("the cards that land on a facility this plan is creating", () => {
  it("builds a covenant keyed to the label, never to a booked member", () => {
    const d = newFacilityCreateEntry({
      draft: draft({ surface: "covenant", slots: { test: "Debt Service Coverage of Borrower", threshold: 1.3 } }),
      ctx: CTX,
      spec: SPEC,
      seq: 0,
    })!;
    expect(d.member).toBe("new:1");
    expect(d.target).toBe("$3MM Equipment");
    expect(d.covenantWire).toMatchObject({ typeName: "Debt Service Coverage of Borrower", threshold: 1.3, facilityId: "new:1" });
    expect(d.before).toContain("does not exist yet");
  });

  it("builds a borrowing-structure add keyed to the label", () => {
    const d = newFacilityCreateEntry({
      draft: draft({ surface: "involvement", slots: { party: "Elena Hartwell", role: "Limited Guarantor" } }),
      ctx: CTX,
      spec: SPEC,
      seq: 1,
    })!;
    expect(d.involvementWire).toEqual({
      op: "add",
      role: "Limited Guarantor",
      accountName: "Elena Hartwell",
      facilityId: "new:1",
    });
  });

  it("builds a pledge for an asset the borrower already owns, keyed to the label", () => {
    const d = newFacilityCreateEntry({
      draft: draft({ surface: "collateral", slots: { assetId: "a3Xbb000000AAAA", assetLabel: "Fort Wayne inventory", lien: "1st" } }),
      ctx: CTX,
      spec: SPEC,
      seq: 2,
    })!;
    expect(d.pledgeWire).toMatchObject({ collateralId: "a3Xbb000000AAAA", facilityId: "new:1" });
    expect(d.pledgeWire?.newCollateral).toBeUndefined();
  });

  it("builds a percentage fee that sends no money figure", () => {
    const d = newFacilityFeeEntry({ kind: "Origination fee", percentage: 1, memberId: "new:1" }, SPEC, 3)!;
    expect(d.feeWire).toMatchObject({
      feeType: "Loan Origination",
      calculationType: "Percentage",
      percentage: 1,
      facilityId: "new:1",
    });
    expect(d.feeWire?.amount).toBeUndefined();
  });

  it("returns null rather than a half-built card", () => {
    expect(newFacilityCreateEntry({ draft: draft({ surface: "covenant", slots: {} }), ctx: CTX, spec: SPEC, seq: 0 })).toBeNull();
    expect(
      newFacilityCreateEntry({ draft: draft({ surface: "involvement", slots: { party: "X" } }), ctx: CTX, spec: SPEC, seq: 0 }),
    ).toBeNull();
    expect(newFacilityFeeEntry({ kind: "Origination fee", memberId: "new:1" }, SPEC, 0)).toBeNull();
  });

  it("hands an ASSOCIATE back: that is a junction to a covenant that exists, on its own arm", () => {
    const d = newFacilityCreateEntry({
      draft: draft({ surface: "covenant", slots: { associate: true, test: "X", threshold: 1 } }),
      ctx: CTX,
      spec: SPEC,
      seq: 0,
    });
    expect(d).toBeNull();
  });
});

describe("what may NOT land on a facility this plan is creating", () => {
  it("refuses a removal by name, matching what the Apex refuses", () => {
    const why = newFacilityRemovalRefusal("$3MM Equipment", "covenant");
    expect(why).toContain("$3MM Equipment is a facility this plan is CREATING");
    expect(why).toContain("no covenant on it to take off");
    expect(why).toContain("everything on it is an ADD");
    expect(why).toContain("nothing has come off the manifest");
  });
});

describe("the purpose is said rather than silently carried", () => {
  it("names where it goes, on the card and in the room's own sentence", () => {
    expect(PURPOSE_HANDOFF).toContain("Purpose goes on the Loan Detail after filing, handed off");
    const read = readNewFacility(ctx());
    if (read?.kind !== "card") throw new Error("expected a card");
    expect(read.said).toContain("Purpose goes on the Loan Detail after filing, handed off");
    const d = newFacilityDelta(read.spec, { anchorId: LOC, anchorLabel: "Line of Credit ($15M)" });
    expect(d.map.find(([k]) => k === "Purpose handoff")?.[1]).toBe(PURPOSE_HANDOFF);
  });
});
