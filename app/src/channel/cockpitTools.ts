/* =============================================================================
   Typed cockpit operations over the connector layer.

   Each function owns ONE proven tool call plus its envelope unwrapping, so the
   components never touch `window.claude.mcp` or an envelope shape directly.
   Failures reject as {@link McpFailure} — already branchable, already carrying
   the fix copy for the affected section.
   ============================================================================= */

import type { BorrowerBundle, C360Data, Id } from "../data/contract";
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
