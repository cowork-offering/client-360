import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data, ReasonCode } from "../data/contract";
import { draftFigureViolations, draftForAction, extractFigures, type Draft } from "./drafts";
import sample from "../../../artifact/sample-data.json";

const DATA = sample as unknown as C360Data;
const BUNDLES = Object.entries(DATA.borrowers ?? {});

const ALL_REASONS: ReasonCode[] = [
  "CLIENT_REQUEST",
  "COVENANT_BREACH",
  "COVENANT_DUE",
  "MATURITY_NEAR",
  "MODIFICATION_CLUSTER",
  "GUARANTOR_SIGNAL",
  "RECENTLY_MODIFIED",
];

const ACTIONS = ["annual-review", "collateral-valuation", "create-service-request"];

/** Resolve a registered path against the bundle, tolerating [] array hops. */
function pathResolves(bundle: BorrowerBundle, path: string): boolean {
  const parts = path.replace(/^borrower\./, "").split(".");
  let nodes: unknown[] = [bundle];
  for (const raw of parts) {
    const key = raw.replace(/\[\]$/, "");
    const isArray = raw.endsWith("[]");
    const next: unknown[] = [];
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const v = (n as Record<string, unknown>)[key];
      if (v === undefined) continue;
      if (isArray && Array.isArray(v)) next.push(...v);
      else next.push(v);
    }
    if (!next.length) return false;
    nodes = next;
  }
  return true;
}

describe("THE HARD RULE — a drafted narrative may never invent a number", () => {
  it("every figure in every draft, for every staged account, is registered", () => {
    for (const [id, bundle] of BUNDLES) {
      for (const actionId of ACTIONS) {
        const drafts = draftForAction(actionId, bundle as BorrowerBundle, ALL_REASONS);
        for (const [field, draft] of Object.entries(drafts)) {
          const violations = draftFigureViolations(draft);
          expect(violations, `${id} / ${actionId} / ${field} invented: ${violations.join(", ")}`).toEqual([]);
        }
      }
    }
  });

  it("every registered figure traces to a path that resolves on the bundle", () => {
    for (const [id, bundle] of BUNDLES) {
      for (const actionId of ACTIONS) {
        const drafts = draftForAction(actionId, bundle as BorrowerBundle, ALL_REASONS);
        for (const [field, draft] of Object.entries(drafts)) {
          for (const fig of draft.figures) {
            expect(pathResolves(bundle as BorrowerBundle, fig.path), `${id}/${actionId}/${field}: ${fig.path} does not resolve`).toBe(true);
          }
        }
      }
    }
  });

  it("every registered figure actually appears in its own prose", () => {
    for (const [, bundle] of BUNDLES) {
      for (const actionId of ACTIONS) {
        for (const [field, draft] of Object.entries(draftForAction(actionId, bundle as BorrowerBundle, ALL_REASONS))) {
          for (const fig of draft.figures) {
            // A registered figure that never renders would let a real invented
            // one hide behind it.
            expect(draft.text.includes(fig.rendered) || draft.text === "", `${field}: ${fig.rendered} registered but absent`).toBe(true);
          }
        }
      }
    }
  });

  it("catches an invented figure when one is planted", () => {
    const planted: Draft = { text: "Leverage stands at 9.99x on $42.00M of EBITDA.", figures: [] };
    expect(draftFigureViolations(planted).sort()).toEqual(["$42.00M", "9.99x"]);
  });

  it("extractFigures finds money, ratio and percent tokens", () => {
    expect(extractFigures("$12.5M at 1.42x with 94 percent utilisation").sort()).toEqual(["$12.5M", "1.42x", "94 percent"]);
  });

  it("percent derivations declare how they were computed", () => {
    for (const [, bundle] of BUNDLES) {
      for (const [, draft] of Object.entries(draftForAction("annual-review", bundle as BorrowerBundle, ALL_REASONS))) {
        for (const fig of draft.figures) {
          if (fig.rendered.endsWith("percent")) expect(fig.derivation, fig.rendered).toBeTruthy();
        }
      }
    }
  });
});

describe("drafts are deterministic and honest about absence", () => {
  it("produces identical output for identical input", () => {
    const [, bundle] = BUNDLES[0];
    const a = JSON.stringify(draftForAction("annual-review", bundle as BorrowerBundle, ALL_REASONS));
    const b = JSON.stringify(draftForAction("annual-review", bundle as BorrowerBundle, ALL_REASONS));
    expect(a).toBe(b);
  });

  it("states absence plainly rather than fabricating a position", () => {
    const bare: BorrowerBundle = { snapshot: { accountId: "001X", name: "Bare Co." } };
    const d = draftForAction("annual-review", bare, []);
    expect(d.collateralAnalysis.text).toMatch(/No collateral is pledged/);
    expect(d.financialAnalysis.text).toMatch(/No spread financials are staged/);
    expect(d.guarantor.text).toMatch(/No guarantor is recorded/);
    expect(d.riskRatingComments.text).toMatch(/No risk rating is on file/);
    for (const draft of Object.values(d)) expect(draftFigureViolations(draft)).toEqual([]);
  });

  it("drafts nothing for an unstaged relationship", () => {
    expect(draftForAction("annual-review", null, [])).toEqual({});
  });

  it("only drafts for actions that have a panel", () => {
    const [, bundle] = BUNDLES[0];
    expect(draftForAction("generate-spreading", bundle as BorrowerBundle, [])).toEqual({});
    expect(draftForAction("renewal", bundle as BorrowerBundle, [])).toEqual({});
  });
});

describe("drafts are seeded by the reason the action is on the queue", () => {
  const [, bundle] = BUNDLES[0];

  it("names the client request when that is the driver", () => {
    const d = draftForAction("annual-review", bundle as BorrowerBundle, ["CLIENT_REQUEST"]);
    expect(d.recommendation.text).toMatch(/inbound client request/);
  });

  it("names the covenant position when that is the driver", () => {
    const d = draftForAction("annual-review", bundle as BorrowerBundle, ["COVENANT_BREACH"]);
    expect(d.recommendation.text).toMatch(/at or past its threshold/);
  });

  it("uses no approval vocabulary", () => {
    const d = draftForAction("annual-review", bundle as BorrowerBundle, ALL_REASONS);
    for (const [field, draft] of Object.entries(d)) {
      // "Credit Decisioning" is an nCino stage name and stays legible; what may
      // never appear is language that reads as a decision this panel made.
      expect(draft.text.toLowerCase(), field).not.toMatch(/\bapprov|\bcredit decisions?\b|\bwe recommend approval\b|\bsigned? off\b/);
    }
  });

  it("uses no em dashes in drafted copy", () => {
    for (const [, b] of BUNDLES) {
      for (const actionId of ACTIONS) {
        for (const [field, draft] of Object.entries(draftForAction(actionId, b as BorrowerBundle, ALL_REASONS))) {
          expect(draft.text, field).not.toContain("—");
        }
      }
    }
  });
});

describe("the service request draft restates the client, never embellishes", () => {
  it("uses the client's own summary verbatim when one is staged", () => {
    const sterling = (DATA.borrowers ?? {})["001SAMPLE0000STRL"] as BorrowerBundle;
    const d = draftForAction("create-service-request", sterling, []);
    const staged = sterling.requests?.[0]?.summary;
    if (staged) expect(d.subject.text).toBe(staged);
  });

  it("drafts nothing when no request is staged", () => {
    const bare: BorrowerBundle = { snapshot: { accountId: "001X" } };
    expect(draftForAction("create-service-request", bare, [])).toEqual({});
  });
});
