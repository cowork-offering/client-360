import { describe, expect, it } from "vitest";
import { mailTipFrom, overdueCovenantTip } from "./tips";
import type { BorrowerBundle, C360Data, Covenant } from "../../data/contract";
import live from "../../../../artifact/live-data.json";

/* =============================================================================
   THE TWO TIERS, AND THE STATES THAT MUST RENDER NOTHING.

   Half of what is asserted here is silence. "No channel, no signal, an error:
   NOTHING renders" is the founder's own wording, and a tier that quietly
   degrades to a placeholder is the failure this file exists to catch.
   ============================================================================= */

const TODAY = "2026-08-31T09:00:00Z";

const cov = (over: Partial<Covenant>): Covenant => ({ covenantType: "DSC", ...over });
const bundleWith = (covenants: Covenant[]): BorrowerBundle =>
  ({ snapshot: {}, covenants: { covenants } }) as unknown as BorrowerBundle;

describe("the overdue covenant tier", () => {
  it("says how late the most overdue test is, in the founder's own phrasing", () => {
    const tip = overdueCovenantTip({
      bundle: bundleWith([cov({ covenantType: "DSC", nextEvaluationDate: "2026-08-25" })]),
      today: TODAY,
    })!;
    expect(tip.line).toBe("The DSC test is 6 days overdue.");
    expect(tip.chip.label.length).toBeGreaterThan(0);
  });

  it("says 1 day rather than 1 days", () => {
    const tip = overdueCovenantTip({
      bundle: bundleWith([cov({ nextEvaluationDate: "2026-08-30" })]),
      today: TODAY,
    })!;
    expect(tip.line).toContain("1 day overdue");
  });

  it("leads on the MOST overdue of several", () => {
    const tip = overdueCovenantTip({
      bundle: bundleWith([
        cov({ covenantType: "DSC", nextEvaluationDate: "2026-08-25" }),
        cov({ covenantType: "Leverage", nextEvaluationDate: "2026-07-01" }),
      ]),
      today: TODAY,
    })!;
    expect(tip.line).toContain("Leverage");
  });

  it("never reports a WAIVED test as overdue", () => {
    // A waiver is a decision not to enforce, and it outranks the arithmetic.
    expect(
      overdueCovenantTip({
        bundle: bundleWith([cov({ nextEvaluationDate: "2026-08-01", latestComplianceStatus: "Waived" })]),
        today: TODAY,
      }),
    ).toBeNull();
  });

  it("renders NOTHING where nothing is overdue", () => {
    expect(
      overdueCovenantTip({ bundle: bundleWith([cov({ nextEvaluationDate: "2026-12-01" })]), today: TODAY }),
    ).toBeNull();
    expect(overdueCovenantTip({ bundle: bundleWith([cov({})]), today: TODAY })).toBeNull();
    expect(overdueCovenantTip({ bundle: null, today: TODAY })).toBeNull();
  });

  it("renders NOTHING without the artifact's own clock, rather than reaching for one", () => {
    expect(
      overdueCovenantTip({ bundle: bundleWith([cov({ nextEvaluationDate: "2026-08-25" })]), today: "" }),
    ).toBeNull();
  });

  it("holds on every staged relationship: a tip or nothing, never a broken line", () => {
    const data = live as unknown as C360Data;
    const today = data.meta!.generatedAt;
    for (const bundle of Object.values(data.borrowers ?? {})) {
      const tip = overdueCovenantTip({ bundle: bundle as BorrowerBundle, today });
      if (!tip) continue;
      expect(tip.line).toMatch(/^The .+ is \d+ days? overdue\.$/);
      expect(tip.line).not.toContain("—");
    }
  });
});

describe("the client mail tier", () => {
  const accountName = "Hartwell Precision Manufacturing LLC";

  it("says the count and the age of the oldest, in the founder's own phrasing", () => {
    const tip = mailTipFrom({
      hits: [
        { subject: "Hartwell facility question", receivedAt: "2026-08-25T09:00:00Z" },
        { subject: "Re: Hartwell covenant pack", receivedAt: "2026-08-29T09:00:00Z" },
      ],
      accountName,
      today: TODAY,
    })!;
    expect(tip.line).toBe("2 emails from Hartwell await a reply, oldest 6 days.");
    expect(tip.chip.label).toBe("Open the thread");
  });

  it("says one email awaits, not one emails await", () => {
    const tip = mailTipFrom({
      hits: [{ subject: "Hartwell", receivedAt: "2026-08-30T09:00:00Z" }],
      accountName,
      today: TODAY,
    })!;
    expect(tip.line).toBe("1 email from Hartwell awaits a reply, oldest 1 day.");
  });

  it("renders NOTHING when nothing matched the relationship", () => {
    // The generic-word rule: "precision components" belongs to nobody, and a
    // line about mail that is not this client's is worse than no line.
    expect(
      mailTipFrom({ hits: [{ subject: "precision components pricing", receivedAt: TODAY }], accountName, today: TODAY }),
    ).toBeNull();
  });

  it("renders NOTHING on an empty mailbox, an unreadable date, or a stale message", () => {
    expect(mailTipFrom({ hits: [], accountName, today: TODAY })).toBeNull();
    expect(mailTipFrom({ hits: [{ subject: "Hartwell" }], accountName, today: TODAY })).toBeNull();
    expect(
      mailTipFrom({ hits: [{ subject: "Hartwell", receivedAt: "2025-01-01T09:00:00Z" }], accountName, today: TODAY }),
    ).toBeNull();
  });

  it("renders NOTHING without the artifact's own clock", () => {
    expect(mailTipFrom({ hits: [{ subject: "Hartwell", receivedAt: TODAY }], accountName, today: "" })).toBeNull();
  });

  it("says a message NEWER than the book landed after the read, not an impossible age", () => {
    /* THE BOOK'S CLOCK IS NOT THE WORLD'S CLOCK. The one real Hartwell mail in
       the founder's mailbox is dated a day after `meta.generatedAt`, and the
       old `d <= 0` filter threw it away, which is how this tier came to render
       nothing at all for the only message it had. */
    const tip = mailTipFrom({
      hits: [{ subject: "Hartwell", receivedAt: "2026-09-01T09:00:00Z" }],
      accountName,
      today: TODAY,
    })!;
    expect(tip).not.toBeNull();
    expect(tip.line).toContain("received after this book was read");
    expect(tip.line).not.toMatch(/-\d+ days|oldest 0 days/);
  });

  it("never fabricates: the chip ASKS the desk, it does not answer for it", () => {
    const tip = mailTipFrom({
      hits: [{ subject: "Hartwell", receivedAt: "2026-08-29T09:00:00Z" }],
      accountName,
      today: TODAY,
    })!;
    // The instruction names the relationship and asks; it states nothing about
    // what the correspondence says.
    expect(tip.chip.say).toContain(accountName);
    expect(tip.chip.say).toMatch(/^Summarise/);
  });
});
