/* =============================================================================
   Agent channel adapter — the ONLY module that touches host runtime globals.

   The live mechanics are marked "retest live" in our notes (July Cowork runtime
   changes). Isolating them here means a runtime shift is a one-file fix; NEVER
   scatter window.sendPrompt / callTool calls anywhere else in the app.

   A14: the channel is RE-DETECTED on every request() (and every available()),
   not cached at mount — the host may inject sendPrompt after first paint.
   Primary channel is the direct child global window.sendPrompt(text). The
   callTool relay is EXPERIMENTAL and stays wrapped in try/catch.

   Reply model: requests are fire-and-forget. The agent replies by REPLACING the
   whole artifact with a fresh bundle carrying updated C360_DATA. Ephemeral UI
   state survives that replace via sessionStorage (state/persist.ts).
   ============================================================================= */

export interface ChannelContext {
  requestId: string;
  accountId?: string;
  accountName?: string;
  tab?: string;
}

/* Candidate bridge names. The first two are the documented/legacy surfaces;
   the `claude.*` ones are SPECULATIVE candidates added after the 2026-07-25
   live Cowork test showed window.sendPrompt is NOT exposed in that runtime.
   None of them is assumed to exist — each is probed and invoked defensively. */
export type ChannelKind =
  | "sendPrompt"
  | "claude.sendPrompt"
  | "claude.complete"
  | "claude.callTool"
  | "callTool"
  | "none";

export interface AgentChannel {
  kind(): ChannelKind;
  available(): boolean;
  /** Fire-and-forget. Resolves once handed to the host; throws if no channel. */
  request(prompt: string, context: ChannelContext): Promise<void>;
}

type Fn = (...args: unknown[]) => unknown;

type HostGlobals = {
  sendPrompt?: Fn;
  claude?: Record<string, unknown>;
  openai?: Record<string, unknown>;
};

function host(): HostGlobals {
  return (typeof window !== "undefined" ? window : {}) as HostGlobals;
}

/** Read a possibly-throwing nested global without ever propagating. */
function safe<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function fnAt(path: () => unknown): Fn | null {
  const v = safe(path);
  return typeof v === "function" ? (v as Fn) : null;
}

/** Invocation style. `text` bridges take the framed prompt string ONLY — we do
 *  not assume anything richer about an undocumented signature. `tool` bridges
 *  take the documented (name, args) shape. */
type Candidate = { kind: ChannelKind; style: "text" | "tool"; resolve: () => Fn | null };

const CANDIDATES: Candidate[] = [
  { kind: "sendPrompt", style: "text", resolve: () => fnAt(() => host().sendPrompt) },
  { kind: "claude.sendPrompt", style: "text", resolve: () => fnAt(() => host().claude?.sendPrompt) },
  { kind: "claude.complete", style: "text", resolve: () => fnAt(() => host().claude?.complete) },
  { kind: "claude.callTool", style: "tool", resolve: () => fnAt(() => host().claude?.callTool) },
  { kind: "callTool", style: "tool", resolve: () => fnAt(() => host().openai?.callTool) },
];

function detectCandidate(): Candidate | null {
  for (const c of CANDIDATES) if (c.resolve()) return c;
  return null;
}

function detectKind(): ChannelKind {
  return detectCandidate()?.kind ?? "none";
}

/** Frame the ask with its context AND its request id (A15 / F8) so the agent
 *  can echo the id back on the reply — that echo is what lets the merge dedupe
 *  the locally-shown message instead of duplicating it. */
function framePrompt(prompt: string, ctx: ChannelContext): string {
  const parts = [
    ctx.accountName ? `account: ${ctx.accountName}` : null,
    ctx.accountId ? `id: ${ctx.accountId}` : null,
    ctx.tab ? `tab: ${ctx.tab}` : null,
    `requestId: ${ctx.requestId}`,
  ].filter(Boolean);
  return `${prompt} [${parts.join(" · ")}]`;
}

export function createChannel(): AgentChannel {
  return {
    kind: detectKind,
    available: () => detectKind() !== "none",
    async request(prompt, ctx) {
      // A14 — re-detect at request time, never cached from mount.
      const candidate = detectCandidate();
      if (!candidate) throw new Error("no agent channel");

      const fn = candidate.resolve();
      if (!fn) throw new Error("no agent channel");

      // Every bridge is invoked defensively: the host may return a thenable, so
      // await it (F9) — a rejection becomes an error state, never a fake
      // "handed off". Signature assumptions stay minimal (see Candidate).
      try {
        const result =
          candidate.style === "text"
            ? fn(framePrompt(prompt, ctx))
            : fn("cockpit_prompt", {
                prompt,
                requestId: ctx.requestId,
                context: { accountId: ctx.accountId, tab: ctx.tab },
              });
        await Promise.resolve(result);
      } catch (e) {
        throw new Error(
          candidate.kind === "sendPrompt" ? "sendPrompt failed: " + String(e) : `${candidate.kind} relay failed: ` + String(e),
        );
      }
    },
  };
}

/** Best-effort unique id for a chat request (A15). */
export function newRequestId(): string {
  const c = (typeof crypto !== "undefined" ? crypto : undefined) as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/* =============================================================================
   CHANNEL DIAGNOSTICS PROBE (2026-07-25)

   The live Cowork test showed `window.sendPrompt` is NOT exposed in that
   runtime, so the real bridge is unknown. This probe reports what the host
   ACTUALLY exposes so we can wire the true channel from evidence instead of
   guessing. Purely diagnostic: it reads, never calls, never mutates.

   Every read is individually try/caught — cross-origin access on `window.parent`
   throws by design, and a hostile/exotic global must never break the render.
   ============================================================================= */

export interface ProbeEntry {
  name: string;
  present: boolean;
  type: string;
  /** Own enumerable-ish keys, for objects worth expanding. */
  keys?: string[];
  /** Readable rendering of a primitive / computed result (the payload for
   *  entries whose VALUE is the finding, e.g. the matching-globals list). */
  value?: string;
  /** Populated when the read itself threw (e.g. cross-origin). */
  error?: string;
}

/** Globals worth surfacing by name, however they are spelled. */
const GLOBAL_PATTERN = /claude|cowork|artifact|calltool|sendprompt|anthropic/i;

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Own property names of an object, with functions marked, capped for sanity. */
function keysOf(obj: unknown): string[] | undefined {
  const o = safe(() => Object.getOwnPropertyNames(obj as object));
  if (!o) return undefined;
  return o
    .slice(0, 60)
    .map((k) => {
      const t = safe(() => describe((obj as Record<string, unknown>)[k]));
      return t === "function" ? `${k}()` : `${k}:${t ?? "?"}`;
    });
}

/** Compact, readable rendering of a probe result's VALUE. */
function renderValue(value: unknown, type: string): string | undefined {
  if (type === "array") {
    const arr = value as unknown[];
    return arr.length ? arr.map(String).join(", ") : "(none)";
  }
  if (type === "object") {
    const o = safe(() =>
      Object.entries(value as Record<string, unknown>)
        .slice(0, 12)
        .map(([k, v]) => `${k}=${describe(v) === "object" ? "{…}" : String(v)}`)
        .join(", "),
    );
    return o || undefined;
  }
  if (type === "function") return undefined;
  return safe(() => String(value));
}

/** `expandKeys` = "this is a HOST OBJECT, show me what it exposes".
 *  Otherwise the computed VALUE is the finding (frame state, global list, …). */
function entry(name: string, read: () => unknown, expandKeys = false): ProbeEntry {
  try {
    const value = read();
    const type = describe(value);
    const present = value !== undefined && value !== null;
    const expand = expandKeys && present && (type === "object" || type === "function");
    const rendered = present ? renderValue(value, type) : undefined;
    return {
      name,
      present,
      type,
      keys: expand ? keysOf(value) : undefined,
      value: expand ? undefined : rendered === "" ? "(empty)" : rendered,
    };
  } catch (e) {
    return { name, present: false, type: "unknown", error: String(e) };
  }
}

/** Inspect the host runtime and return a structured, log-safe report. */
export function probeChannels(): ProbeEntry[] {
  if (typeof window === "undefined") {
    return [{ name: "window", present: false, type: "undefined", error: "no window (non-browser env)" }];
  }
  const w = window as unknown as Record<string, unknown>;
  const out: ProbeEntry[] = [];

  // 1. The documented surface + the candidate bridges.
  out.push(entry("window.sendPrompt", () => w.sendPrompt, true));
  out.push(entry("window.claude", () => w.claude, true));
  out.push(entry("window.openai", () => w.openai, true));

  // 2. Frame relationship — parent access may legitimately throw cross-origin.
  out.push(
    entry("window.parent !== window", () => {
      const isFramed = window.parent !== window;
      // Touch a parent property to see whether access is actually permitted.
      const probe = safe(() => (window.parent as unknown as Record<string, unknown>).location);
      return { framed: isFramed, parentAccessible: probe !== undefined };
    }),
  );
  out.push(entry("window.top !== window", () => window.top !== window));

  // 3. Anything else on window that smells like a host bridge.
  out.push(
    entry("matching globals", () => {
      const names = safe(() => Object.getOwnPropertyNames(window)) ?? [];
      const hits = names.filter((n) => GLOBAL_PATTERN.test(n)).slice(0, 40);
      return hits.map((n) => `${n}:${safe(() => describe(w[n])) ?? "?"}`);
    }),
  );

  // 4. Origin context — tells us whether we are sandboxed/opaque.
  out.push(entry("location.origin", () => safe(() => location.origin) ?? "unreadable"));
  out.push(entry("document.referrer", () => safe(() => document.referrer) ?? "unreadable"));
  out.push(entry("detected channel", () => detectKind()));

  return out;
}

/** One-line-per-entry rendering for the UI disclosure and the console. */
export function formatProbe(report: ProbeEntry[]): string {
  return report
    .map((e) => {
      const state = e.present ? e.type : e.type === "unknown" ? "ERROR" : "absent";
      const lines = [`${e.name}: ${state}${e.value ? ` = ${e.value}` : ""}`];
      if (e.error) lines.push(`    ! ${e.error}`);
      if (e.keys?.length) lines.push(`    { ${e.keys.join(", ")} }`);
      return lines.join("\n");
    })
    .join("\n");
}
