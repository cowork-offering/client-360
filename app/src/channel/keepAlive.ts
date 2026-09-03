import { useEffect } from "react";
import { callTool, connectorBusy, lastConnectorCallAt, mcpAvailable, SERVERS, TOOLS } from "./mcp";

/* =============================================================================
   THE KEEP-ALIVE

   WHY THIS EXISTS: the Salesforce-hosted MCP session expires on idle. The first
   call after a pause fails `server_unavailable` (stamped retryable), the
   connector re-handshakes, and a retry succeeds seconds later. Retrying is the
   cure; not being the one who pays for it is better. So while the cockpit is
   open, one cheap read keeps the session warm, and the cold-start failure lands
   on the ping rather than on the banker's Sync or on the home view's watch.

   RULES, all of them load-bearing:
     - ONE cheap READ, never a write, and never a tool that changes anything.
     - UNCACHED: a cached hit would be served without touching the org, which is
       the one thing this call exists to do.
     - SILENT. Its result is discarded and its failure never renders. A ping
       that reported would be a second, worse banner.
     - Never while the page is hidden, never while another call is in flight,
       and never when a real call has already warmed the session inside the
       window. The cheapest keep-alive is the one that does not happen.
   ============================================================================= */

/** Comfortably inside the observed idle expiry, and one call every four
 *  minutes is a rounding error against a single sweep's nine. */
export const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;

/** A name search with a fixed short token and one row: the lightest read on the
 *  Customer 360 definition. Customer360SearchAccounts turns `maxResults` into
 *  the SOQL LIMIT, so this is one Account row of labels. No signals, no
 *  aggregates, nothing the Portfolio read carries. */
export const KEEPALIVE_INPUT = { inputs: [{ name: "zz", maxResults: 1 }] };

export interface KeepAliveOptions {
  intervalMs?: number;
  /** When the connector last heard from this page. Injected for tests. */
  lastCallAt?: () => number;
  /** Injected for tests. Resolves or rejects; the caller ignores both. */
  ping?: () => Promise<unknown>;
}

const defaultPing = () =>
  callTool(
    SERVERS.customer360,
    TOOLS.searchAccounts,
    KEEPALIVE_INPUT,
    // `read: true` so the ONE shared retry policy applies: if the ping is the
    // call that finds the session expired, its own retry is what re-warms it.
    { read: true, cache: false },
  );

/**
 * Start the keep-alive. Returns a stop function; calling it is idempotent.
 *
 * Nothing here surfaces: a caller gets no state back, because there is no
 * state a banker should ever see.
 */
export function startKeepAlive(options: KeepAliveOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? KEEPALIVE_INTERVAL_MS;
  const ping = options.ping ?? defaultPing;
  const lastCallAt = options.lastCallAt ?? lastConnectorCallAt;

  let stopped = false;
  let inFlight = false;
  let lastPingAt = Date.now();

  const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

  /** A real call in the window already did this job. */
  const warmedRecently = () => Date.now() - Math.max(lastPingAt, lastCallAt()) < intervalMs;

  const tick = () => {
    if (stopped || inFlight || hidden()) return;
    // Another call is talking to the connector right now: it is the keep-alive.
    if (connectorBusy() || warmedRecently()) return;
    inFlight = true;
    lastPingAt = Date.now();
    void (async () => {
      try {
        await ping();
      } catch {
        // SILENT BY DESIGN. Absorbing the failure is the whole point.
      }
      inFlight = false;
    })();
  };

  const timer = setInterval(tick, intervalMs);

  // Coming back to a page that sat hidden for an hour is exactly the cold start
  // this exists for, so catch up on return rather than waiting a full interval.
  const onVisibility = () => {
    if (!hidden()) tick();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Mount the keep-alive for as long as the cockpit is open with a live
 *  connector. No connector, no ping. */
export function useKeepAlive(): void {
  const enabled = mcpAvailable();
  useEffect(() => {
    if (!enabled) return;
    return startKeepAlive();
  }, [enabled]);
}
