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

function mcp(): McpNamespace | undefined {
  if (typeof window === "undefined") return undefined;
  // The canonical availability gate — the MEMBER, not the root. It cannot
  // throw, and it is the only check valid on every runtime generation.
  // Never feature-detect by probing with a call.
  return (window as unknown as { claude?: { mcp?: McpNamespace } }).claude?.mcp;
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
  searchAccounts: "Customer360SearchAccounts",
  // The durable action trail. Read-only; deploying in parallel with this UI.
  actionHistory: "Customer360ActionHistory",
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
      return `You have more than one ${server} connector — choose one when claude.ai prompts.`;
    case "server_not_found":
      return `${server} no longer exists upstream. Check the connector in claude.ai Settings.`;
    case "server_unavailable":
      return `${server} is briefly unreachable. Showing the last good data — try again in a moment.`;
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
      return "The workspace paused AI chat for this page session — a platform safety limit, not the Gateway and not your bank's policy. Reload the cockpit to continue; your place is kept.";
    case "approval_required":
      return `${tool} needs per-call approval, which artifacts don't support yet.`;
    case "tool_error":
      return `${server} ran ${tool} but reported a failure.`;
    case "bad_request":
    case "transform_error":
      return `The cockpit sent a malformed request to ${server} — this is a bug, not your setup.`;
    case "cancelled":
      return `Cancelled before it finished — it may still have run.`;
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
export function unwrapMail(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  const p = (payload ?? {}) as { results?: unknown; messages?: unknown; value?: unknown };
  for (const candidate of [p.results, p.messages, p.value]) {
    if (Array.isArray(candidate)) return candidate as Array<Record<string, unknown>>;
  }
  return [];
}
