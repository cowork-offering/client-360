import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Renders children into <body> (A31.1).
 *
 *  Overlays MUST escape the app tree: the frosted verdict bar creates a
 *  stacking context and the scroll containers clip, so a high z-index alone is
 *  not enough — the activity modal rendered beneath the sticky nav for exactly
 *  this reason. Portalling removes both failure modes at once.
 *
 *  The host is resolved SYNCHRONOUSLY. Deferring it to an effect costs a render
 *  pass, during which refs inside the portal are still null — which silently
 *  breaks focus-on-open for every panel that focuses itself on mount. */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
