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

/**
 * Microsoft Graph returns `from` as `{emailAddress:{name,address}}`, not a
 * string, so a string-only reader rendered every sender blank. Both shapes are
 * real depending on which surface answered; parse both.
 */
export function readSender(v: unknown): string | undefined {
  const direct = str(v);
  if (direct) return direct;
  const obj = v as { emailAddress?: { name?: unknown; address?: unknown }; name?: unknown; address?: unknown } | null;
  const email = obj?.emailAddress ?? obj;
  return str(email?.name) ?? str(email?.address);
}

/** Search the viewer's mailbox for messages naming this account.
 *  An empty array is an honest "nothing found", never an error. */
export async function searchMailbox(accountName: string): Promise<{ hits: MailHit[]; storedAt?: number }> {
  const res = await callTool(
    SERVERS.m365,
    TOOLS.mailSearch,
    // Ask for the DISTINCTIVE token, not the full legal name: nobody types
    // "Hartwell Precision Manufacturing LLC" in a subject line.
    { query: mailboxQuery(accountName) },
    { read: true, cache: { staleTime: 60_000 } },
  );
  const rows = unwrapMail(res.payload);
  const hits: MailHit[] = rows.slice(0, 25).map((m) => ({
    id: str(m.id) ?? str(m.messageId),
    subject: str(m.subject),
    // `sender` is the observed field and arrives as a plain address string; the
    // Graph object shape is kept because both surfaces are real.
    from: readSender(m.sender) ?? readSender(m.from) ?? str(m.fromAddress),
    receivedAt: str(m.receivedDateTime) ?? str(m.sentDateTime) ?? str(m.receivedAt) ?? str(m.date),
    // OBSERVED: the body preview arrives as `summary`. The older keys stay as
    // fallbacks for whichever surface answers, but summary is the one this
    // search actually sends, and reading it wrong left every preview blank AND
    // hid the body text from the matcher.
    preview: str(m.summary) ?? str(m.bodyPreview) ?? str(m.preview) ?? str(m.snippet),
    webLink: str(m.webLink) ?? str(m.link),
  }));
  return { hits, storedAt: res.cache?.storedAt };
}

/**
 * Words that name a KIND of business, not a business.
 *
 * "Precision", "Manufacturing", "Holdings" are shared by half a commercial book,
 * so an email containing only these tells us nothing about which relationship it
 * belongs to. Hartwell Precision Manufacturing and Piedmont Precision Components
 * both answer to "precision"; attaching a mail to either on that basis would be
 * a guess wearing a match's clothes.
 */
const GENERIC_NAME_WORDS = new Set([
  "precision", "manufacturing", "industrial", "logistics", "components", "holdings",
  "group", "services", "solutions", "systems", "partners", "associates", "enterprises",
  "international", "national", "global", "capital", "financial", "investments",
  "properties", "brands", "foods", "works", "supply", "trading", "consulting",
  "technologies", "equipment", "materials", "products",
]);

/** Legal-form suffixes: they identify a company's wrapper, never the company. */
const LEGAL_SUFFIXES = /\b(inc|llc|ltd|co|corp|corporation|company|plc|lp|llp|sa|nv|bv|gmbh|ag)\b/g;

const cleanName = (accountName: string) =>
  accountName.toLowerCase().replace(/[.,]/g, "").replace(LEGAL_SUFFIXES, "").replace(/\s+/g, " ").trim();

/**
 * The one word that actually identifies this relationship.
 *
 * The lead token of the cleaned name, as long as it is long enough to be
 * distinctive and is not a word every other borrower shares. Returns null when
 * the name yields nothing distinctive, and a null token NEVER matches: no token,
 * no attachment.
 */
export function distinctiveToken(accountName: string): string | null {
  for (const token of cleanName(accountName).split(" ")) {
    if (token.length >= 5 && !GENERIC_NAME_WORDS.has(token)) return token;
  }
  return null;
}

/** What to ask the mailbox for. The full legal name matches almost nothing a
 *  human would actually type in a subject line. */
export function mailboxQuery(accountName: string): string {
  return distinctiveToken(accountName) ?? cleanName(accountName) ?? accountName;
}

/**
 * Does this message belong to this relationship?
 *
 * TWO TIERS, both conservative:
 *   STRONG  the full cleaned name appears as a phrase;
 *   TOKEN   the distinctive token appears in the subject, the preview or the
 *           sender.
 *
 * A generic word alone can never attach a message to anything. "Test for
 * Hartwell" belongs to Hartwell; "precision components" belongs to nobody.
 */
export function matchesAccount(hit: MailHit, accountName: string): boolean {
  const full = cleanName(accountName);
  const hay = `${hit.subject ?? ""} ${hit.preview ?? ""} ${hit.from ?? ""}`.toLowerCase();

  if (full.length >= 4 && hay.includes(full)) return true;

  const token = distinctiveToken(accountName);
  if (!token) return false;
  // Word-boundary, so "hartwellian" does not attach to Hartwell.
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);
}

