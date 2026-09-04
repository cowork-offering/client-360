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

/** The producer behind the seam. Phase D swaps the default for the real one. */
export type MemoPublisher = (draft: MemoDraft) => Promise<MemoPublication>;

const stub: MemoPublisher = async () => ({ status: "not-wired", reason: NOT_WIRED_LINE });

let publisher: MemoPublisher = stub;

/**
 * PUBLISH THE MEMO TO nCINO AND SUBMIT THE PACKAGE FOR APPROVAL.
 *
 * The room calls this and branches on `status`. It never inspects what is
 * behind the seam, which is what lets Phase D land the connector without
 * touching the room, and what lets the room's finale test drive a real
 * publication against an injected publisher.
 */
export function publishMemo(draft: MemoDraft): Promise<MemoPublication> {
  return publisher(draft);
}

/** Phase D's door, and the suite's. Passing undefined restores the stub. */
export function setMemoPublisher(next: MemoPublisher | undefined): void {
  publisher = next ?? stub;
}
