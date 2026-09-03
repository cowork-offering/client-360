/* =============================================================================
   window.claude.mcp — the live connector layer (runtime contract 0.1.15).

   Written against the platform type definitions, not from memory. Two arms:
   `callTool` for actions/one-shot reads, `watchTool` for data that must stay
   current. Calls run with the VIEWER's credentials; this page never sees tokens.

   FAILURE DESIGN IS NOT OPTIONAL. Connector calls fail routinely (lapsed auth,
   a connector the viewer never added, a briefly unreachable upstream) and each
   code has a different correct response. Collapsing them into one generic
   banner is the named anti-pattern: it hides the single action that would fix
   the page. `describeFailure()` below is the one place that mapping lives.
   ============================================================================= */

/* ---------------------------------------------------------------- ambient */

interface McpCallResult {
  content?: Array<Record<string, unknown>>;
  structuredContent?: unknown;
  payload?: unknown;
  cache?: { storedAt: number; revalidating: boolean };
}

type WatchEvent = { type: "data"; result: McpCallResult } | { type: "error"; error: unknown };

interface McpNamespace {
  callTool(server: string, tool: string, input?: unknown, options?: unknown): Promise<McpCallResult>;
  watchTool(
    server: string,
    tool: string,
    input: unknown,
    handler: (ev: WatchEvent) => void,
    options?: { cache?: { staleTime?: number; gcTime?: number }; refetchInterval?: number },
  ): () => void;
  listTools(): Promise<{ servers: Array<{ server: string; authStatus: string; tools: Array<{ name: string }> }> }>;
  invalidate(server?: string, tool?: string, input?: unknown): Promise<void>;
}

/* RUNTIME CONTRACT SHIFT (observed live 2026-08-29, probe on the 0.2.31 line):
   the platform stopped pre-injecting `window.claude.mcp`. The runtime now
   exposes ONLY `window.claude.use(name)`, which resolves the capability
   namespace asynchronously — same members (callTool/listTools/invalidate/
   watchTool), new acquisition. `acquireMcp()` below handles BOTH generations:
   a pre-injected `.mcp` (older runtimes, and every test that stubs it) wins
   immediately; otherwise `use("mcp")` is awaited once and stashed. main.tsx
   awaits acquisition before first render so the synchronous `mcpAvailable()`
   gate keeps its meaning everywhere downstream. */

type ClaudeRoot = { mcp?: McpNamespace; use?: (name: string) => Promise<McpNamespace | null> };

let acquired: McpNamespace | undefined;
let acquisition: Promise<void> | undefined;

export function acquireMcp(timeoutMs = 4000): Promise<void> {
  if (acquisition) return acquisition;
  acquisition = (async () => {
    if (typeof window === "undefined") return;
    const root = (window as unknown as { claude?: ClaudeRoot }).claude;
    if (!root) return;
    if (root.mcp) {
      acquired = root.mcp;
      return;
    }
    if (typeof root.use !== "function") return;
    try {
      const ns = await Promise.race([
        root.use("mcp"),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      if (ns && typeof ns.callTool === "function") acquired = ns;
    } catch {
      // Unavailable is a state, not an error: the offline chip renders.
    }
  })();
  return acquisition;
}

function mcp(): McpNamespace | undefined {
  if (acquired) return acquired;
  if (typeof window === "undefined") return undefined;
  // Older runtimes (and tests) pre-inject the member; honor it synchronously.
  return (window as unknown as { claude?: ClaudeRoot }).claude?.mcp;
}

export function mcpAvailable(): boolean {
  return mcp() !== undefined;
}

/* ------------------------------------------------------- manifest constants */

/** Connector DISPLAY NAMES — the `server` argument. Never a connector id. */
export const SERVERS = {
  customer360: "Customer 360",
  gateway: "IDB Gateway",
  m365: "Microsoft 365",
} as const;

/** Upstream tool names exactly as `listTools()` returns them.
 *  NOTE: colons are invalid in manifest tool names (422 at publish). */
export const TOOLS = {
  snapshot: "Customer360Snapshot",
  portfolio: "Customer360Portfolio",
  graph: "Customer360RelationshipGraph",
  exposure: "Customer360Exposure",
  covenants: "Customer360Covenants",
  opportunities: "Customer360Opportunities",
  structuralSignals: "Customer360StructuralSignals",
  /* THE BOOK IS THE ORG'S BOOK (2026-09-03). Partial-name account search, and
     the door to every relationship this snapshot did not bake. IN THE MANIFEST
     as of this wave: the Customer 360 grant is 25 tools with this one in it
     (design/proposals/intent-handoff-addendum.md carries the exact declaration
     for the integrator). OBSERVED SHAPE:
       input  { name, industry?, maxResults? }   maxResults defaults to 25
       output { count, results: [{ accountId, name, industry, naicsCode,
                annualRevenue }] }
     A READ, and the only figures it carries are labels: everything the cockpit
     renders about a relationship comes off the eight reads that follow, never
     off the search hit. */
  searchAccounts: "Customer360SearchAccounts",
  // The durable action trail. Read-only; deploying in parallel with this UI.
  actionHistory: "Customer360ActionHistory",
  /* THE ORG'S OWN CHIP SETS, deployed 2026-09-02 as the 25th tool on the
     Customer 360 definition. One read, no input, every picklist and both lookup
     catalogs the create grammar draws chips from. Read-only: one
     @InvocableMethod, WITH USER_MODE on both queries, no DML anywhere.

     THE CONNECTOR'S TOOL LIST CHANGED WHEN THE DEFINITION DEPLOYED, so the
     client's tool-schema cache needs a fresh session before this name resolves.
     Until it does, `readCatalog` returns null and every chip set falls back to
     the shell's mirror, which is where they have been since the room shipped. */
  catalog: "Customer360Catalog",
  boomRatios: "boom-mcp-js___boom_get_ratios",
  boomSpread: "boom-mcp-js___boom_get_spread",
  llm: "idb-bg-api-target-get-llm-response-staging___get_llm_response",
  mailSearch: "outlook_email_search",
  // WP5 write tools, deployed 2026-07-26. stage_* performs ZERO domain DML;
  // every org write is behind the token-gated execute_*.
  stageCollateralValuation: "stage_collateral_valuation",
  executeCollateralValuation: "execute_collateral_valuation",
  stageServiceRequest: "stage_service_request",
  executeServiceRequest: "execute_service_request",
  stageAnnualReview: "stage_annual_review",
  executeAnnualReview: "execute_annual_review",
  // Wave 2. Built against the frozen contracts; the seam swaps on observation.
  stageNewFacility: "stage_new_facility",
  executeNewFacility: "execute_new_facility",
  stageRiskRatingReview: "stage_risk_rating_review",
  executeRiskRatingReview: "execute_risk_rating_review",
  stageCovenantReview: "stage_covenant_review",
  executeCovenantReview: "execute_covenant_review",
  // WS0.5, deployed 2026-08-22. The modification pair is complete: executing a
  // staged plan clones the facility, writes the chain junction row and applies
  // the changes to the clone. BOOKING that clone is still nCino's own Submit
  // for Approval run (LV06), which the plan's warnings state.
  stageLoanModification: "stage_loan_modification",
  executeLoanModification: "execute_loan_modification",
  /* RELATIONSHIP INTAKE (2026-09-03). The pair that authors on the relationship:
     a covenant with an account junction and no loan junction, and a collateral
     asset with its ownership junction and no pledge. Built to the frozen
     contract; the connector publishes it when the definition deploys, and until
     it does the room reports the tool as unavailable rather than pretending. */
  stageRelationshipIntake: "stage_relationship_intake",
  executeRelationshipIntake: "execute_relationship_intake",
  /* THE SECOND HOP FOR A NET-NEW FACILITY'S PURPOSE (2026-09-03).
     `LLC_BI__Primary_Loan_Purpose__c` lives on `LLC_BI__Loan_Detail__c`, which
     nCino creates from an after-commit flow of its own, so nothing in the
     transaction that files the facility can set it. This finishes it, in its own
     hop so the 2026-08-31 governor fix stays intact. */
  completeNewFacilityDetail: "complete_new_facility_detail",
  // Renewal STAGES only. There is no execute_renewal: the clone's collateral
  // aggregate has never been re-probed, so no execute tool was built.
  stageRenewal: "stage_renewal",
} as const;

/** The six per-account detail tools, in the order the app stages them. */
export const DETAIL_TOOLS = [
  TOOLS.snapshot,
  TOOLS.graph,
  TOOLS.exposure,
  TOOLS.covenants,
  TOOLS.opportunities,
  TOOLS.structuralSignals,
] as const;

/* ---------------------------------------------------------- error doctrine */

export type McpErrorCode =
  | "needs_reauth"
  | "server_not_connected"
  | "selection_required"
  | "server_not_found"
  | "server_unavailable"
  | "not_in_manifest"
  | "blocked_by_policy"
  | "approval_required"
  | "tool_error"
  | "bad_request"
  | "cancelled"
  | "rate_limited"
  | "upstream_error"
  | "not_granted"
  | "capability_disabled"
  | "capability_removed"
  | "transform_error";

export interface McpFailure {
  code: McpErrorCode;
  server?: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  /** Copy telling the viewer the ONE action that fixes this state. */
  fix: string;
  /** Authz denial ⇒ rendered data must be RETRACTED, not left stale. */
  retract: boolean;
  /** No connector bridge in this view at all ⇒ render the no-MCP experience. */
  noCapability: boolean;
  /** Outcome genuinely unknown — the tool may still have run. Never auto-retry
   *  a write in this state; re-issue only behind a fresh user gesture. */
  ambiguous: boolean;
}

const RETRACT_CODES = new Set<McpErrorCode>([
  "needs_reauth",
  "server_not_connected",
  "blocked_by_policy",
  "approval_required",
]);

const NO_CAPABILITY_CODES = new Set<McpErrorCode>(["not_granted", "capability_disabled", "capability_removed"]);

/** Outcome-unknown for writes (a rejection is NOT proof the tool did not run). */
const AMBIGUOUS_CODES = new Set<McpErrorCode>(["server_unavailable", "upstream_error", "cancelled"]);

function fixCopy(code: McpErrorCode, server: string, tool: string): string {
  switch (code) {
    case "needs_reauth":
      return `Reconnect ${server} in claude.ai Settings → Connectors.`;
    case "server_not_connected":
      return `Add ${server} in claude.ai Settings → Connectors.`;
    case "selection_required":
      return `You have more than one ${server} connector. Choose one when claude.ai prompts.`;
    case "server_not_found":
      return `${server} no longer exists upstream. Check the connector in claude.ai Settings.`;
    case "server_unavailable":
      return `${server} is briefly unreachable. Showing the last good data. Try again in a moment.`;
    case "not_in_manifest":
      return `This cockpit isn't authorised to call ${tool} on ${server}.`;
    case "blocked_by_policy":
      // NOT an org policy and NOT the connector. Settled diagnosis: this is the
      // claude.ai shell's per-page-session trust budget on the artifact-to-
      // connector bridge — it burns with call volume and payload shape, hides
      // the whole connector from the page when tripped, and expires on its own.
      // Blaming "your organisation's policy" alarmed bankers and sent them
      // hunting a non-existent IT ticket, so the copy names the real cause and
      // the real fix.
      return "The workspace paused AI chat for this page session. That is a platform safety limit, not the Gateway and not your bank's policy. Reload the cockpit to continue; your place is kept.";
    case "approval_required":
      return `${tool} needs per-call approval, which artifacts don't support yet.`;
    case "tool_error":
      return `${server} ran ${tool} but reported a failure.`;
    case "bad_request":
    case "transform_error":
      return `The cockpit sent a malformed request to ${server}. This is a bug, not your setup.`;
    case "cancelled":
      return `Cancelled before it finished. It may still have run.`;
    case "rate_limited":
      return `Too many connector calls just now. Wait a moment and retry.`;
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return `This view is running without connector access.`;
    default:
      return `${server} couldn't complete ${tool}.`;
  }
}

/** Normalize an unknown rejection into the branchable failure shape. */
export function describeFailure(err: unknown, server: string, tool: string): McpFailure {
  const e = (err ?? {}) as { code?: string; server?: string; message?: string; retryable?: boolean; retryAfterMs?: number };
  // Unknown codes are treated as upstream_error, per the contract.
  const known: McpErrorCode[] = [
    "needs_reauth", "server_not_connected", "selection_required", "server_not_found", "server_unavailable",
    "not_in_manifest", "blocked_by_policy", "approval_required", "tool_error", "bad_request", "cancelled",
    "rate_limited", "upstream_error", "not_granted", "capability_disabled", "capability_removed", "transform_error",
  ];
  const code = (known.includes(e.code as McpErrorCode) ? e.code : "upstream_error") as McpErrorCode;
  return {
    code,
    server: e.server ?? server,
    message: e.message ?? String(err),
    // Trust ONLY the platform's stamp — never infer retryability from the code.
    retryable: e.retryable === true,
    retryAfterMs: e.retryAfterMs,
    fix: fixCopy(code, e.server ?? server, tool),
    retract: RETRACT_CODES.has(code),
    noCapability: NO_CAPABILITY_CODES.has(code),
    ambiguous: AMBIGUOUS_CODES.has(code),
  };
}

/* -------------------------------------------------------------- call layer */

export interface McpOk<T> {
  payload: T;
  /** Present only when served from cache. Drive "last updated" from
   *  `cache.storedAt` — NEVER Date.now(). Absent ⇒ executed fresh. */
  cache?: { storedAt: number; revalidating: boolean };
  raw: McpCallResult;
}

export interface CallOptions {
  /** Reads may be retried once when the platform stamps `retryable`.
   *  Writes never auto-retry: a rejection is not proof the tool did not run. */
  read?: boolean;
  cache?: false | { staleTime?: number; gcTime?: number; refresh?: boolean };
  signal?: AbortSignal;
}

const jitter = (ms: number) => ms + Math.floor(Math.random() * 250);

/** Call a connector tool. Resolves with the unwrapped envelope, or rejects
 *  with a normalized {@link McpFailure} — never a raw platform error. */
export async function callTool<T = unknown>(
  server: string,
  tool: string,
  input?: unknown,
  options: CallOptions = {},
): Promise<McpOk<T>> {
  const api = mcp();
  if (!api) {
    throw describeFailure({ code: "capability_disabled", message: "window.claude.mcp is not available" }, server, tool);
  }

  const invoke = async (): Promise<McpOk<T>> => {
    const result = await api.callTool(server, tool, input, {
      cache: options.cache,
      signal: options.signal,
    });
    return { payload: result.payload as T, cache: result.cache, raw: result };
  };

  try {
    return await invoke();
  } catch (err) {
    const failure = describeFailure(err, server, tool);
    // AT MOST one retry, reads only, only when the platform stamped it.
    if (options.read && failure.retryable) {
      const delay = Math.min(failure.retryAfterMs ?? 400, 60_000);
      await new Promise((r) => setTimeout(r, jitter(delay)));
      try {
        return await invoke();
      } catch (err2) {
        throw describeFailure(err2, server, tool);
      }
    }
    throw failure;
  }
}

/** Register a live subscription. Returns a SYNCHRONOUS unsubscribe; store it
 *  before anything can fire. All failures — registration included — arrive on
 *  the handler as error events, so the caller keeps its static experience. */
export function watchTool(
  server: string,
  tool: string,
  input: unknown,
  handler: (ev: { data?: McpOk<unknown>; failure?: McpFailure }) => void,
  options?: { staleTime?: number; refetchInterval?: number },
): () => void {
  const api = mcp();
  if (!api) {
    handler({ failure: describeFailure({ code: "capability_disabled" }, server, tool) });
    return () => {};
  }
  try {
    return api.watchTool(
      server,
      tool,
      input,
      (ev) => {
        if (ev.type === "data") {
          handler({ data: { payload: ev.result.payload, cache: ev.result.cache, raw: ev.result } });
        } else {
          handler({ failure: describeFailure(ev.error, server, tool) });
        }
      },
      {
        cache: options?.staleTime !== undefined ? { staleTime: options.staleTime } : undefined,
        // Polling is clamped to a ~30s floor by the platform; never go tighter.
        refetchInterval: options?.refetchInterval,
      },
    );
  } catch (e) {
    handler({ failure: describeFailure(e, server, tool) });
    return () => {};
  }
}

/* ------------------------------------------------------ envelope unwrapping

   OBSERVED shapes (founder's live session 2026-07-25). Each unwrapper is
   defensive: an envelope that does not match reports a failure rather than
   silently yielding undefined figures.                                      */

/** One element of the Salesforce invocable envelope. */
export type InvocableSlot<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Customer 360 tools return the SALESFORCE INVOCABLE ENVELOPE:
 *   { content: [ { actionName, isSuccess, errors, outputValues, sortOrder, version } ] }
 * One element per request in the inputs array, POSITIONAL — element i belongs
 * to input i. `isSuccess: false` / non-null `errors` is a per-element failure
 * and must not contaminate its siblings.
 */
export function unwrapInvocable<T = Record<string, unknown>>(payload: unknown, expected?: number): Array<InvocableSlot<T>> {
  const content = (payload as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) {
    return Array.from({ length: expected ?? 1 }, () => ({
      ok: false as const,
      error: "unexpected envelope: no content[] array",
    }));
  }
  const slots = content.map((el): InvocableSlot<T> => {
    const e = (el ?? {}) as { isSuccess?: boolean; errors?: unknown; outputValues?: T };
    const failed = e.isSuccess === false || (e.errors != null && e.errors !== "");
    if (failed) {
      const msg = Array.isArray(e.errors) ? e.errors.join("; ") : String(e.errors ?? "action reported failure");
      return { ok: false, error: msg };
    }
    if (!e.outputValues) return { ok: false, error: "element carried no outputValues" };
    return { ok: true, data: e.outputValues };
  });
  // Positional integrity: a short envelope must not silently misalign inputs.
  if (expected !== undefined && slots.length !== expected) {
    return Array.from({ length: expected }, (_, i) =>
      slots[i] ?? { ok: false as const, error: `envelope returned ${slots.length} elements for ${expected} inputs` },
    );
  }
  return slots;
}

/** Convenience for the single-input case. */
export function unwrapInvocableOne<T = Record<string, unknown>>(payload: unknown): InvocableSlot<T> {
  return unwrapInvocable<T>(payload, 1)[0];
}

export interface LlmAnswer {
  text: string;
  model?: string;
  costUsd?: number;
}

/**
 * get_llm_response returns { statusCode, headers, body: "<JSON STRING>" }.
 * The body must be JSON.parsed; `.response` is markdown TEXT which we render
 * as plain text (A13 — never as HTML/Markdown).
 */
export function unwrapLlm(payload: unknown): LlmAnswer {
  const env = (payload ?? {}) as { statusCode?: number; body?: unknown };
  const raw = env.body;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A non-JSON body is still an answer — surface the text rather than fail.
      return { text: raw };
    }
  }
  const b = (parsed ?? {}) as { response?: unknown; model?: unknown; cost_usd?: unknown };
  const text = typeof b.response === "string" ? b.response : typeof parsed === "string" ? parsed : "";
  return {
    text,
    model: typeof b.model === "string" ? b.model : undefined,
    costUsd: typeof b.cost_usd === "number" ? b.cost_usd : undefined,
  };
}

/** outlook_email_search returns a list; [] is an honest "no matches". */
/** Fields that make a row a MESSAGE rather than an envelope artefact. */
const MESSAGE_FIELDS = ["subject", "id", "internetMessageId", "sender", "receivedDateTime", "webLink", "summary"];

function looksLikeMessage(row: Record<string, unknown>): boolean {
  return MESSAGE_FIELDS.some((f) => row[f] !== undefined);
}

const isRow = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Every shape the mail search has actually answered in.
 *
 * LIVE DEFECT 2026-07-27: a search matching exactly ONE email returns a single
 * BARE OBJECT — not an array, not `{value}`. This returned [] and the sweep
 * reported "nothing new", which is precisely the founder's one-test-email case:
 * the tool found the mail and the cockpit threw it away.
 *
 * So: an array passes through; a wrapper key is unwrapped; a bare object is a
 * list of one; a string payload is parsed as JSON and then, failing that, as
 * JSONL. A trailing paging row is dropped rather than rendered as a message
 * with no subject.
 */
export function unwrapMail(payload: unknown): Array<Record<string, unknown>> {
  // A paging tail carries no message fields, so the same predicate drops it:
  // one rule, rather than a list of shapes to keep in step.
  return collectMailRows(payload).filter(looksLikeMessage);
}

function collectMailRows(payload: unknown): Array<Record<string, unknown>> {
  if (payload === null || payload === undefined) return [];
  if (Array.isArray(payload)) return payload.filter(isRow);

  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return [];
    try {
      return collectMailRows(JSON.parse(text));
    } catch {
      // JSONL: one JSON document per line, which is how some gateways stream
      // multiple results. A line that will not parse is skipped, not guessed at.
      const rows: Array<Record<string, unknown>> = [];
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          rows.push(...collectMailRows(parsed));
        } catch {
          /* not a document; skip */
        }
      }
      return rows;
    }
  }

  if (!isRow(payload)) return [];

  const p = payload as { results?: unknown; messages?: unknown; value?: unknown; items?: unknown };
  for (const candidate of [p.results, p.messages, p.value, p.items]) {
    if (Array.isArray(candidate)) return candidate.filter(isRow);
    // A wrapper around a single result is still a single result.
    if (isRow(candidate)) return [candidate];
    if (typeof candidate === "string") return collectMailRows(candidate);
  }

  // A BARE MESSAGE OBJECT: the observed single-match shape. An object with no
  // message fields at all is an empty envelope, not a message.
  return looksLikeMessage(payload) ? [payload] : [];
}
