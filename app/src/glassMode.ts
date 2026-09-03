/* =============================================================================
   THE GLASS MODE, AND WHERE IT IS DECIDED.

   LIQUID IS THE DEFAULT AS OF 2026-09-03 (founder: the glass ships). A pinned
   artifact opened with no query string is the refractive cockpit; the frost is
   now the thing you ask for, not the thing you get.

     (no query)                  liquid
     ?refract=0  #frost          frost, the build that shipped before the bend
     ?refract=1  #refract        subtle, the uniform bend at the old frost
     ?refract=2  #refract2       alias of subtle, so old links still land
     ?refract=3  #refract3       liquid, stated explicitly

   THE ORDER OF PRECEDENCE IS QUERY, THEN STORAGE, THEN LIQUID, and it is that
   way round on purpose: a preview link has to be able to pin a mode for whoever
   opens it, regardless of what that person last chose in their own browser.

   THE CLASSES ARE THE MODE. Nothing here holds React state and nothing re-reads
   the query after boot: `electric-glass.css` branches on two classes on <html>,
   so switching modes is two classList calls and the next paint, with no reload
   and no remount. That is what lets the palette flip it mid-demo.

   `eg-refract-pane` is set by both bending modes. It stopped meaning anything on
   its own when the pane came onto the bend by default, and it is kept because
   the stylesheet still branches on it and every ?refract=2 link ever written
   still has to land somewhere sensible.
   ============================================================================= */

export type GlassMode = "liquid" | "subtle" | "frost";

/** Where the viewer's own choice lives. Namespaced: the cockpit shares an
 *  origin with whatever else the host has published. */
const KEY = "c360.glass";

const REFRACT = "eg-refract";
const PANE = "eg-refract-pane";
const LIQUID = "eg-liquid";

function isMode(v: unknown): v is GlassMode {
  return v === "liquid" || v === "subtle" || v === "frost";
}

/** The mode the classes on <html> currently say we are in. */
export function currentGlass(): GlassMode {
  if (typeof document === "undefined") return "liquid";
  const c = document.documentElement.classList;
  if (!c.contains(REFRACT)) return "frost";
  return c.contains(LIQUID) ? "liquid" : "subtle";
}

/** Put the mode on <html>. Pure DOM, no storage, no reload. */
export function applyGlass(mode: GlassMode): GlassMode {
  if (typeof document === "undefined") return mode;
  const c = document.documentElement.classList;
  c.toggle(REFRACT, mode !== "frost");
  c.toggle(PANE, mode !== "frost");
  c.toggle(LIQUID, mode === "liquid");
  return mode;
}

/* STORAGE IS ALWAYS A GUESS. Private windows, cleared site data, an embedder
   that blocks storage outright: every one of them throws on access rather than
   returning null, so both directions are wrapped and both failures mean the
   same thing, which is that this viewer has no saved choice. */
function readStored(): GlassMode | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return isMode(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStored(mode: GlassMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // A viewer who cannot persist still gets the mode for this view.
  }
}

/** The palette's entry point: switch now, and remember it for next time. */
export function setGlass(mode: GlassMode): GlassMode {
  writeStored(mode);
  return applyGlass(mode);
}

/** What the query string asks for, or null if it says nothing. */
function requestedGlass(): GlassMode | null {
  try {
    const q = new URLSearchParams(window.location.search).get("refract");
    const h = window.location.hash.replace(/^#/, "");
    const v = q != null ? q : h;
    switch (v) {
      case "0":
      case "false":
      case "off":
      case "frost":
        return "frost";
      case "1":
      case "2":
      case "refract":
      case "refract2":
      case "pane":
      case "subtle":
        return "subtle";
      case "3":
      case "refract3":
      case "liquid":
        return "liquid";
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Read once at boot and write the classes. Query, then storage, then liquid. */
export function bootGlass(): GlassMode {
  return applyGlass(requestedGlass() ?? readStored() ?? "liquid");
}
