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
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run the sweep. All calls are fired at the start, on the single gesture, so
 * the sweep costs one round of reads rather than one per line; the lines then
 * settle IN ORDER as their own call returns.
 */
export async function runSyncSweep(opts: SweepOptions): Promise<SyncResult> {
  const { accountId, accountName, generatedAt } = opts;
  const minPace = opts.minPace ?? 450;
  const sleep = opts.sleep ?? wait;

  // ---- fire everything, once, on the gesture -----------------------------
  const portfolioCall = callTool(SERVERS.customer360, TOOLS.portfolio, { inputs: [{}] }, { read: true, cache: { staleTime: 15_000 } });
  const detailCalls = DETAIL_TOOLS.map((tool) =>
    callTool(SERVERS.customer360, tool, { inputs: [{ accountId }] }, { read: true, cache: { staleTime: 15_000 } }),
  );
  const mailCall = searchMailbox(accountName);
  const historyCall = fetchActionHistory(accountId);
  // Nothing here may reject unhandled while a slower line is still displaying.
  const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }));
  const portfolio = settled(portfolioCall);
  const details = detailCalls.map(settled);
  const mail = settled(mailCall);
  const history = settled(historyCall);

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
