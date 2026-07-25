import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVENANCE, type ProvenanceKind } from "./contract";

const VALID_KINDS: ProvenanceKind[] = ["NCINO", "BOOM", "AGENT", "DERIVED", "PENDING", "GAP"];
const COMPONENTS = join(__dirname, "..", "components");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Leaf field names that components read off a bundle/portfolio object. Anything
 *  a component consumes must be traceable in PROVENANCE — this is the automated
 *  half of the F2 audit (the map's `source` strings carry the detail). */
function consumedLeaves(): Set<string> {
  const roots = /\b(?:bundle|snap|exp|sig|graph|boom|spread|ratios|pf|data\.portfolio|data\.meta|data\.aiPanel)\??\.([A-Za-z_][A-Za-z0-9_]*)/g;
  const leaves = new Set<string>();
  for (const f of sourceFiles(COMPONENTS)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(roots)) leaves.add(m[1]);
  }
  return leaves;
}

/** Field names that are structural/JS, not data fields needing provenance. */
const NON_DATA = new Set([
  "map", "filter", "length", "flatMap", "find", "slice", "sort", "join", "some", "every",
  "accounts", "signals", "snapshot", "exposure", "covenants", "opportunities", "graph",
  "boom", "ratios", "spread", "meta", "portfolio", "borrowers", "borrower", "aiPanel",
  "threads", "messages", "facilities", "collateral", "connections", "legalEntities",
  "lineItems", "periods", "modifications", "renewals", "guarantorSignals", "maturityWatch",
  "covenantChallenge", "anchors", "accountId", "name", "id", "role", "text", "note",
]);

describe("PROVENANCE map (F2)", () => {
  const keys = Object.keys(PROVENANCE);

  it("declares a valid kind and a non-empty source for every entry", () => {
    for (const [k, v] of Object.entries(PROVENANCE)) {
      expect(VALID_KINDS, `${k} has an invalid kind`).toContain(v.kind);
      expect(v.source.trim().length, `${k} has an empty source`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate keys", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("classifies covenantChallenge as DERIVED, not BOOM", () => {
    const e = PROVENANCE["borrower.covenantChallenge[]"];
    expect(e.kind).toBe("DERIVED");
    expect(e.source).toMatch(/validateC360/);
  });

  it("R3.1 — agent-composed content is AGENT, never a source-system kind", () => {
    for (const k of ["borrower.verdict", "borrower.anchors[]", "aiPanel.threads[]"] as const) {
      expect(PROVENANCE[k].kind, `${k} must be AGENT`).toBe("AGENT");
    }
  });

  it("R3.1 — meta.generatedAt is DERIVED (assembler-stamped), not NCINO", () => {
    expect(PROVENANCE["meta.generatedAt"].kind).toBe("DERIVED");
  });

  it("R3.1 — no agent-composed narrative is mislabeled as an integration source", () => {
    const mislabeled = Object.entries(PROVENANCE).filter(
      ([, v]) => /agent-composed|agent-authored/i.test(v.source) && v.kind !== "AGENT",
    );
    expect(mislabeled.map(([k]) => k)).toEqual([]);
  });

  it("covers every data leaf the components consume", () => {
    const flat = keys.join(" ") + " " + Object.values(PROVENANCE).map((v) => v.source).join(" ");
    const missing = [...consumedLeaves()]
      .filter((leaf) => !NON_DATA.has(leaf))
      .filter((leaf) => !flat.includes(leaf));
    expect(missing, `data leaves rendered without a PROVENANCE entry: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers the load-bearing rendered paths explicitly", () => {
    for (const k of [
      "borrower.verdict",
      "borrower.anchors[]",
      "borrower.exposure.facilities[].coverageRatio",
      "borrower.exposure.facilities[].coverageShortfall",
      "borrower.exposure.facilities[].status",
      "meta.generatedAt",
      "worklist.lastModified",
    ]) {
      expect(keys, `missing PROVENANCE for ${k}`).toContain(k);
    }
  });
});
