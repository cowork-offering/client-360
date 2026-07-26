import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, ReasonCode } from "../data/contract";
import { briefingText, buildBriefing } from "./briefing";
import { figureViolations } from "./drafts";
import { buildPanelSchema } from "./schemas";
import sample from "../../../artifact/sample-data.json";

const DATA = sample as unknown as C360Data;
const BUNDLES = Object.entries(DATA.borrowers ?? {});
const PANEL_ACTIONS = [
  "annual-review",
  "collateral-valuation",
  "create-service-request",
  "new-facility-request",
  "risk-rating-review",
  "covenant-review",
  "loan-modification",
  "renewal",
];
const REASONS: ReasonCode[] = ["COVENANT_BREACH", "MATURITY_NEAR"];

function build(actionId: string, accountId: string, bundle: BorrowerBundle) {
  const schema = buildPanelSchema(actionId, { bundle, accountId, accountName: bundle.snapshot?.name ?? "the relationship" });
  return { schema, briefing: buildBriefing(actionId, schema, bundle, bundle.snapshot?.name ?? "the relationship", REASONS) };
}

describe("the briefing composes over the schema, it does not replace it", () => {
  it("every field chip names a key the schema actually has", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of PANEL_ACTIONS) {
        const { schema, briefing } = build(actionId, id, b as BorrowerBundle);
        const keys = new Set(schema!.fields.map((f) => f.key));
        for (const seg of briefing!.lead) {
          if (seg.kind === "field") expect(keys.has(seg.fieldKey), `${actionId}: ${seg.fieldKey}`).toBe(true);
        }
        for (const key of briefing!.sections) expect(keys.has(key), `${actionId}: ${key}`).toBe(true);
      }
    }
  });

  it("chips only the fields the banker may edit", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of PANEL_ACTIONS) {
        const { schema, briefing } = build(actionId, id, b as BorrowerBundle);
        for (const seg of briefing!.lead) {
          if (seg.kind !== "field") continue;
          const field = schema!.fields.find((f) => f.key === seg.fieldKey)!;
          expect(field.editable, `${actionId}: ${seg.fieldKey}`).toBe(true);
        }
      }
    }
  });

  it("covers every required value the banker must supply", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of PANEL_ACTIONS) {
        const { schema, briefing } = build(actionId, id, b as BorrowerBundle);
        const chipped = new Set(briefing!.lead.flatMap((s) => (s.kind === "field" ? [s.fieldKey] : [])));
        const owed = schema!.fields.filter((f) => f.required && f.editable);
        for (const f of owed) {
          expect(chipped.has(f.key), `${actionId}: ${f.key} is required but never asked for in the briefing`).toBe(true);
        }
      }
    }
  });

  it("has no panel and no briefing for an action without a schema", () => {
    const [id, b] = BUNDLES[0];
    // Draft Credit Memo stays analysis-only: no schema, so no briefing.
    const schema = buildPanelSchema("draft-credit-memo", { bundle: b as BorrowerBundle, accountId: id, accountName: "x" });
    expect(schema).toBeNull();
    expect(buildBriefing("draft-credit-memo", schema, b as BorrowerBundle, "x")).toBeNull();
  });
});

describe("the briefing may no more invent a number than a draft", () => {
  it("every figure in the lead traces to staged data", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of PANEL_ACTIONS) {
        const { briefing } = build(actionId, id, b as BorrowerBundle);
        const violations = figureViolations(briefingText(briefing!), briefing!.figures);
        expect(violations, `${id} / ${actionId} invented: ${violations.join(", ")}`).toEqual([]);
      }
    }
  });

  it("uses no em dashes", () => {
    for (const [id, b] of BUNDLES) {
      for (const actionId of PANEL_ACTIONS) {
        const { briefing } = build(actionId, id, b as BorrowerBundle);
        expect(briefingText(briefing!)).not.toContain("—");
      }
    }
  });

  it("states plainly when nothing is staged rather than implying a position", () => {
    const bare: BorrowerBundle = { snapshot: { accountId: "001X", name: "Bare Co." } };
    const { briefing } = build("annual-review", "001X", bare);
    expect(briefingText(briefing!)).toContain("no committed exposure staged");
    expect(figureViolations(briefingText(briefing!), briefing!.figures)).toEqual([]);
  });

  it("names the reason the action is on the queue, from the derived worklist", () => {
    const [id, b] = BUNDLES[0];
    const { schema } = build("annual-review", id, b as BorrowerBundle);
    const withReason = buildBriefing("annual-review", schema, b as BorrowerBundle, "Acme", ["COVENANT_BREACH"]);
    const without = buildBriefing("annual-review", schema, b as BorrowerBundle, "Acme", []);
    expect(briefingText(withReason!)).toContain("at or past its threshold");
    expect(briefingText(without!)).not.toContain("It is on the queue because");
  });
});
