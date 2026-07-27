/* =============================================================================
   THE SYNC OVERLAY, ACROSS A RELOAD.

   Founder, 2026-07-27: "why does it not stay static if I refresh the artefact?"
   Everything a Sync fetched — the patched detail reads, the matched client
   email, the org's action history, the freshness stamps — lived in memory only,
   so a reload reverted to the baked bundle and the fetched email vanished.

   So the READ overlay persists, per account, and is re-applied over the baked
   bundle on load.

   WHAT IS DELIBERATELY NOT PERSISTED: anything from staging or execution. No
   plans, no hashes, no decision tokens, no idempotency keys. A token that
   survives a reload is a token that can be replayed by whoever opens the page
   next, and the confirm gate's whole contract is that one banker saw one plan.

   RESTORED IS NOT FRESH. The original `storedAt` is persisted with the data and
   drives the staleness note, so a restored overlay reads "synced 20 minutes
   ago" and never presents itself as current.
   ============================================================================= */

import type { ActionHistoryRow, ActivityEntry, BorrowerBundle } from "../data/contract";

/** Bump to invalidate every stored overlay. A publish that changes the bundle
 *  shape must not have last week's overlay re-applied on top of it. */
const SCHEMA_VERSION = 1;

/** Overlays older than this are dropped rather than shown as history. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Per-account cap. A bundle patch is small; a runaway one is a quota error
 *  waiting to happen on someone else's write. */
const MAX_ACCOUNT_BYTES = 256 * 1024;

export interface AccountOverlay {
  /** Detail slices a sync fetched, merged over the baked bundle at read time. */
  patch: Partial<BorrowerBundle>;
  /** Mail and execution entries minted in that session. */
  activity: ActivityEntry[];
  /** The org's durable action trail as last read. */
  history?: ActionHistoryRow[];
  /** The TRUE freshness of the data above. Never refreshed on restore. */
  storedAt?: number;
  /** When each slow-tier read last ran, so the tiering survives a reload too. */
  fetchedAt?: Record<string, number>;
}

interface Envelope {
  v: number;
  /** Identifies the DATA this overlay was built against, so a new publish with
   *  a new bundle does not inherit an overlay describing the old one. */
  dataVersion: string;
  savedAt: number;
  accounts: Record<string, AccountOverlay>;
}

const KEY = "c360:sync-overlay";

/** Storage may be absent or refused outright inside an artifact sandbox. */
function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    // Feature-detect by USE: some sandboxes expose the object and throw on write.
    const probe = "c360:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function readEnvelope(dataVersion: string): Envelope | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    if (!env || env.v !== SCHEMA_VERSION) return null;
    // A different bundle is a different world; the overlay does not carry over.
    if (env.dataVersion !== dataVersion) return null;
    if (typeof env.savedAt !== "number" || Date.now() - env.savedAt > MAX_AGE_MS) return null;
    return env.accounts && typeof env.accounts === "object" ? env : null;
  } catch {
    return null;
  }
}

export function loadOverlays(dataVersion: string): Record<string, AccountOverlay> {
  return readEnvelope(dataVersion)?.accounts ?? {};
}

/**
 * Persist one account's overlay, leaving the others alone.
 *
 * On a quota error the OLDEST accounts are evicted one at a time and the write
 * retried, so a full store degrades to fewer remembered relationships rather
 * than to a thrown error in the middle of a sync.
 */
export function saveOverlay(dataVersion: string, accountId: string, overlay: AccountOverlay): void {
  const s = storage();
  if (!s) return;

  const serialised = JSON.stringify(overlay);
  // Too big to be worth remembering: skip rather than evict everything else.
  if (serialised.length > MAX_ACCOUNT_BYTES) return;

  const existing = readEnvelope(dataVersion);
  const accounts = { ...(existing?.accounts ?? {}), [accountId]: overlay };
  // Newest last, so eviction takes the oldest first.
  const order = Object.keys(accounts).filter((id) => id !== accountId).concat(accountId);

  for (let evicted = 0; evicted < order.length; evicted += 1) {
    const keep = order.slice(evicted);
    const env: Envelope = {
      v: SCHEMA_VERSION,
      dataVersion,
      savedAt: Date.now(),
      accounts: Object.fromEntries(keep.map((id) => [id, accounts[id]])),
    };
    try {
      s.setItem(KEY, JSON.stringify(env));
      return;
    } catch {
      // Quota. Drop the oldest and try again; the account just synced is last
      // in the order, so it is the last thing to be given up.
      if (keep.length <= 1) return;
    }
  }
}

export function clearOverlays(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The identity of the staged data, so a republish invalidates cleanly. */
export function dataVersionOf(meta: { generatedAt?: string; anchorAccountId?: string } | undefined): string {
  return `${meta?.anchorAccountId ?? "none"}@${meta?.generatedAt ?? "none"}`;
}
