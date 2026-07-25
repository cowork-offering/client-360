import { describe, expect, it } from "vitest";
import type { C360Data } from "./contract";
import { buildGroundedPrompt, CONTEXT_BUDGET } from "./grounding";
import sample from "../../../artifact/sample-data.json";

const DATA = sample as unknown as C360Data;
const ANCHOR = "001bb00001DLtRMAA1";
const bundle = (DATA.borrowers ?? {})[ANCHOR];

describe("buildGroundedPrompt", () => {
  it("grounds the answer in the staged figures and forbids estimation", () => {
    const p = buildGroundedPrompt({
      data: DATA,
      bundle,
      accountName: "Piedmont Precision Components, Inc.",
      tab: "Covenants",
      question: "How much DSC headroom is left?",
    });
    expect(p).toContain("Piedmont Precision Components, Inc.");
    expect(p).toContain("QUESTION: How much DSC headroom is left?");
    expect(p).toMatch(/cite only the figures provided/i);
    expect(p).toMatch(/say so plainly rather than estimating/i);
  });

  it("includes the covenant detail a credit question needs", () => {
    const p = buildGroundedPrompt({
      data: DATA,
      bundle,
      accountName: "Piedmont Precision Components, Inc.",
      tab: "Covenants",
      question: "q",
    });
    expect(p).toContain("Debt Service Coverage Ratio");
    expect(p).toMatch(/cushion/i);
    expect(p).toContain("Committed");
  });

  it("tells the model which tab the banker is on", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "X", tab: "Exposure & Collateral", question: "q" });
    expect(p).toContain('"Exposure & Collateral" tab');
  });

  it("falls back to book context on the home view", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle: null, accountName: null, tab: null, question: "q" });
    expect(p).toMatch(/Book: \d+ relationships/);
    expect(p).toContain("Piedmont Precision"); // top accounts listed
  });

  it("keeps the context block within budget even for a rich bundle", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "X", tab: "Covenants", question: "q" });
    const context = p.split("CONTEXT (the only figures you may cite):")[1].split("QUESTION:")[0];
    expect(context.length).toBeLessThanOrEqual(CONTEXT_BUDGET + 200);
  });

  it("degrades honestly when the account has no staged bundle", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle: null, accountName: "Ghost Co.", tab: null, question: "q" });
    expect(p).toContain("no staged detail for this relationship");
  });

  it("never leaks closed facilities into the live exposure context", () => {
    const b = JSON.parse(JSON.stringify(bundle));
    b.exposure.facilities = [
      { loanId: "L1", name: "Closed Term Loan", status: "Paid Off", committed: 1 },
      { loanId: "L2", name: "Live Revolver", committed: 2 },
    ];
    const p = buildGroundedPrompt({ data: DATA, bundle: b, accountName: "X", tab: null, question: "q" });
    expect(p).toContain("Live Revolver");
    expect(p).not.toContain("Closed Term Loan");
  });
});
