import { describe, expect, it } from "vitest";
import {
  ARM_FIELD,
  ArmRefusal,
  armConfirmSentence,
  armPayload,
  armStage,
  armOf,
  covenantExclusionDelta,
  readArmRemoval,
} from "./orgArms";
import type { Book, ElicitMember } from "./elicit";
import type { StagePayloads } from "../../channel/writeTools";

/* =============================================================================
   THE ORG ARMS, AT THE SEAM.

   Every line below is from the founder's own modification drive
   (`knowledge/MODIFICATION-DRIVE-SCRIPT-20260901.md`): line 6 is the covenant
   removal that used to be refused, line 9 the pledge removal that was answered
   in covenant words, and the P1 associate is the third instrument the dedupe
   now offers. The shapes are `design/proposals/org-arms-addendum.md` verbatim.
   ============================================================================= */

const LOC = "a4Zbb0000027MaYEAU";
const SEASONAL = "a4Zbb0000027MnREAU";
const EQUIPMENT = "a4Zbb0000027MpXEAU";
const LIQUIDITY = "a3Xbb00000012ABCAY";
const DSC = "a3Xbb00000012DEFAY";
const RECEIVABLES = "a35bb0000013xz3AAA";

const MEMBERS: ElicitMember[] = [
  { id: LOC, key: "line-of-credit", label: "Line of Credit ($15M)", orgName: null, shortName: "Line of Credit - $15,000,000.00", committed: 15_000_000 },
  { id: SEASONAL, key: "line-of-credit", label: "Line of Credit ($2.50M)", orgName: null, shortName: "Line of Credit - $2,500,000.00", committed: 2_500_000 },
  { id: EQUIPMENT, key: "equipment", label: "Equipment ($8M)", orgName: null, shortName: "Equipment - $8,000,000.00", committed: 8_000_000 },
];

const BOOK: Book = {
  covenants: [
    { id: LIQUIDITY, type: "Minimum Liquidity", threshold: 5_000_000, frequency: "Monthly", loanIds: [LOC], accountLevel: false },
    { id: DSC, type: "Debt Service Coverage of Borrower", threshold: 1.25, frequency: "Quarterly", loanIds: [], accountLevel: true },
  ],
  assets: [
    {
      id: RECEIVABLES,
      label: "All present and future accounts receivable. Excludes invoices over 90 days past due and intercompany balances.",
      name: "COL-000758",
      kind: "Accounts Receivable",
      value: 9_400_000,
      lien: "1st",
      loanIds: [LOC],
    },
  ],
  liens: ["1st"],
  parties: [],
};

const ctx = (over: Partial<Parameters<typeof readArmRemoval>[0]> = {}) => ({
  line: "remove the Minimum Liquidity covenant from the 15M line of credit",
  scope: "covenant" as const,
  name: "Minimum Liquidity",
  book: BOOK,
  members: MEMBERS,
  focused: null,
  mode: "modify" as const,
  ...over,
});

/** `FacilityAnchor` is a XOR union, so a spread has to be re-asserted: the
 *  payloads below always carry `facilityIds` and never `loanId`. */
type Payload = StagePayloads["loan-modification"];
const basePayload = (over: Partial<Payload> = {}): Payload =>
  ({
    idempotencyKey: "k",
    rationale: "r",
    facilityIds: [LOC],
    productPackageId: "a3Rbb0000004CxwEAE",
    requestedAmount: null,
    requestedMaturityDate: null,
    requestedTermMonths: null,
    requestedRate: null,
    ...over,
  }) as Payload;

describe("the covenant carry exclusion (drive line 6)", () => {
  it("stages an exclusion where the covenant IS on that facility, and says the booked loan keeps it", () => {
    const read = readArmRemoval(ctx());
    expect(read?.kind).toBe("exclusion");
    if (read?.kind !== "exclusion") return;
    expect(read.said).toContain("will not carry onto the new version of Line of Credit ($15M)");
    expect(read.said).toContain("the booked loan keeps it");
    expect(read.delta.op).toBe("remove");
    expect(read.delta.title).toBe("Minimum Liquidity");
    expect(read.delta.target).toBe("Line of Credit ($15M)");
    expect(read.delta.after).toBe("not carried onto the new version");
  });

  it("names it an exclusion everywhere the banker reads it, and a delete nowhere", () => {
    const read = readArmRemoval(ctx());
    if (read?.kind !== "exclusion") throw new Error("expected an exclusion");
    const named = [read.delta.kind, read.delta.badge, read.delta.after, ...read.delta.map.map((m) => m[1])].join(" ");
    expect(named).toMatch(/carry exclusion/i);
    expect(named).not.toMatch(/\bdelet/i);
    expect(named).not.toMatch(/\bdetach/i);
    // And the sentence says so outright rather than leaving it to be inferred.
    expect(read.said).toContain("Nothing is deleted");
  });

  it("resolves the covenant id the read carries onto the wire", () => {
    const read = readArmRemoval(ctx());
    if (read?.kind !== "exclusion") throw new Error("expected an exclusion");
    expect(armOf(read.delta)).toEqual({ kind: "covenantExclusion", recordId: LIQUIDITY, targetLoanId: LOC });
  });

  it("REFUSES by name where the facility does not carry it, and says where it is", () => {
    const read = readArmRemoval(ctx({ line: "remove the Minimum Liquidity covenant from the 8M equipment loan" }));
    expect(read?.kind).toBe("refusal");
    if (read?.kind !== "refusal") return;
    expect(read.text).toContain("not attached to the Equipment ($8M)");
    expect(read.text).toContain("Line of Credit ($15M)");
    expect(read.text).toContain("nothing has come off the manifest");
  });

  it("says a relationship-level covenant has no loan junction at all", () => {
    const read = readArmRemoval(
      ctx({ line: "remove the Debt Service Coverage of Borrower covenant from the 15M line of credit", name: "Debt Service Coverage of Borrower" }),
    );
    expect(read?.kind).toBe("refusal");
    if (read?.kind !== "refusal") return;
    expect(read.text).toContain("relationship level, with no loan junction on it at all");
  });

  it("asks which facility where the line names none and the room stands on none", () => {
    const read = readArmRemoval(ctx({ line: "remove the Minimum Liquidity covenant" }));
    expect(read?.kind).toBe("ask");
    if (read?.kind !== "ask") return;
    expect(read.text).toContain("A carry exclusion is per facility");
    expect(read.options).toHaveLength(3);
  });

  it("takes the focused member where the line names no facility", () => {
    const read = readArmRemoval(ctx({ line: "remove the Minimum Liquidity covenant", focused: MEMBERS[0] }));
    expect(read?.kind).toBe("exclusion");
  });

  it("hands a renewal and a new facility back to the fence: those tools do not take it", () => {
    expect(readArmRemoval(ctx({ mode: "renew" }))).toBeNull();
    expect(readArmRemoval(ctx({ mode: "create" }))).toBeNull();
  });

  it("hands back to the fence where the read carries no covenant id to name", () => {
    const anonymous: Book = { ...BOOK, covenants: [{ ...BOOK.covenants[0], id: null }] };
    expect(readArmRemoval(ctx({ book: anonymous }))).toBeNull();
  });
});

describe("the arm payload, at the wire", () => {
  const armDelta = covenantExclusionDelta(BOOK.covenants[0], { facilityId: LOC, facilityLabel: "Line of Credit ($15M)" });

  const withArms = (count: number, ids: string[] = [LIQUIDITY]) =>
    basePayload({
      fieldChangesJson: JSON.stringify(
        Array.from({ length: count }, (_, i) => ({
          field: ARM_FIELD,
          value: JSON.stringify({ kind: "covenantExclusion", recordId: ids[i % ids.length], targetLoanId: LOC }),
          targetLoanId: LOC,
        })),
      ),
    });

  it("lifts the arm out of fieldChangesJson and sends covenantExclusionsJson", () => {
    const out = armPayload(withArms(1));
    expect(JSON.parse(out.covenantExclusionsJson!)).toEqual([{ covenantId: LIQUIDITY }]);
    expect("fieldChangesJson" in out).toBe(false);
  });

  it("keeps a real field change beside the arm", () => {
    const payload = basePayload({
      fieldChangesJson: JSON.stringify([
        { field: "LLC_BI__Payment_Schedule__c", value: "Monthly", targetLoanId: EQUIPMENT },
        { field: ARM_FIELD, value: JSON.stringify({ kind: "covenantExclusion", recordId: LIQUIDITY, targetLoanId: LOC }), targetLoanId: LOC },
      ]),
      facilityIds: [LOC, EQUIPMENT],
    });
    const out = armPayload(payload);
    expect(JSON.parse(out.fieldChangesJson!)).toEqual([
      { field: "LLC_BI__Payment_Schedule__c", value: "Monthly", targetLoanId: EQUIPMENT },
    ]);
    expect(JSON.parse(out.covenantExclusionsJson!)).toEqual([{ covenantId: LIQUIDITY, targetLoanId: LOC }]);
  });

  it("omits targetLoanId on a single-facility plan and sends it on a multi-facility one", () => {
    expect(JSON.parse(armPayload(withArms(1)).covenantExclusionsJson!)[0]).not.toHaveProperty("targetLoanId");
    const many = armPayload({ ...withArms(1), facilityIds: [LOC, EQUIPMENT] } as Payload);
    expect(JSON.parse(many.covenantExclusionsJson!)[0]).toHaveProperty("targetLoanId", LOC);
  });

  it("leaves a payload carrying no arm byte-identical", () => {
    const plain = basePayload({ requestedAmount: 20_000_000 });
    expect(armPayload(plain)).toBe(plain);
  });

  it("refuses an eleventh exclusion rather than letting the org refuse the plan", () => {
    const ids = Array.from({ length: 11 }, (_, i) => `a3Xbb0000001${String(i).padStart(4, "0")}AY`);
    expect(() => armPayload(withArms(11, ids))).toThrow(ArmRefusal);
    expect(() => armPayload(withArms(11, ids))).toThrow(/at most 10/);
  });

  it("wraps the engine's own stage dependency", async () => {
    const sent: Payload[] = [];
    const stage = async (payload: Payload) => {
      sent.push(payload);
      return { ok: true as const, result: {} as never };
    };
    await armStage(stage)(withArms(1));
    expect(JSON.parse(sent[0].covenantExclusionsJson!)).toEqual([{ covenantId: LIQUIDITY }]);
  });

  it("carries the arm through the delta the room actually stages", () => {
    const out = armPayload(
      basePayload({
        fieldChangesJson: JSON.stringify([
          { field: armDelta.fieldWire!.field, value: armDelta.fieldWire!.value, targetLoanId: armDelta.fieldWire!.facilityId },
        ]),
      }),
    );
    expect(JSON.parse(out.covenantExclusionsJson!)).toEqual([{ covenantId: LIQUIDITY }]);
  });
});

describe("the confirm sentence", () => {
  it("says the booked loan is untouched and the clone will not carry it", () => {
    const delta = covenantExclusionDelta(BOOK.covenants[0], { facilityId: LOC, facilityLabel: "Line of Credit ($15M)" });
    const said = armConfirmSentence(
      delta,
      "Minimum Liquidity on Line of Credit ($15M): on the booked facility to not carried, staged on the clone. The package total holds at $49.0M. What else?",
    );
    expect(said).toContain("will not carry onto the new version of Line of Credit ($15M)");
    expect(said).toContain("The booked loan keeps it");
    expect(said).not.toContain("staged on the clone");
    // The engine still owns the package figure and the next move.
    expect(said).toContain("The package total holds at $49.0M.");
    expect(said).toContain("What else?");
  });

  it("leaves a delta carrying no arm exactly as the engine composed it", () => {
    const plain = { id: "x", fieldWire: { field: "LLC_BI__Payment_Schedule__c", label: "", value: "Monthly", display: "", facilityId: LOC } } as never;
    expect(armConfirmSentence(plain, "unchanged.")).toBe("unchanged.");
  });
});
