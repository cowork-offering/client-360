import { useEffect, useState } from "react";
import type { Portfolio } from "../data/contract";
import { SERVERS, TOOLS, unwrapInvocableOne, watchTool, type McpFailure } from "./mcp";

export interface LivePortfolio {
  portfolio?: Portfolio;
  failure?: McpFailure;
  /** From result.cache.storedAt — never Date.now(). */
  storedAt?: number;
}

/** Keep the home KPI band current from Customer360Portfolio.
 *
 *  This is the DISPLAY arm: watchTool replays the cached entry, refreshes when
 *  stale, and delivers every newer result. Polling stays well above the ~30s
 *  floor — a credit book does not move second to second, and a tighter loop
 *  would just burn the viewer's connector budget.
 *
 *  Failures never blank the band: a transient error keeps the last good data
 *  with a staleness note, and only an authz denial retracts it. */
export function useLivePortfolio(enabled: boolean): LivePortfolio {
  const [live, setLive] = useState<LivePortfolio>({});

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
            ev.failure!.retract ? { failure: ev.failure } : { ...prev, failure: ev.failure },
          );
          return;
        }
        const slot = unwrapInvocableOne<Portfolio>(ev.data?.payload);
        if (!slot.ok) {
          setLive((prev) => ({ ...prev, failure: undefined }));
          return;
        }
        setLive({ portfolio: slot.data, storedAt: ev.data?.cache?.storedAt, failure: undefined });
      },
      { staleTime: 30_000, refetchInterval: 60_000 },
    );
    return stop;
  }, [enabled]);

  return live;
}
