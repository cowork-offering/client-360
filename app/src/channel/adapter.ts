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

export type ChannelKind = "sendPrompt" | "callTool" | "none";

export interface AgentChannel {
  kind(): ChannelKind;
  available(): boolean;
  /** Fire-and-forget. Resolves once handed to the host; throws if no channel. */
  request(prompt: string, context: ChannelContext): Promise<void>;
}

type HostGlobals = {
  sendPrompt?: (text: string) => unknown;
  openai?: { callTool?: (name: string, args: unknown) => unknown };
};

function host(): HostGlobals {
  return (typeof window !== "undefined" ? window : {}) as HostGlobals;
}

function detectKind(): ChannelKind {
  const w = host();
  if (typeof w.sendPrompt === "function") return "sendPrompt";
  if (typeof w.openai?.callTool === "function") return "callTool";
  return "none";
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
      const kind = detectKind(); // A14 — re-detect at request time
      if (kind === "sendPrompt") {
        // The host may return a thenable; await it so a rejection becomes an
        // error state instead of a fake "handed off" (F9).
        try {
          await Promise.resolve(host().sendPrompt!(framePrompt(prompt, ctx)));
        } catch (e) {
          throw new Error("sendPrompt failed: " + String(e));
        }
        return;
      }
      if (kind === "callTool") {
        // EXPERIMENTAL relay — unverified host surface, isolated behind try/catch.
        try {
          await Promise.resolve(
            host().openai!.callTool!("cockpit_prompt", {
              prompt,
              requestId: ctx.requestId,
              context: { accountId: ctx.accountId, tab: ctx.tab },
            }),
          );
        } catch (e) {
          throw new Error("callTool relay failed: " + String(e));
        }
        return;
      }
      throw new Error("no agent channel");
    },
  };
}

/** Best-effort unique id for a chat request (A15). */
export function newRequestId(): string {
  const c = (typeof crypto !== "undefined" ? crypto : undefined) as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
