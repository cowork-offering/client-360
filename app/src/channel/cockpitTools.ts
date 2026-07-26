/* =============================================================================
   Typed cockpit operations over the connector layer.

   Each function owns ONE proven tool call plus its envelope unwrapping, so the
   components never touch `window.claude.mcp` or an envelope shape directly.
   Failures reject as {@link McpFailure} — already branchable, already carrying
   the fix copy for the affected section.
   ============================================================================= */

import type { ActionHistoryRow, BorrowerBundle, C360Data, Id } from "../data/contract";
import { buildGroundedPrompt } from "../data/grounding";
import {
  callTool,
  DETAIL_TOOLS,
  SERVERS,
  TOOLS,
  unwrapInvocable,
  unwrapLlm,
  unwrapMail,
  type LlmAnswer,
  type McpOk,
} from "./mcp";

/* ------------------------------------------------------------------ chat */

/** Ask the credit copilot. The prompt is GROUNDED in the staged bundle so the
 *  model answers from the cockpit's figures, never from general knowledge. */
export async function askCopilot(args: {
  data: C360Data;
  bundle: BorrowerBundle | null;
  accountName: string | null;
  tab: string | null;
  question: string;
  signal?: AbortSignal;
}): Promise<LlmAnswer> {
  const prompt = buildGroundedPrompt(args);
  const res = await callTool(SERVERS.gateway, TOOLS.llm, { prompt }, { read: true, signal: args.signal });
  return unwrapLlm(res.payload);
}

/* ------------------------------------------------------------ live detail */

export interface DetailRefresh {
  /** Per-tool outcome, keyed by tool name; a failed tool leaves its slice out. */
  patch: Partial<BorrowerBundle>;
  /** Tools that reported a per-element failure, for honest partial reporting. */
  failed: string[];
  /** Freshness of the newest served result, when any came from cache. */
  storedAt?: number;
}

/** Bundle keys the six detail tools map onto, in DETAIL_TOOLS order. */
const DETAIL_KEYS = ["snapshot", "graph", "exposure", "covenants", "opportunities", "signals"] as const;

/**
 * Refresh one account's staged detail from the live org.
 *
 * The six tools are called with a single-element inputs array each and the
 * SALESFORCE INVOCABLE ENVELOPE is unwrapped positionally. A tool that fails
 * is reported in `failed` and simply omitted from the patch — the rest of the
 * bundle keeps its previous values rather than being blanked.
 */
export async function refreshAccountDetail(accountId: Id): Promise<DetailRefresh> {
  const results = await Promise.allSettled(
    DETAIL_TOOLS.map((tool) =>
      callTool(SERVERS.customer360, tool, { inputs: [{ accountId }] }, { read: true, cache: { staleTime: 15_000 } }),
    ),
  );

  const patch: Partial<BorrowerBundle> = {};
  const failed: string[] = [];
  let storedAt: number | undefined;

  results.forEach((r, i) => {
    const tool = DETAIL_TOOLS[i];
    const key = DETAIL_KEYS[i];
    if (r.status !== "fulfilled") {
      failed.push(tool);
      return;
    }
    const ok = r.value as McpOk<unknown>;
    if (ok.cache?.storedAt && (storedAt === undefined || ok.cache.storedAt > storedAt)) storedAt = ok.cache.storedAt;
    const slot = unwrapInvocable(ok.payload, 1)[0];
    if (!slot.ok) {
      failed.push(tool);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (patch as Record<string, unknown>)[key] = slot.data as any;
  });

  return { patch, failed, storedAt };
}

/* ------------------------------------------------------------------ boom */

/** Refresh Boom financials for one company. Ratios are the proven call; the
 *  spread follows the same connector pattern and is best-effort. */
export async function refreshBoom(company: string): Promise<{ ratios?: unknown; spread?: unknown; storedAt?: number }> {
  const [ratios, spread] = await Promise.allSettled([
    callTool(SERVERS.gateway, TOOLS.boomRatios, { company }, { read: true, cache: { staleTime: 30_000 } }),
    callTool(SERVERS.gateway, TOOLS.boomSpread, { company }, { read: true, cache: { staleTime: 30_000 } }),
  ]);
  const out: { ratios?: unknown; spread?: unknown; storedAt?: number } = {};
  if (ratios.status === "fulfilled") {
    out.ratios = ratios.value.payload;
    out.storedAt = ratios.value.cache?.storedAt;
  }
  if (spread.status === "fulfilled") out.spread = spread.value.payload;
  // Both failing is a real failure; one failing is a partial the caller can show.
  if (ratios.status === "rejected" && spread.status === "rejected") throw ratios.reason;
  return out;
}

/* -------------------------------------------------------- action history */

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Salesforce hands datetimes back space-separated ("2026-07-25 20:18:36"), not
 * as ISO instants. The whole timeline sorts and renders on ISO, so normalise
 * here, at the seam, rather than teaching every consumer two formats.
 *
 * The API returns UTC, so the normalised value is stamped Z. Anything already
 * carrying a zone is left alone, and anything unrecognisable is dropped: a
 * fabricated timestamp would place a real event at the wrong point in the trail.
 */
export function normalizeStamp(raw: unknown): string | undefined {
  const v = text(raw);
  if (!v) return undefined;
  const spaced = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(v);
  if (spaced) return `${spaced[1]}T${spaced[2]}${spaced[3] ?? ""}Z`;
  return Number.isNaN(Date.parse(v)) ? undefined : v;
}

/** Map one wire row defensively. A row without a stagingId cannot be deduped
 *  against the session echo, so it is dropped rather than double-rendered. */
function toHistoryRow(raw: Record<string, unknown>): ActionHistoryRow | null {
  const stagingId = text(raw.stagingId);
  if (!stagingId) return null;
  return {
    stagingId,
    actionId: text(raw.actionId),
    status: text(raw.status),
    actorUserId: text(raw.actorUserId),
    approverUserId: text(raw.approverUserId),
    executedAt: normalizeStamp(raw.executedAt),
    createdDate: normalizeStamp(raw.createdDate),
    resultRecordId: text(raw.resultRecordId),
    resultRecordName: text(raw.resultRecordName),
    accountId: text(raw.accountId),
    productPackageId: text(raw.productPackageId),
    collateralId: text(raw.collateralId),
    planHashPresent: raw.planHashPresent === true,
  };
}

/**
 * The durable action trail for one account, newest first.
 *
 * SEAMED like WP5: built against the DECLARED shape while the Apex lane
 * deploys. Until the tool exists the call fails with a not-in-manifest code,
 * which the sweep treats as "not part of this view" and drops silently — the
 * cockpit shows the session echo alone, exactly as it does today.
 */
export async function fetchActionHistory(accountId: Id, limit = 25): Promise<{ rows: ActionHistoryRow[]; storedAt?: number }> {
  const res = await callTool(
    SERVERS.customer360,
    TOOLS.actionHistory,
    { inputs: [{ accountId, limit }] },
    { read: true, cache: { staleTime: 15_000 } },
  );
  const slot = unwrapInvocable<Record<string, unknown>>(res.payload, 1)[0];
  if (!slot.ok) throw { code: "tool_error", message: slot.error, fix: slot.error };

  // OBSERVED SHAPE: a READ tool, so outputValues carries accountId / count /
  // entries directly. There is no ok/result wrapper — that belongs to the write
  // tools, whose outcome is a thing that either happened or did not.
  const raw = (slot.data as { entries?: unknown }).entries;
  const rows = Array.isArray(raw)
    ? raw.map((r) => toHistoryRow((r ?? {}) as Record<string, unknown>)).filter((r): r is ActionHistoryRow => r !== null)
    : [];
  return { rows, storedAt: res.cache?.storedAt };
}

/* --------------------------------------------------------------- mailbox */

export interface MailHit {
  id?: string;
  subject?: string;
  from?: string;
  receivedAt?: string;
  preview?: string;
  webLink?: string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Search the viewer's mailbox for messages naming this account.
 *  An empty array is an honest "nothing found", never an error. */
export async function searchMailbox(accountName: string): Promise<{ hits: MailHit[]; storedAt?: number }> {
  const res = await callTool(
    SERVERS.m365,
    TOOLS.mailSearch,
    { query: accountName },
    { read: true, cache: { staleTime: 60_000 } },
  );
  const rows = unwrapMail(res.payload);
  const hits: MailHit[] = rows.slice(0, 25).map((m) => ({
    id: str(m.id) ?? str(m.messageId),
    subject: str(m.subject),
    from: str(m.from) ?? str(m.sender) ?? str(m.fromAddress),
    receivedAt: str(m.receivedDateTime) ?? str(m.receivedAt) ?? str(m.date),
    preview: str(m.bodyPreview) ?? str(m.preview) ?? str(m.snippet),
    webLink: str(m.webLink) ?? str(m.link),
  }));
  return { hits, storedAt: res.cache?.storedAt };
}

/** Conservative entity resolution (mirrors the skill's intake rule): a message
 *  belongs to an account only when the account name clearly appears. */
export function matchesAccount(hit: MailHit, accountName: string): boolean {
  const needle = accountName
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|co|corp|group|company)\b/g, "")
    .trim();
  if (needle.length < 4) return false;
  const hay = `${hit.subject ?? ""} ${hit.preview ?? ""}`.toLowerCase();
  return hay.includes(needle);
}
