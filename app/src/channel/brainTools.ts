/* =============================================================================
   THE TWO CALL-OUTS — the only page functions the model may reach.

   A tool is not a lookup. It is another whole round: a three-round call on the
   default tier commonly takes 30 to 90 seconds, every round a separate paid
   request on the VIEWER's account. So the list is two, each narrow, and each
   description names the CHEAPER SOURCE the model should prefer, because models
   over-call and the prompt alone does not stop them.

   READS ONLY. THE WRITE FENCE IS ABSOLUTE. A call-out may READ. It may never
   WRITE. Every mutation stays on the governed path: propose, restate through
   proven phrasings, human confirm, single-use token, execute. This is the
   SR 11-7 fence and the whole reason a banker trusts the room, so it is not
   enforced by good intentions: {@link READ_DOORS} is an allow-list and
   `readDoor` refuses anything that is not on it, including by construction
   every `stage_*` and `execute_*` tool the connector exposes.

   THE SECOND TOOL IS THE N4 GAP, NAMED. The relationship graph read returns the
   union of the anchor's OWN involvement rows and every row on its loans, which
   is the read a banker means by "who guarantees what". A snapshot taken before
   a party moved does not carry it; this does.
   ============================================================================= */

import type { BrainReadBlocks } from "./brainLane";
import { callTool, SERVERS, TOOLS, unwrapInvocableOne } from "./mcp";
import type { SampleTool, SampleToolContext } from "./sampleDoor";

/**
 * THE ONLY DOORS A CALL-OUT MAY OPEN.
 *
 * Both are reads. Nothing is added to this set without the write fence being
 * re-argued: a read tool that could mutate is not exposed, and a set that grew
 * by habit would be exactly how the fence rots.
 */
export const READ_DOORS: ReadonlySet<string> = new Set<string>([TOOLS.boomRatios, TOOLS.graph]);

/** The tool names this module builds, in order. The suite pins this list: a
 *  third tool is a design decision, never a drive-by. */
export const BRAIN_TOOL_NAMES = ["currentBoomRatios", "liveInvolvements"] as const;

export type BrainToolCall = (
  server: string,
  tool: string,
  input: unknown,
  options: { read: true; signal?: AbortSignal },
) => Promise<{ payload: unknown }>;

/** THE ONE GATE, on its own so the suite can point a write door at it directly.
 *  Throws before the connector is touched at all. */
export function assertReadDoor(tool: string): void {
  if (!READ_DOORS.has(tool)) {
    throw new Error(`${tool} is not a read door. Call-outs read; the governed path writes.`);
  }
}

/** Every call a tool makes goes through here. */
async function readDoor(
  call: BrainToolCall,
  server: string,
  tool: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  assertReadDoor(tool);
  const res = await call(server, tool, input, { read: true, signal });
  return res.payload;
}

export interface BrainToolsArgs {
  /** The relationship the room is standing in. Both tools are bound to it: the
   *  model never chooses which borrower to read, so it cannot read another. */
  anchor: { accountId: string | null; company: string | null };
  /** What the envelope already carries, so a tool can report itself as an
   *  OVER-CALL when the answer was already in front of the model. */
  reads?: BrainReadBlocks;
  /** Injected for the suite, and so this module never touches a global. */
  call?: BrainToolCall;
}

/**
 * THE TWO TOOLS, BUILT AND BOUND.
 *
 * Neither takes an argument: the relationship is the room's, not the model's,
 * and a tool with no input schema is a tool that cannot be pointed somewhere
 * else. Both return SMALL plain data, because every round re-reads everything
 * so far and a fat result is paid for again on the next round.
 */
export function buildBrainTools(args: BrainToolsArgs): SampleTool[] {
  const call: BrainToolCall = args.call ?? ((server, tool, input, options) => callTool(server, tool, input, options));
  const reads = args.reads;

  const boom: SampleTool = {
    name: "currentBoomRatios",
    description:
      "Current financial ratios (revenue, EBITDA, margin, total leverage, interest coverage) from the latest Boom spread. Use ONLY if the banker asks for figures more recent than the pricing and covenant actuals already in your context, which almost always answer the question for free. Costs the banker 30 to 90 seconds.",
    heldAlready: () => Boolean(reads?.covenants?.length || reads?.pricing?.length),
    execute: async (_input: Record<string, unknown>, context: SampleToolContext) => {
      const company = args.anchor.company;
      if (!company) return "No company is bound to this room, so the Boom door cannot be opened.";
      const payload = await readDoor(call, SERVERS.gateway, TOOLS.boomRatios, { company }, context.signal);
      return shapeRatios(payload);
    },
  };

  const involvements: SampleTool = {
    name: "liveInvolvements",
    description:
      "Every party on this relationship RIGHT NOW, with their role: the union of the anchor account's own involvement rows and every row on its loans. Use ONLY when the banker asks whether something has changed since the snapshot, or names a facility your context's involvements block does not cover. The involvements already in your context answer the ordinary question instantly.",
    heldAlready: () => Boolean(reads?.involvements?.length),
    execute: async (_input: Record<string, unknown>, context: SampleToolContext) => {
      const accountId = args.anchor.accountId;
      if (!accountId) return "No account is bound to this room, so the relationship graph cannot be read.";
      const payload = await readDoor(
        call,
        SERVERS.customer360,
        TOOLS.graph,
        { inputs: [{ accountId }] },
        context.signal,
      );
      return shapeInvolvements(payload);
    },
  };

  return [boom, involvements];
}

/* ---------------------------------------------------------------- shaping

   SMALL, PLAIN, AND HONEST ABOUT WHAT IS MISSING. A tool that returned the raw
   envelope would spend the banker's next round re-reading it, and a tool that
   silently returned {} would let the model report an empty fact.            */

function shapeRatios(payload: unknown): unknown {
  const p = (payload ?? {}) as { ratios?: Record<string, unknown> };
  const ratios = (p.ratios ?? p) as Record<string, unknown>;
  const pick = ["revenue", "ebitda", "ebitdaMargin", "totalLeverage", "interestCoverage"];
  const out: Record<string, unknown> = {};
  for (const key of pick) if (ratios[key] !== undefined && ratios[key] !== null) out[key] = ratios[key];
  if (!Object.keys(out).length) return "The Boom door answered, but it carried no ratio figures.";
  return out;
}

function shapeInvolvements(payload: unknown): unknown {
  const slot = unwrapInvocableOne<{ legalEntities?: Array<Record<string, unknown>> }>(payload);
  if (!slot.ok) return `The relationship graph could not be read: ${slot.error}`;
  const rows = slot.data.legalEntities ?? [];
  if (!rows.length) return "The relationship graph carries no involvement rows for this account.";
  // Capped, because every round re-reads everything so far and a fat result is
  // paid for again on the next one.
  return rows.slice(0, 120).map((r) => ({
    name: r.accountName ?? null,
    role: r.borrowerType ?? null,
    // A null loanId is the org's own way of saying relationship level. It is an
    // answer, not a gap, so it travels as one.
    scope: r.loanId ? String(r.loanId) : "across the relationship",
    ownership: r.ownershipPercent ?? null,
    guaranty: r.guarantyAmountType ?? null,
  }));
}
