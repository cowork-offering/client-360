import type { ReactNode } from "react";
import { useApp } from "../state/appState";

/**
 * A figure that lights up when the last sync changed it (WP7).
 *
 * The id is the delta id from `data/delta.ts`, so what pulses is exactly what
 * the diff found: no decorative highlighting, and nothing pulses that did not
 * move. `prefers-reduced-motion` collapses the animation to nothing at all.
 */
export function Pulse({ id, children }: { id: string; children: ReactNode }) {
  const { state } = useApp();
  return (
    <span data-delta={id} className={state.pulse.includes(id) ? "c360-pulse inline-block" : "inline-block"}>
      {children}
    </span>
  );
}
