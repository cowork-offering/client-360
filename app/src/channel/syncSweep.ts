/* =============================================================================
   THE SYNC SWEEP (WP7)

   One gesture, one sweep. Every line on the console is BOUND TO A REAL CALL:
   the line goes running when its own call is fired and only ticks when that
   call has RETURNED. Display pacing sets a floor on how fast a line may tick,
   never a ceiling on how long the work takes, so the sequence can be slower
   than the pacing but never faster than the truth.

   NO FAKE THEATER. There is no line here without a call behind it, and no call
   here that the banker did not ask for: this runs on the Sync gesture only.
   There is no polling and no auto-sync.

   Failure doctrine (unchanged): a failed read keeps the last-good value and
   says so on its line. A failed sweep never blanks the workspace.
   ============================================================================= */

import type { ActionHistoryRow, ActivityEntry, BorrowerBundle, Id } from "../data/contract";
import { callTool, DETAIL_TOOLS, SERVERS, TOOLS, unwrapInvocable, type McpFailure, type McpOk } from "./mcp";
import { fetchActionHistory, matchesAccount, searchMailbox, type MailHit } from "./cockpitTools";

export type SyncLineState = "pending" | "running" | "done" | "failed";

export interface SyncLine {
  id: string;
  /** Banker language. What this call is actually doing. */
  label: string;
  state: SyncLineState;
  /** On failure: what the banker needs to know, in one line. */
  detail?: string;
}

export interface SyncResult {
  lines: SyncLine[];
  patch: Partial<BorrowerBundle>;
  /** Newest cache stamp across the reads. Never Date.now(). */
  storedAt?: number;
  /** Inbound mail that resolved to this account, as activity entries. */
  requests: ActivityEntry[];
  /** The org's durable action trail. Undefined when the tool is not in this
   *  view at all, which is different from an empty trail. */
  history?: ActionHistoryRow[];
  /** True when a read failed and its section kept the previous value. */
  partial: boolean;
}

/** Bundle keys the six detail tools map onto, in DETAIL_TOOLS order. */
const DETAIL_KEYS = ["snapshot", "graph", "exposure", "covenants", "opportunities", "signals"] as const;

const DETAIL_LABELS = [
  "Relationship snapshot",
  "Relationship graph",
  "Exposure and collateral",
  "Covenant positions",
  "Open opportunities",
  "Structural signals",
] as const;

/** Codes that mean the connector is simply not part of this view. A29's
 *  opportunistic rule: skip silently, never render it as a failure. */
const ABSENT: string[] = [
  "server_not_connected",
  "server_not_found",
  "not_in_manifest",
  "not_granted",
  "capability_disabled",
  "capability_removed",
];

const isAbsent = (e: unknown) =>
  Boolean((e as McpFailure)?.noCapability) || ABSENT.includes(String((e as McpFailure)?.code ?? ""));

export interface SweepOptions {
  accountId: Id;
  accountName: string;
  /** Render clock for the ingested mail timestamps; the staged generatedAt. */
  generatedAt: string;
  /** Floor on how long a line is displayed before it may tick. */
  minPace?: number;
  onLines?: (lines: SyncLine[]) => void;
  /** Launch pacing, overridable for tests. */
  launchGapMs?: number;
  maxInFlight?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** At most this many connector calls in flight at once. */
export const MAX_IN_FLIGHT = 2;
/** Spacing between launches, so the bridge never sees a burst. */
export const LAUNCH_GAP_MS = 200;

/**
 * Start work with a concurrency cap and a gap between launches.
 *
 * Order is preserved: callers get their promise back immediately and the pacer
 * decides when the underlying call actually starts.
 */
export function createPacer({ gap, limit, sleep }: { gap: number; limit: number; sleep: (ms: number) => Promise<void> }) {
  let inFlight = 0;
  const queue: Array<() => void> = [];
  let lastLaunch: Promise<void> = Promise.resolve();

  const release = () => {
    inFlight -= 1;
    const next = queue.shift();
    if (next) next();
  };

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const slot = new Promise<void>((resolve) => {
      const take = () => {
        inFlight += 1;
        resolve();
      };
      if (inFlight < limit) take();
      else queue.push(take);
    });
    const spaced = lastLaunch.then(() => sleep(gap));
    lastLaunch = spaced;
    return Promise.all([slot, spaced]).then(() => {
      const p = fn();
      p.then(release, release);
      return p;
    });
  };
}


/**
 * Run the sweep. All calls are fired at the start, on the single gesture, so
 * the sweep costs one round of reads rather than one per line; the lines then
 * settle IN ORDER as their own call returns.
 */
export async function runSyncSweep(opts: SweepOptions): Promise<SyncResult> {
  const { accountId, accountName, generatedAt } = opts;
  const minPace = opts.minPace ?? 450;
  const sleep = opts.sleep ?? wait;

  // ---- launch, PACED, on the one gesture ---------------------------------
  //
  // These used to fire all nine at once. The artifact-connector bridge does not
  // like a nine-call burst: the founder saw random lines reporting the customer
  // briefly unreachable, intermittently and on no particular line, which is what
  // burst turbulence looks like from the inside.
  //
  // So at most TWO are in flight and each launch is spaced by a small gap. The
  // console already presents the lines sequentially, so perceived latency barely
  // moves; the bridge simply stops seeing a burst.
  //
  // There is NO retry here on purpose. `callTool` already retries once for a
  // read the platform stamped retryable, so a second layer would mean two
  // retries and a bigger burst — the opposite of the fix.
  const pace = createPacer({ gap: opts.launchGapMs ?? LAUNCH_GAP_MS, limit: opts.maxInFlight ?? MAX_IN_FLIGHT, sleep });

  // Nothing here may reject unhandled while a slower line is still displaying.
  const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }));

  const portfolio = settled(
    pace(() => callTool(SERVERS.customer360, TOOLS.portfolio, { inputs: [{}] }, { read: true, cache: { staleTime: 15_000 } })),
  );
  // SCOPE: only the OPEN account's detail is read. The sweep has never fanned
  // out across the book, and this is where that would show up if it ever did.
  const details = DETAIL_TOOLS.map((tool) =>
    settled(
      pace(() => callTool(SERVERS.customer360, tool, { inputs: [{ accountId }] }, { read: true, cache: { staleTime: 15_000 } })),
    ),
  );
  const mail = settled(pace(() => searchMailbox(accountName)));
  const history = settled(pace(() => fetchActionHistory(accountId)));

  const lines: SyncLine[] = [
    { id: "portfolio", label: "Portfolio position", state: "pending" },
    ...DETAIL_TOOLS.map((_, i) => ({ id: DETAIL_KEYS[i], label: DETAIL_LABELS[i], state: "pending" as SyncLineState })),
    { id: "history", label: "Actions filed against this relationship", state: "pending" },
    { id: "mail", label: "Your inbox for this relationship", state: "pending" },
  ];
  const emit = () => opts.onLines?.(lines.map((l) => ({ ...l })));

  const patch: Partial<BorrowerBundle> = {};
  let storedAt: number | undefined;
  let partial = false;
  let requests: ActivityEntry[] = [];
  let historyRows: ActionHistoryRow[] | undefined;

  const KEPT = "This section did not come back. The previous value is still shown.";
  /** What landing a result says about its line: a note, or an honest failure. */
  type Landing = string | void | { failed: string };

  /** Show the line, await its real call, hold it for the pacing floor, tick. */
  async function step<T>(
    id: string,
    settledCall: Promise<{ ok: true; v: T } | { ok: false; e: unknown }>,
    land: (v: T) => Landing,
  ): Promise<void> {
    const line = lines.find((l) => l.id === id)!;
    line.state = "running";
    emit();
    const [outcome] = await Promise.all([settledCall, sleep(minPace)]);

    if (!outcome.ok) {
      if (isAbsent(outcome.e)) {
        // Not connected in this view. The line leaves without a trace.
        lines.splice(lines.indexOf(line), 1);
        emit();
        return;
      }
      partial = true;
      line.state = "failed";
      line.detail = (outcome.e as McpFailure)?.fix ?? KEPT;
      emit();
      return;
    }

    const landed = land(outcome.v);
    if (landed && typeof landed === "object") {
      partial = true;
      line.state = "failed";
      line.detail = landed.failed;
    } else {
      line.state = "done";
      if (landed) line.detail = landed;
    }
    emit();
  }

  // The portfolio read confirms the book around this relationship. The account
  // view renders from the bundle, so nothing is patched from it.
  await step("portfolio", portfolio, () => {});

  for (let i = 0; i < details.length; i++) {
    const key = DETAIL_KEYS[i];
    await step(key, details[i], (ok: McpOk<unknown>) => {
      if (ok.cache?.storedAt && (storedAt === undefined || ok.cache.storedAt > storedAt)) storedAt = ok.cache.storedAt;
      const slot = unwrapInvocable(ok.payload, 1)[0];
      if (!slot.ok) return { failed: KEPT };
      (patch as Record<string, unknown>)[key] = slot.data;
    });
  }

  // Until the read tool is deployed this line removes itself, exactly like the
  // mailbox line does when Microsoft 365 is absent.
  await step("history", history, ({ rows }: { rows: ActionHistoryRow[] }) => {
    historyRows = rows;
    return rows.length ? `${rows.length} on record` : "none on record";
  });

  await step("mail", mail, ({ hits }: { hits: MailHit[] }) => {
    const matched = hits.filter((h) => matchesAccount(h, accountName));
    requests = matched.map((m) => ({
      id: `mail-${m.id ?? m.subject ?? Math.random().toString(36).slice(2)}`,
      // Clamp a skewed timestamp to the render clock rather than showing a
      // message that appears to arrive from the future.
      ts: m.receivedAt && m.receivedAt <= generatedAt ? m.receivedAt : generatedAt,
      kind: "REQUEST_RECEIVED",
      title: m.subject ?? "Client message",
      summary: m.preview,
      actor: m.from,
      sessionLocal: true,
      reference: { kind: "m365-message", id: m.id, webLink: m.webLink },
    }));
    return matched.length ? `${matched.length} matched` : "nothing new";
  });

  return { lines, patch, storedAt, requests, history: historyRows, partial };
}
