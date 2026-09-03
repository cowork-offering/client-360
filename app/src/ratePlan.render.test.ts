import { describe, expect, it, vi } from "vitest";
import { createModifyEngine } from "./workroom/modifyEngine";
import { workroomContextFor } from "./workroom/openWorkroom";
import type { BorrowerBundle, C360Data } from "./data/contract";
import type { WorkroomDelta } from "./workroom/types";
import live from "../../artifact/live-data.json";

/* =============================================================================
   THE RATE REACHES THE PLAN.

   FOUNDER, 2026-09-03, 12:15: staging record a8abb00001O2gwGAAR, twenty two
   steps, and NO rate anywhere in them. He had answered the rate ask by typing
   "Yes, 7.25% all-in", the card had shown 7.25%, and the $20M clone read 7.6 in
   the org afterwards.

   THIS HOLDS THE WIRE. The rate is one of the four SCALARS a modification has
   always filed (`requestedRate` on `LLC_BI__InterestRate__c`), so what it must
   never do is go missing between the card and the payload - beside the two
   pricing FIELDS, which travel on a different wire entirely, and beside a
   commitment change on the same facility.
   ============================================================================= */

const data = live as unknown as C360Data;
const accountId = "001bb00001I7FPNAA3";
const LINE = "a4Zbb0000027MaYEAU";

const STAGED = {
  stagingId: "a8abb00001O2gwGAAR",
  planHash: "hash",
  decisionToken: "token",
  summary: "",
  steps: [],
  warnings: [],
  suggestions: [],
};

function engineOn() {
  const bundle = JSON.parse(JSON.stringify(data.borrowers![accountId])) as BorrowerBundle;
  (bundle.exposure!.facilities as Array<Record<string, unknown>>)[0].interestRate = 7.6;
  const context = workroomContextFor({ mode: "modify", data, bundle, accountId, accountName: "Hartwell", productPackageId: "a5Fbb000000IHFJEA4" });
  const stage = vi.fn().mockResolvedValue({ ok: true, result: STAGED });
  const engine = createModifyEngine({
    context,
    data,
    bundle,
    deps: { stage, execute: vi.fn(), available: () => true, newKey: () => "k" } as never,
  });
  return { engine, context, stage };
}

describe("the rate is on the wire, beside the two pricing fields", () => {
  it("carries requestedRate 7.25 on the $15M line into the payload", async () => {
    const { engine, context, stage } = engineOn();
    const take = async (line: string): Promise<WorkroomDelta[]> => {
      const r = await engine.parseIntent(line, context);
      return r.kind === "deltas" ? r.deltas : [];
    };
    /* THE FOUR THE FOUNDER STAGED, each through the composer the room uses. */
    const amount = await take("increase the line of credit - $15,000,000.00 to $20,000,000");
    const rate = await take("move the line of credit - $15,000,000.00 rate to 7.25%");
    const amort = await take("on the line of credit - $15,000,000.00 set the amortisation term to 240 months");
    const date = await take("on the line of credit - $15,000,000.00 set the first payment date to 2026-10-01");

    /* THE ROOM STAGES ONE DELTA PER ANSWER, filtered exactly as `landPricing`
       filters it: a composed pricing sentence also matches the TERM scalar
       inside the fenced parser, and staging that would move a term nobody
       asked to move. */
    const deltas = [
      amount.find((d) => d.wire?.key === "requestedAmount")!,
      rate.find((d) => d.wire?.key === "requestedRate")!,
      amort.find((d) => d.fieldWire?.field === "LLC_BI__Amortized_Term_Months__c")!,
      date.find((d) => d.fieldWire?.field === "LLC_BI__First_Payment_Date__c")!,
    ];
    expect(deltas.every(Boolean)).toBe(true);

    await engine.stagePlan(deltas, context);
    const payload = stage.mock.calls[0][0] as Record<string, string | number | null>;

    /* THE RATE IS THERE, on whichever channel the routing chose. One facility
       and one figure per field is the flat channel; a mixed plan rides
       `scalarChangesJson`. Both are read, because the ROUTING is not what this
       test is about - the rate not going missing is. */
    const scalars = payload.scalarChangesJson
      ? (JSON.parse(String(payload.scalarChangesJson)) as Array<{ key: string; value: number; targetLoanId: string }>)
      : [];
    const rateOnWire =
      payload.requestedRate ?? scalars.find((s) => s.key === "requestedRate" && s.targetLoanId === LINE)?.value;
    expect(rateOnWire).toBe(7.25);

    // And the commitment beside it, which is the change he came in for.
    const amountOnWire =
      payload.requestedAmount ?? scalars.find((s) => s.key === "requestedAmount" && s.targetLoanId === LINE)?.value;
    expect(amountOnWire).toBe(20_000_000);

    // And the two FIELDS, on their own wire, aimed at the same facility.
    const fields = JSON.parse(String(payload.fieldChangesJson)) as Array<{ field: string; value: unknown; targetLoanId: string }>;
    expect(fields.find((f) => f.field === "LLC_BI__Amortized_Term_Months__c")).toMatchObject({
      value: 240,
      targetLoanId: LINE,
    });
    expect(fields.find((f) => f.field === "LLC_BI__First_Payment_Date__c")).toMatchObject({
      value: "2026-10-01",
      targetLoanId: LINE,
    });
    // THE RATE IS NOT A FIELD-WAVE FIELD, and must never be sent as one.
    expect(fields.some((f) => f.field === "LLC_BI__InterestRate__c")).toBe(false);
  });
});
