import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, Worklist } from "../data/contract";
import { MAX_SUGGESTIONS, suggestActions } from "./suggest";

const ID = "001TEST";
const NAME = "Testco Industries, Inc.";

function bundle(): BorrowerBundle {
  return {
    snapshot: { accountId: ID, name: NAME, primaryRiskRating: "5" },
    exposure: {
      facilities: [
        { loanId: "L1", stage: "Booked", maturityDate: "2027-03-15", collateral: [{ collateralType: "Equipment" }] },
      ],
    },
    covenants: { covenants: [{ covenantType: "DSC" }] },
    boom: { ratios: { totalLeverage: 3.1 } },
  };
}

const data = {
  meta: { anchorAccountId: ID, generatedAt: "2026-07-02T09:15:00Z" },
  portfolio: { accounts: [{ accountId: ID, name: NAME }] },
  borrower: bundle(),
  borrowers: { [ID]: bundle() },
} as unknown as C360Data;

const wl = (codes: string[]): Worklist => ({ accountIds: [ID], reasons: { [ID]: codes } }) as Worklist;

describe("suggestActions", () => {
  it("returns book-level prompts on the home view (no account)", () => {
    const s = suggestActions(data, wl([]), null, null);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.prompt.length > 0)).toBe(true);
    expect(s.map((x) => x.id)).toContain("book-triage");
  });

  it("never exceeds the cap", () => {
    const s = suggestActions(data, wl(["COVENANT_BREACH", "MATURITY_NEAR", "MODIFICATION_CLUSTER", "GUARANTOR_SIGNAL"]), ID, NAME);
    expect(s.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });

  it("suggests Covenant Review on a covenant breach", () => {
    expect(suggestActions(data, wl(["COVENANT_BREACH"]), ID, NAME)[0].id).toBe("covenant-review");
  });

  it("suggests Covenant Review on a covenant due", () => {
    expect(suggestActions(data, wl(["COVENANT_DUE"]), ID, NAME)[0].id).toBe("covenant-review");
  });

  it("suggests Renewal on a near maturity", () => {
    expect(suggestActions(data, wl(["MATURITY_NEAR"]), ID, NAME)[0].id).toBe("renewal");
  });

  it("ranks breach above maturity when both fire", () => {
    const ids = suggestActions(data, wl(["MATURITY_NEAR", "COVENANT_BREACH"]), ID, NAME).map((s) => s.id);
    expect(ids.indexOf("covenant-review")).toBeLessThan(ids.indexOf("renewal"));
  });

  it("never suggests an unavailable action", () => {
    // Strip covenants -> Covenant Review is unavailable, so a breach signal
    // must NOT produce that chip.
    const b = bundle();
    b.covenants = { covenants: [] };
    const stripped = { ...data, borrowers: { [ID]: b }, borrower: b } as unknown as C360Data;
    const ids = suggestActions(stripped, wl(["COVENANT_BREACH"]), ID, NAME).map((s) => s.id);
    expect(ids).not.toContain("covenant-review");
  });

  it("tops up with defaults when nothing is flagged", () => {
    const s = suggestActions(data, wl([]), ID, NAME);
    expect(s.length).toBe(MAX_SUGGESTIONS);
    expect(s.map((x) => x.id)).toContain("generate-spreading");
  });

  it("emits fully-rendered prompts naming the account", () => {
    for (const s of suggestActions(data, wl(["COVENANT_BREACH"]), ID, NAME)) {
      expect(s.prompt).toContain(NAME);
      expect(s.prompt).not.toMatch(/\{account\}|\{accountId\}/);
    }
  });

  it("C4 — an account with a MISSING NAME still gets account-scoped suggestions", () => {
    const s = suggestActions(data, wl(["COVENANT_BREACH"]), ID, null);
    expect(s.map((x) => x.id)).not.toContain("book-triage");
    expect(s[0].id).toBe("covenant-review");
    expect(s[0].prompt).toContain(ID);
  });

  it("does not repeat an action", () => {
    const ids = suggestActions(data, wl(["MODIFICATION_CLUSTER", "RECENTLY_MODIFIED"]), ID, NAME).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
