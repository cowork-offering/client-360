/* =============================================================================
   THE WRITEBACK SEAM. One function, and nothing behind it yet.

   PHASE D CONNECTS THE LANE. The Experience connector carries the five tools
   the finale needs (ncino_sync_memo_sections, ncino_publish_credit_memo,
   ncino_finalize_credit_memo, ncino_submit_for_approval, ncino_notify) plus the
   ledger pair, and none of them is on this cockpit's grant today. So the room
   builds the whole choreography now and calls THIS, which resolves
   `{status: "not-wired"}` and says so on the glass.

   AN HONEST STUB, NOT A FAKE SUCCESS. The button is real, the attestation gate
   in front of it is real, and what comes back is the truth: the writeback lane
   is not connected in this build. A stub that returned a memo record id would
   put a fabricated nCino id in front of a credit officer, which is the failure
   mode this whole cockpit is built to refuse.

   THE SHAPE IS THE PORT PLAN'S `MemoPublication`, minus what a stub cannot
   know. When Phase D implements this the room does not change: it already reads
   `status`, and it already renders the three outcomes.
   ============================================================================= */

import type { MemoDraft } from "./store";

/** What came back from the writeback lane. */
export interface MemoPublication {
  /** `not-wired` is today's only answer. `published` and `failed` are Phase D's. */
  status: "not-wired" | "published" | "failed";
  /** The nFORMS memo record, once there is one. Never invented. */
  memoRecordId?: string;
  /** The nCino approval queue the package went to. */
  approvalQueue?: string;
  /** When the submission landed, as the org stamped it. */
  submittedAt?: string;
  /** The staging row that carries the trail entry for this publication. */
  trailStagingId?: string;
  /** Why, where `status` is not `published`. Banker language, one clause. */
  reason?: string;
}

/** THE ONE LINE THE ROOM SAYS while the lane is a stub. Founder language, no
 *  apology and no retry: a capability that is not in this build is a fact. */
export const NOT_WIRED_LINE = "Writeback lane not connected in this build.";

/**
 * PUBLISH THE MEMO TO nCINO AND SUBMIT THE PACKAGE FOR APPROVAL.
 *
 * THIS FUNCTION IS THE SEAM, and Phase D's whole job on this side is to fill
 * its body. The room calls it and branches on `status`; it never inspects what
 * is behind it, which is why landing the connector touches no component. The
 * room takes a publisher as an injected dep too, which is how the suite drives
 * a published outcome without a connector; this is what the cockpit passes when
 * nothing is injected.
 */
export async function publishMemo(_draft: MemoDraft): Promise<MemoPublication> {
  return { status: "not-wired", reason: NOT_WIRED_LINE };
}
