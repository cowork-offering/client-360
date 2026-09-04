/* =============================================================================
   THE ROOM MEETS THE LANES (2026-09-04).

   Phase C stored the memo the room drafted (memo/store.ts); Phase D built the
   writeback as independent lanes over a draft of its own shape (publishTypes).
   This adapter is the only place that knows both: it turns the stored draft
   into the lanes' draft, builds the acting context from the view's meta, runs
   the lanes, and hands the room one publication with a sentence it can say.
   A lane that answered from a fixture is said out loud: a banker must never
   read "published" for a write the org never saw.
   ============================================================================= */
import type { MemoDraft as StoredDraft } from "./store";
import type { Meta } from "../data/contract";
import { publishMemo } from "./publishLanes";
import type { MemoDraft as LaneDraft, MemoPublication, MemoSection } from "./publishTypes";
import { sectionsFrom } from "./renderMemo";

export type RoomPublication = MemoPublication & { reason?: string };

export interface PublishSite {
  accountId: string;
  packageId: string;
  meta: Meta | null | undefined;
}

export const NO_APPROVER_LINE =
  "No approver address on this view, so nothing was sent. The approval routes to the signed-in banker's email once the view carries it.";

/** The stored draft, reshaped for the lanes. Section HTML comes off the memo's
 *  own anchors; the room's attestation state rides along. */
export function laneDraftFrom(draft: StoredDraft): LaneDraft {
  const byId = new Map(draft.sections.map((s) => [s.id, s]));
  const split: MemoSection[] = draft.html
    ? sectionsFrom(draft.html).map((s) => ({
        id: s.id,
        title: s.title,
        html: s.html,
        status: byId.get(s.id)?.status,
        note: byId.get(s.id)?.note,
      }))
    : draft.sections.map((s) => ({ id: s.id, title: s.title, html: "", status: s.status, note: s.note }));
  return {
    memoId: draft.memoId,
    packageId: draft.packageId,
    renderPlan: {
      modules: draft.renderPlan.modules.map((m) => ({ id: m.id, on: m.on, reason: m.reason })),
      suppressed: draft.renderPlan.suppressed.map((m) => ({ id: m.id, reason: m.reason })),
    },
    sections: split,
    html: draft.html ?? "",
    generatedAt: draft.generatedAt,
    generator: draft.generator,
  };
}

/** One sentence the room can say under the result. */
export function reasonFor(pub: MemoPublication): string | undefined {
  if (pub.status === "published" && !pub.simulated) return undefined;
  if (pub.simulated) {
    return "The writeback connector answered from fixtures: nothing reached the org. The lanes ran and reported, but this is not a publication.";
  }
  const failed = pub.lanes.filter((l) => l.status === "failed");
  if (failed.length) return failed.map((l) => `${l.lane}: ${l.detail}`).join(" ");
  return undefined;
}

export async function publishDraft(draft: StoredDraft, site: PublishSite): Promise<RoomPublication> {
  const email = site.meta?.userEmail?.trim();
  if (!email) {
    return {
      memoId: draft.memoId,
      packageId: draft.packageId,
      status: "failed",
      lanes: [],
      reason: NO_APPROVER_LINE,
    };
  }
  const pub = await publishMemo(laneDraftFrom(draft), {
    packageId: site.packageId,
    accountId: site.accountId,
    actingUserId: site.meta?.userId ?? "",
    actingUserName: site.meta?.user ?? "",
    approverEmails: [email],
    notificationEmails: [email],
    comments: `Credit memo ${draft.memoId} attested in the cockpit.`,
  });
  return { ...pub, reason: reasonFor(pub) };
}
