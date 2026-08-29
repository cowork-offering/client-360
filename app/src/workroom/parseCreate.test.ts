import { describe, expect, it } from "vitest";
import { createField, CREATE_PRODUCTS, parseCreate, parseCreateAnswer } from "./parseCreate";

/* =============================================================================
   THE CREATION PARSER.

   What is proved here is that the room composes a facility out of a banker's
   own sentence and refuses to invent the parts they did not say. Two refusals
   carry the weight: a bare number is never money, and a product the Commercial
   Loan record type does not offer is named back with the six that it does —
   before the round trip, in the same words the tool would have used.
   ============================================================================= */

const ctx = {
  household: [
    { name: "Hartwell Precision Manufacturing LLC", role: "Borrower" },
    { name: "Hartwell Logistics LLC", role: "Subsidiary · 100%" },
  ],
  relationship: "Hartwell Precision Manufacturing LLC",
};

function values(text: string) {
  const out = parseCreate(text, ctx);
  if (out.kind !== "values") throw new Error(`${text} → ${out.kind}: ${out.kind === "clarify" ? out.question : ""}`);
  return new Map(out.values.map((v) => [v.field.id, v]));
}

describe("parseCreate reads a facility out of one sentence", () => {
  it("takes the product, the amount and the term together", () => {
    const v = values("add a $5MM equipment facility over 60 months");
    expect(v.get("create.product")!.value).toEqual({ kind: "text", text: "Equipment" });
    expect(v.get("create.amount")!.value).toEqual({ kind: "currency", amount: 5_000_000, text: "$5mm" });
    expect(v.get("create.termMonths")!.value).toEqual({ kind: "months", months: 60, text: "60 months" });
  });

  it("resolves a banker nickname onto the org's own value", () => {
    expect(values("open a revolver for them").get("create.product")!.value).toEqual({ kind: "text", text: "Line of Credit" });
    // Longest alias wins, so "line of credit" never resolves through "line".
    expect(values("a new line of credit").get("create.product")!.value).toEqual({ kind: "text", text: "Line of Credit" });
  });

  it("reads years as months, the way the org holds the term", () => {
    expect(values("a 5-year equipment loan").get("create.termMonths")!.value).toEqual({ kind: "months", months: 60, text: "5-year" });
  });

  it("names the six the record type offers when the banker asks for a seventh", () => {
    const out = parseCreate("set up a term loan", ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    // The tool's own fact: the API would accept `Term` and store it, and nCino
    // would then render it wrong. Better to refuse here than to round-trip.
    expect(out.question).toContain("not offered by the Commercial Loan record type");
    for (const p of CREATE_PRODUCTS) expect(out.question).toContain(p);
    expect(out.awaiting?.id).toBe("create.product");
  });

  it("refuses a bare number rather than deciding what it means", () => {
    const out = parseCreate("make it 20", ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toMatch(/magnitude/i);
  });

  it("reads a purpose only where the banker introduced one", () => {
    expect(values("an equipment line for the tooling ramp").get("create.purpose")!.value).toEqual({
      kind: "text",
      text: "tooling ramp",
    });
    // "for 60 months" is a term, and reading it as a purpose would file the
    // word "60 months" onto the Loan Detail.
    expect(values("an equipment line for 60 months").has("create.purpose")).toBe(false);
  });

  it("stages a second entity as a structure entry, and the relationship itself as nothing", () => {
    const v = values("add Hartwell Logistics LLC as a guarantor");
    const party = v.get("create.party")!;
    expect(party.party).toEqual({ name: "Hartwell Logistics LLC", role: "Guarantor" });
    expect(party.field.wireKey).toBeUndefined();

    // The tool files the borrower row itself, at 100 percent. Naming the
    // relationship is not a second involvement row and must not stage as one.
    const out = parseCreate("Hartwell Precision Manufacturing LLC is the borrower", ctx);
    expect(out.kind).toBe("none");
  });

  it("will not turn free text into an involvement row", () => {
    // An involvement row points at an Account. An account this cockpit cannot
    // find is one it must not claim to have read.
    expect(parseCreate("add Northwind Tooling as a guarantor", ctx).kind).toBe("none");
  });

  it("says nothing about a line that names nothing", () => {
    expect(parseCreate("thanks, that all looks right", ctx).kind).toBe("none");
  });
});

describe("parseCreateAnswer completes the room's own question", () => {
  it("takes a one-word product answer", () => {
    const out = parseCreateAnswer(createField("create.product")!, "Equipment")!;
    expect(out.kind).toBe("values");
    if (out.kind !== "values") return;
    expect(out.values[0].value).toEqual({ kind: "text", text: "Equipment" });
  });

  it("asks again rather than guessing an unreadable product", () => {
    const out = parseCreateAnswer(createField("create.product")!, "something flexible")!;
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toContain("Line of Credit");
  });

  it("takes a bare figure as the amount, and only with its magnitude", () => {
    const ok = parseCreateAnswer(createField("create.amount")!, "$5,000,000")!;
    expect(ok.kind).toBe("values");
    if (ok.kind !== "values") return;
    expect(ok.values[0].value).toEqual({ kind: "currency", amount: 5_000_000, text: "$5,000,000" });

    const bare = parseCreateAnswer(createField("create.amount")!, "5")!;
    expect(bare.kind).toBe("clarify");
  });

  it("takes the whole line as the purpose, because the room asked for nothing else", () => {
    const out = parseCreateAnswer(createField("create.purpose")!, "equipment")!;
    expect(out.kind).toBe("values");
    if (out.kind !== "values") return;
    expect(out.values[0].value).toEqual({ kind: "text", text: "equipment" });
  });
});
