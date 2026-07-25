import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { C360Data } from "./contract";
import { buildGroundedPrompt, CONTEXT_BUDGET, MAX_PROMPT, sanitize } from "./grounding";
import sample from "../../../artifact/sample-data.json";

const DATA = sample as unknown as C360Data;
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

describe("the figures still survive as prose", () => {
  const p = buildGroundedPrompt({
    data: DATA,
    bundle,
    accountName: "Piedmont Precision Components, Inc.",
    tab: "Covenants",
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

  it("says which tab the banker is on, and asks the question", () => {
    expect(p).toContain("Viewing the Covenants tab.");
    expect(p).toContain("How much DSC headroom is left?");
    expect(p).toMatch(/cite only these figures/);
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
