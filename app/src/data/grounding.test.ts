import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { C360Data } from "./contract";
import { buildGroundedPrompt, CONTEXT_BUDGET, MAX_PROMPT, sanitize } from "./grounding";
import sample from "../../../artifact/sample-data.json";
import live from "../../../artifact/live-data.json";

const DATA = sample as unknown as C360Data;
const LIVE = live as unknown as C360Data;
const ANCHOR = "001bb00001DLtRMAA1";
const STERLING = "001SAMPLE0000STRL";
const bundle = (DATA.borrowers ?? {})[ANCHOR];
const sterling = (DATA.borrowers ?? {})[STERLING];

/** The exact shapes the outbound-content guard reacts to. */
const FORBIDDEN = /[{}[\]|]/;
const RECORD_ID = /\b[A-Za-z0-9]{15,}\b/;

/** Every Explain prefill shipped in the tabs — the real Explain path inputs. */
function explainPrefills(): string[] {
  const dir = join(__dirname, "..", "components", "tabs");
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".tsx")) continue;
    const src = readFileSync(join(dir, f), "utf8");
    const m = src.match(/const EXPLAIN =\s*\n?\s*"([^"]+)"/);
    if (m) out.push(m[1]);
  }
  return out;
}

const cases = [
  {
    name: "chat, account view",
    args: { data: DATA, bundle, accountName: "Piedmont Precision Components, Inc.", tab: "Covenants", question: "How much DSC headroom is left?" },
  },
  {
    name: "chat, home/book view",
    args: { data: DATA, bundle: null, accountName: null, tab: null, question: "Which relationship needs attention first?" },
  },
  {
    name: "account with a client request",
    args: { data: DATA, bundle: sterling, accountName: "Sterling Fabrication Co.", tab: "Activity", question: "Can we support the increase?" },
  },
  {
    name: "unstaged account",
    args: { data: DATA, bundle: null, accountName: "Ghost Co.", tab: "Exposure & Collateral", question: "What is the exposure?" },
  },
];

describe("prompt shape contract (gateway-block fix)", () => {
  for (const c of cases) {
    it(`${c.name}: prose only, no ids, within cap`, () => {
      const p = buildGroundedPrompt(c.args);
      expect(p, "no structured punctuation").not.toMatch(FORBIDDEN);
      expect(p, "no record ids").not.toMatch(RECORD_ID);
      expect(p, "no newlines").not.toContain("\n");
      expect(p.length, `length ${p.length}`).toBeLessThanOrEqual(MAX_PROMPT);
    });
  }

  it("every shipped Explain prefill also produces a compliant prompt", () => {
    const prefills = explainPrefills();
    expect(prefills.length).toBeGreaterThanOrEqual(6); // all tabs covered
    for (const question of prefills) {
      for (const b of [bundle, sterling]) {
        const p = buildGroundedPrompt({
          data: DATA,
          bundle: b,
          accountName: "Piedmont Precision Components, Inc.",
          tab: "Covenants",
          question,
        });
        expect(p, question).not.toMatch(FORBIDDEN);
        expect(p, question).not.toMatch(RECORD_ID);
        expect(p.length, `${question} -> ${p.length}`).toBeLessThanOrEqual(MAX_PROMPT);
      }
    }
  });

  it("keeps the context block itself within its own cap", () => {
    for (const c of cases) {
      const p = buildGroundedPrompt(c.args);
      const context = p.replace(c.args.question, "").trim();
      expect(context.length).toBeLessThanOrEqual(CONTEXT_BUDGET + 80); // + instruction
    }
  });

  it("survives a hostile question without leaking its shape", () => {
    const p = buildGroundedPrompt({
      data: DATA,
      bundle,
      accountName: "Piedmont Precision Components, Inc.",
      tab: "Covenants",
      question: 'Here is a dump: {"accountId":"001bb00001DLtRMAA1","rows":[1,2,3]} | explain',
    });
    expect(p).not.toMatch(FORBIDDEN);
    expect(p).not.toMatch(RECORD_ID);
    expect(p).not.toContain("001bb00001DLtRMAA1");
  });
});

/** Every account tab the workspace can be on. */
const TABS = [
  "Activity",
  "Exposure & Collateral",
  "Covenants",
  "Relationship Graph",
  "Opportunities",
  "Structural Signals",
  "Financials",
];

describe("tab-aware context (round 2)", () => {
  it("holds the shape contract on EVERY tab, for both staged accounts", () => {
    for (const tab of TABS) {
      for (const [name, b] of [["Piedmont Precision Components, Inc.", bundle], ["Sterling Fabrication Co.", sterling]] as const) {
        for (const question of explainPrefills()) {
          const p = buildGroundedPrompt({ data: DATA, bundle: b, accountName: name, tab, question });
          expect(p, `${tab} / ${name}`).not.toMatch(FORBIDDEN);
          expect(p, `${tab} / ${name}`).not.toMatch(RECORD_ID);
          expect(p).not.toContain("\n");
          expect(p.length, `${tab} / ${name} -> ${p.length}`).toBeLessThanOrEqual(MAX_PROMPT);
        }
      }
    }
  });

  it("Covenants tab carries the two tightest covenants with thresholds and next test", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Covenants", question: "q" });
    expect(p).toMatch(/DSCR \d+\.\d+x against a \d+\.\d+x floor/);
    expect(p).toMatch(/next test \w+ \d+, \d{4}/);
    // Two covenants, not a dump of all four.
    expect((p.match(/against a/g) ?? []).length).toBe(2);
  });

  it("Exposure tab carries the facility list, and no coverage the read did not compute", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Exposure & Collateral", question: "q" });
    expect(p).toMatch(/\d+ active facilities/);
    expect(p).toMatch(/drawn/);
    // This bundle predates the relationship coverage members. Nothing is put in
    // their place: a sum over the facility rows would ground the model in the
    // double count, stated as fact.
    expect(p).not.toMatch(/coverage \d+\.\d+x/);
    expect(p).not.toMatch(/against a .* floor/); // covenant sentence replaced
  });

  it("Exposure tab grounds on the ORG's coverage where the read carries it", () => {
    const hartwell = (LIVE.borrowers ?? {})["001bb00001I7FPNAA3"];
    const p = buildGroundedPrompt({ data: LIVE, bundle: hartwell, accountName: "Hartwell", tab: "Exposure & Collateral", question: "q" });
    // The org grew a second package (2026-09-03): nine facilities now, wider
    // pledged collateral behind them, and a third under-covered facility.
    expect(p).toContain("Collateral: lendable $42.37M");
    expect(p).toContain("coverage 1.09x");
    // The facility-level truth the relationship ratio hides.
    expect(p).toContain("3 facilities under-covered");
  });

  it("Financials tab carries EBITDA, leverage and interest coverage", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Financials", question: "q" });
    expect(p).toMatch(/EBITDA \$[\d.]+M/);
    expect(p).toMatch(/leverage \d+\.\d+x/);
    expect(p).toMatch(/interest coverage \d+\.\d+x/);
  });

  it("Activity tab carries the open client request ask", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle: sterling, accountName: "Sterling Fabrication Co.", tab: "Activity", question: "q" });
    expect(p).toMatch(/Open client request: facility increase from \$[\d.]+M to \$[\d.]+M/);
  });

  it("Relationship Graph tab carries owners and guarantors", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Relationship Graph", question: "q" });
    expect(p).toMatch(/Owners: .+ \d+ percent/);
    expect(p).toMatch(/guarantor/);
  });

  it("Opportunities tab carries the open opportunity", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Opportunities", question: "q" });
    expect(p).toMatch(/Open opportunity: .+\$[\d.]+M/);
  });

  it("Structural Signals tab carries the nearest maturity", () => {
    const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Structural Signals", question: "q" });
    expect(p).toMatch(/nearest maturity in \d+ days/);
  });

  it("keeps the identity lead sentence on every tab", () => {
    for (const tab of TABS) {
      const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont Precision Components, Inc.", tab, question: "q" });
      expect(p, tab).toContain("Piedmont Precision Components, Inc., Grade 5");
      expect(p, tab).toContain("committed");
    }
  });

  it("says nothing extra when a tab's data is not staged", () => {
    const bare = { snapshot: { accountId: "X", name: "Bare Co.", primaryRiskRating: "4" } };
    for (const tab of TABS) {
      const p = buildGroundedPrompt({ data: DATA, bundle: bare as never, accountName: "Bare Co.", tab, question: "q" });
      expect(p, tab).toContain("Bare Co., Grade 4.");
      expect(p, tab).toContain(`Viewing the ${tab} tab.`);
      expect(p, tab).not.toMatch(/against a|EBITDA|Owners:|Open opportunity|Signals:/);
    }
  });
});

describe("pre-computed cushions (no unit maths for the model)", () => {
  const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Covenants", question: "q" });

  it("gives the cushion in BOTH the ratio and percent forms", () => {
    expect(p).toMatch(/cushion \d+\.\d+x or about \d+ percent/);
  });

  it("never emits bps or a bare percent sign the model could misread", () => {
    expect(p).not.toMatch(/\bbps\b/);
    expect(p).not.toContain("%");
  });

  it("states a breach as a breach, not a negative cushion", () => {
    const b = JSON.parse(JSON.stringify(bundle));
    b.covenants.covenants = [{ covenantType: "Debt Service Coverage Ratio", actualValue: 1.1, thresholdValue: 1.25, breached: true }];
    const q = buildGroundedPrompt({ data: DATA, bundle: b, accountName: "X", tab: "Covenants", question: "q" });
    expect(q).toMatch(/breached by \d+\.\d+x/);
    expect(q).not.toMatch(/cushion -/);
  });
});

/* The model is handed the same distinction the screen makes. Prose that calls an
   administrative Exception a breach is the same defect as a red chip, arriving
   through the connector instead of the DOM. */
describe("Exception semantics survive into the grounded prompt", () => {
  const withCovs = (covenants: unknown[]) => {
    const b = JSON.parse(JSON.stringify(bundle));
    b.covenants.covenants = covenants;
    return buildGroundedPrompt({ data: DATA, bundle: b, accountName: "X", tab: "Covenants", question: "q" });
  };

  it("counts an unmeasured Exception instead of dropping it, and never calls it a breach", () => {
    const q = withCovs([{ covenantType: "Term Covenants", lastEvaluationStatus: "Exception" }]);
    expect(q).toContain("1 covenant sits at Exception in nCino with no measured breach");
    expect(q).not.toMatch(/breached by/);
  });

  it("names the Exception alongside a covenant that does have figures", () => {
    const q = withCovs([
      { covenantType: "Debt Service Coverage Ratio", actualValue: 1.4, thresholdValue: 1.25 },
      { covenantType: "Term Covenants", lastEvaluationStatus: "Exception" },
      { covenantType: "Reporting", covenantStatus: "overdue" },
    ]);
    expect(q).toMatch(/cushion \d+\.\d+x or about \d+ percent/);
    expect(q).toContain("2 covenants sit at Exception in nCino with no measured breach");
  });

  it("says a waived covenant is past its threshold WITHOUT calling it breached", () => {
    const q = withCovs([
      { covenantType: "Debt Service Coverage Ratio", actualValue: 1.1, thresholdValue: 1.25, lastEvaluationStatus: "Waived" },
    ]);
    expect(q).toMatch(/past the threshold, recorded in nCino as Waived/);
    expect(q).not.toMatch(/breached by/);
  });
});

describe("no-inference instruction", () => {
  const p = buildGroundedPrompt({ data: DATA, bundle, accountName: "Piedmont", tab: "Covenants", question: "q" });

  it("forbids inference and estimation outright", () => {
    expect(p).toMatch(/Never infer or estimate/);
    expect(p).toMatch(/Use only these figures/);
  });

  it("gives the model the safe alternative — name the tab that holds it", () => {
    expect(p).toMatch(/not staged and name the tab that holds it/);
  });
});

describe("the figures still survive as prose", () => {
  const p = buildGroundedPrompt({
    data: DATA,
    bundle,
    accountName: "Piedmont Precision Components, Inc.",
    tab: null,
    question: "How much DSC headroom is left?",
  });

  it("names the account and its grade", () => {
    expect(p).toContain("Piedmont Precision Components, Inc.");
    expect(p).toMatch(/Grade \d/);
  });

  it("carries committed and drawn exposure", () => {
    expect(p).toContain("committed");
    expect(p).toContain("drawn");
    expect(p).toMatch(/\$\d/);
  });

  it("carries the tightest covenant as a sentence, not a list", () => {
    expect(p).toMatch(/DSCR \d+\.\d+x against a \d+\.\d+x floor/);
  });

  it("carries leverage and EBITDA when Boom data is staged", () => {
    expect(p).toMatch(/leverage \d+\.\d+x/);
    expect(p).toMatch(/EBITDA/);
  });

  it("asks the question and carries the instruction", () => {
    expect(p).toContain("How much DSC headroom is left?");
    expect(p).toMatch(/Use only these figures/);
  });

  it("says which tab the banker is on when there is one", () => {
    const q = buildGroundedPrompt({ data: DATA, bundle, accountName: "X", tab: "Covenants", question: "y" });
    expect(q).toContain("Viewing the Covenants tab.");
  });

  it("reads as sentences — no field:value pairs", () => {
    expect(p).not.toMatch(/\b\w+:\s*\$/); // "Committed: $12.5M"
    expect(p).not.toContain(" - ");
  });

  it("degrades honestly with no staged bundle", () => {
    const q = buildGroundedPrompt({ data: DATA, bundle: null, accountName: "Ghost Co.", tab: null, question: "x" });
    expect(q).toContain("no staged detail");
  });

  it("book view carries the book totals as prose", () => {
    const q = buildGroundedPrompt({ data: DATA, bundle: null, accountName: null, tab: null, question: "x" });
    expect(q).toMatch(/Book of \d+ relationships/);
    expect(q).toMatch(/\$\d/);
  });

  it("excludes closed facilities from the live picture", () => {
    const b = JSON.parse(JSON.stringify(bundle));
    b.covenants = { covenants: [] };
    b.exposure.facilities = [
      { loanId: "L1", name: "Closed", status: "Paid Off" },
      { loanId: "L2", name: "Live" },
    ];
    const q = buildGroundedPrompt({ data: DATA, bundle: b, accountName: "X", tab: null, question: "x" });
    expect(q).toContain("1 active facility");
  });
});

describe("sanitize", () => {
  it("strips structured punctuation, ids and newlines", () => {
    const out = sanitize("a {b} [c] d|e 001bb00001DLtRMAA1\nf");
    expect(out).not.toMatch(FORBIDDEN);
    expect(out).not.toMatch(RECORD_ID);
    expect(out).not.toContain("\n");
    expect(out).toContain("a");
  });

  it("leaves ordinary banker prose intact", () => {
    const s = "DSCR 1.42x against a 1.25x floor; leverage 3.85x on $5.2M EBITDA.";
    expect(sanitize(s)).toBe(s);
  });
});
