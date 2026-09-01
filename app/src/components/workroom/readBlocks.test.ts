import { describe, expect, it } from "vitest";
import { buildReadBlocks, threadDigest } from "./readBlocks";
import {
  ENVELOPE_BLOCK_DROP_ORDER,
  ENVELOPE_CAP_BYTES,
  capEnvelope,
  type BrainEnvelope,
  type BrainTurn,
} from "../../channel/brainLane";
import type { C360Data } from "../../data/contract";
import live from "../../../../artifact/live-data.json";

/* =============================================================================
   THE ENVELOPE IS NO LONGER BLIND (F2).

   Three times in the 2026-09-01 drive the brain reported that the data was not
   carried, over a bundle that was holding it the whole time. These hold the
   other half of that fix: that what the room read travels, that it travels in
   the room's own printed form, that what NO read carries is named rather than
   silently absent, and that a long conversation gives up its history before it
   gives up a covenant threshold.
   ============================================================================= */

const data = live as unknown as C360Data;
const accountId = "001bb00001I7FPNAA3";
const bundle = data.borrowers![accountId];
const src = {
  bundle,
  accountName: bundle.snapshot!.name!,
  productPackageId: bundle.snapshot!.productPackageId ?? null,
};

describe("what the room read travels with the line", () => {
  const blocks = buildReadBlocks(src)!;

  it("carries the covenant tests with thresholds, verdicts and their scope", () => {
    expect(blocks.covenants?.length).toBeGreaterThan(0);
    const row = blocks.covenants![0];
    expect(row.name.length).toBeGreaterThan(0);
    expect(row.status.length).toBeGreaterThan(0);
    expect(row.scope.length).toBeGreaterThan(0);
  });

  it("carries who is on the deal, with the role the org wrote", () => {
    expect(blocks.involvements?.length).toBeGreaterThan(0);
    expect(blocks.involvements!.every((r) => r.name.length > 0 && r.role.length > 0)).toBe(true);
    // The corporate/person split is the ORG'S OWN WORD or it is absent. A kind
    // guessed off a name is exactly the invention the pack forbids.
    for (const row of blocks.involvements!) {
      expect(row.kind === undefined || row.kind === "person" || row.kind === "corporate").toBe(true);
    }
  });

  it("carries the exposure and the pricing AS STORED", () => {
    expect(blocks.exposure?.committed).toMatch(/^\$/);
    expect(blocks.exposure?.drawn).toMatch(/^\$/);
    expect((blocks.exposure?.facilities ?? 0) > 0).toBe(true);
    for (const row of blocks.pricing ?? []) expect(row.rate).toMatch(/%$/);
  });

  it("NEVER carries an index name, because the org does not store one", () => {
    expect(JSON.stringify(blocks)).not.toMatch(/SOFR|LIBOR|Prime rate/i);
    expect(blocks.notCarried.join(" ")).toMatch(/index name/);
  });

  it("names the fees it cannot list rather than reporting none", () => {
    // No read tool puts fee rows on the bundle. An absent block reported as an
    // empty fact is the failure the whole grounding pass exists to end.
    expect(blocks.notCarried.join(" ")).toMatch(/fees/);
  });

  it("is absent altogether where the room stands on no read", () => {
    expect(buildReadBlocks(undefined)).toBeUndefined();
    expect(buildReadBlocks({ bundle: null, accountName: "x", productPackageId: null })).toBeUndefined();
  });
});

describe("the conversation travels, banker verbatim", () => {
  it("keeps the last exchanges, oldest first, and clips only the room's own words", () => {
    const turns: BrainTurn[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ who: "banker" as const, text: `line ${i}` })),
      { who: "agent" as const, text: "x".repeat(400) },
    ];
    const digest = threadDigest(turns)!;
    expect(digest).toHaveLength(6);
    expect(digest[0].text).toBe("line 3");
    expect(digest[5].text.length).toBeLessThan(200);
    expect(digest[5].text.endsWith("...")).toBe(true);
  });

  it("is absent where nothing has been said", () => {
    expect(threadDigest([])).toBeUndefined();
    expect(threadDigest([{ who: "banker", text: "   " }])).toBeUndefined();
  });
});

describe("the envelope holds to its budget, and says what it dropped", () => {
  const base = (): BrainEnvelope => ({
    v: 2,
    line: "what covenants are on this",
    room: "facility",
    relationship: "Hartwell Precision Manufacturing LLC",
    route: "modify",
    packageName: "Hartwell Industrial C&I Credit Package",
    productPackageId: "a5Fbb000000IHFJEA4",
    selectedFacility: null,
    facilities: [],
    staged: [],
    reads: buildReadBlocks(src),
    grounding: "plugin-skill:workroom-brain",
  });

  it("leaves an envelope inside the budget exactly as it was", () => {
    const envelope = base();
    expect(JSON.stringify(envelope).length).toBeLessThanOrEqual(ENVELOPE_CAP_BYTES);
    expect(capEnvelope(envelope)).toEqual(envelope);
  });

  it("gives up thread history BEFORE it gives up a read block", () => {
    const envelope: BrainEnvelope = {
      ...base(),
      thread: Array.from({ length: 6 }, (_, i) => ({ who: "banker" as const, text: `${i} `.repeat(900) })),
    };
    expect(JSON.stringify(envelope).length).toBeGreaterThan(ENVELOPE_CAP_BYTES);
    const capped = capEnvelope(envelope);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(ENVELOPE_CAP_BYTES);
    expect(capped.omitted).toContain("earlier conversation");
    // The covenants survived: an answer without the last exchanges is a worse
    // conversation; an answer without the thresholds is a wrong one.
    expect(capped.reads?.covenants?.length).toBe(envelope.reads?.covenants?.length);
  });

  it("gives up read blocks in the declared order, naming every one", () => {
    // THE BANKER'S LINE IS NEVER TRIMMED, so this envelope stays over budget
    // with every block gone. What is asserted is the ORDER of the sacrifice.
    const envelope: BrainEnvelope = { ...base(), line: "x".repeat(ENVELOPE_CAP_BYTES) };
    const capped = capEnvelope(envelope);
    const dropped = (capped.omitted ?? []).filter((n) => n !== "earlier conversation");
    expect(dropped.length).toBeGreaterThan(0);
    // Every block present was given up, in the declared order, and named.
    const present = ENVELOPE_BLOCK_DROP_ORDER.filter((b) => envelope.reads?.[b] !== undefined);
    expect(dropped).toEqual(present);
    // Exposure is the last to go and covenants the second to last: the blocks
    // that ground nearly every question a banker asks.
    expect(present[present.length - 1]).toBe("exposure");
    // `notCarried` never leaves: it is what makes an absent block refusable.
    expect(capped.reads?.notCarried).toBeDefined();
  });
});
