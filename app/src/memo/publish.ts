/* =============================================================================
   THE SEAM THE MEMO ROOM CALLS (phase D, 2026-09-04).

   One import for the room: `publishMemo(draft, ctx)` and the shapes around it.
   The room never reaches past this file, so the producer underneath can move
   (cockpit today, an MCP server later) without the room noticing.
   ============================================================================= */

export { publishMemo } from "./publishLanes";
export { notWired } from "./publishTypes";
export type {
  LaneId,
  LaneOutcome,
  LaneStatus,
  LaneSystem,
  MemoAttestation,
  MemoDraft,
  MemoPublication,
  MemoPublishContext,
  MemoRequest,
  MemoSection,
} from "./publishTypes";
