import { useCallback, useEffect, useState } from "react";
import type { Portfolio } from "../data/contract";
import { SERVERS, TOOLS, unwrapInvocableOne, watchTool, type McpFailure } from "./mcp";

export interface LivePortfolio {
  portfolio?: Portfolio;
  failure?: McpFailure;
  /** From result.cache.storedAt, never Date.now(). */
  storedAt?: number;
  /** A re-registration the banker asked for is in flight. */
  retrying?: boolean;
  /** Re-register the watch: the banker's own gesture on the banner. */
  retry?: () => void;
}

/** The book does not move second to second, so this sits well above the
 *  platform's ~30s polling floor. It exists so an expired MCP session heals
 *  itself: the watch re-reads on its own and the next good event clears the
 *  banner, instead of the failure standing until the view remounts. */
export const PORTFOLIO_REFETCH_MS = 60_000;

/** Keep the home KPI band current from Customer360Portfolio.
 *
 *  This is the DISPLAY arm: watchTool replays the cached entry, refreshes when
 *  stale, and delivers every newer result. The watch layer retries a retryable
 *  failure once before it reports anything, so a connector re-handshake after
 *  an idle session never reaches the banker at all.
 *
 *  Failures never blank the band: a transient error keeps the last good data
 *  with a staleness note, and only an authz denial retracts it. */
export function useLivePortfolio(enabled: boolean): LivePortfolio {
  const [live, setLive] = useState<LivePortfolio>({});
  // Bumped by the banner's Retry: a new value tears the watch down and
  // registers it again, which is the only way to recover a registration that
  // failed outright.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setLive((prev) => ({ ...prev, retrying: true }));
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Store the (synchronous) unsubscribe before anything can fire.
    const stop = watchTool(
      SERVERS.customer360,
      TOOLS.portfolio,
      { inputs: [{}] },
      (ev) => {
        if (ev.failure) {
          setLive((prev) =>
            // Authz denial ⇒ retract rendered data. Transient ⇒ keep last good.
            ev.failure!.retract
              ? { failure: ev.failure, retrying: false }
              : { ...prev, failure: ev.failure, retrying: false },
          );
          return;
        }
        const slot = unwrapInvocableOne<Portfolio>(ev.data?.payload);
        if (!slot.ok) {
          setLive((prev) => ({ ...prev, failure: undefined, retrying: false }));
          return;
        }
        // A good event is what clears the banner. Nothing else does.
        setLive({ portfolio: slot.data, storedAt: ev.data?.cache?.storedAt, failure: undefined, retrying: false });
      },
      {
        staleTime: 120_000,
        /* POLLING IS BACK, at a minute, and deliberately.
           It was removed on 2026-07-25 because a tighter loop starved the chat
           of connector budget. What put it back is the stuck banner: the
           Salesforce-hosted MCP session expires on idle, and with no poll and
           no retry the first failure after a pause was the LAST event the watch
           ever delivered. A minute is twice the platform's ~30s floor, is
           coalesced per identity so every section costs one flight, and pauses
           while the page is hidden. */
        refetchInterval: PORTFOLIO_REFETCH_MS,
      },
    );
    return stop;
  }, [enabled, attempt]);

  return { ...live, retry };
}
