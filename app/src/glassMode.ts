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
     ?refract=calm               calm, the mode for a machine under load
     ?refract=auto               liquid, and let the frame sensor decide

   THE ORDER OF PRECEDENCE IS QUERY, THEN STORAGE, THEN AUTO, and it is that
   way round on purpose: a preview link has to be able to pin a mode for whoever
   opens it, regardless of what that person last chose in their own browser.

   AUTO IS THE DEFAULT AS OF 2026-09-04 (founder: "stabilise it so it runs super
   smooth, in all instances"). Auto LOOKS like liquid, because it boots into exactly
   the classes liquid boots into, and differs only in that the frame sensor is
   armed behind it. A machine that keeps up never leaves liquid; one that starts
   dropping frames drops to CALM instead and stays there for the session. That
   is what a screen share does to a laptop, and the cockpit now answers it
   itself rather than waiting to be told.

   THE CLASSES ARE THE MODE. Nothing here holds React state and nothing re-reads
   the query after boot: `electric-glass.css` branches on two classes on <html>,
   so switching modes is two classList calls and the next paint, with no reload
   and no remount. That is what lets the palette flip it mid-demo.

   `eg-refract-pane` is set by both bending modes. It stopped meaning anything on
   its own when the pane came onto the bend by default, and it is kept because
   the stylesheet still branches on it and every ?refract=2 link ever written
   still has to land somewhere sensible.
   ============================================================================= */

export type GlassMode = "liquid" | "subtle" | "frost" | "calm";

/** What the VIEWER asked for. `auto` is a standing instruction rather than a
 *  material: it means "liquid until this machine cannot hold it". */
export type GlassPreference = GlassMode | "auto";

/** Where the viewer's own choice lives. Namespaced: the cockpit shares an
 *  origin with whatever else the host has published. */
const KEY = "c360.glass";

const REFRACT = "eg-refract";
const PANE = "eg-refract-pane";
const LIQUID = "eg-liquid";
const CALM = "eg-calm";

function isMode(v: unknown): v is GlassMode {
  return v === "liquid" || v === "subtle" || v === "frost" || v === "calm";
}

function isPreference(v: unknown): v is GlassPreference {
  return v === "auto" || isMode(v);
}

/** The material a preference boots into. Auto is liquid with a sensor behind
 *  it, so it must paint liquid on the first frame or the switch would be a
 *  visible downgrade rather than a rescue. */
function materialFor(p: GlassPreference): GlassMode {
  return p === "auto" ? "liquid" : p;
}

/** The mode the classes on <html> currently say we are in. */
export function currentGlass(): GlassMode {
  if (typeof document === "undefined") return "liquid";
  const c = document.documentElement.classList;
  if (c.contains(CALM)) return "calm";
  if (!c.contains(REFRACT)) return "frost";
  return c.contains(LIQUID) ? "liquid" : "subtle";
}

/** Put the mode on <html>. Pure DOM, no storage, no reload.
 *
 *  CALM IS FROST PLUS A CLASS. It takes the bend off (no url() filter is
 *  rasterised at all), which is the same set of classes frost carries, and adds
 *  `eg-calm` for the half-blur and the stilled loops. Nothing in the stylesheet
 *  has to know about a fourth material: it is the third one, quieter. */
export function applyGlass(mode: GlassMode): GlassMode {
  if (typeof document === "undefined") return mode;
  const bent = mode === "liquid" || mode === "subtle";
  const c = document.documentElement.classList;
  c.toggle(REFRACT, bent);
  c.toggle(PANE, bent);
  c.toggle(LIQUID, mode === "liquid");
  c.toggle(CALM, mode === "calm");
  return mode;
}

/* STORAGE IS ALWAYS A GUESS. Private windows, cleared site data, an embedder
   that blocks storage outright: every one of them throws on access rather than
   returning null, so both directions are wrapped and both failures mean the
   same thing, which is that this viewer has no saved choice. */
function readStored(): GlassPreference | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return isPreference(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStored(pref: GlassPreference): void {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // A viewer who cannot persist still gets the mode for this view.
  }
}

/* WHO IS TOLD WHEN THE VIEWER CHOOSES.
   The frame sensor is armed behind `auto` and disarmed behind every explicit
   choice, and the sensor must not be imported here: this module is two class
   lists and a storage key, and it stays that. main.tsx registers the listener
   and owns the sensor's lifetime. */
type PreferenceListener = (pref: GlassPreference) => void;
let listener: PreferenceListener | null = null;

/** Register the one thing that cares which preference is in force. */
export function watchGlassPreference(fn: PreferenceListener | null): void {
  listener = fn;
}

let preference: GlassPreference = "auto";

/** The preference the viewer last chose, or `auto` where they never have. */
export function currentPreference(): GlassPreference {
  return preference;
}

/** The palette's entry point: switch now, and remember it for next time.
 *  `auto` is a preference like any other and is remembered like one. */
export function setGlass(pref: GlassPreference): GlassMode {
  preference = pref;
  writeStored(pref);
  const mode = applyGlass(materialFor(pref));
  listener?.(pref);
  return mode;
}

/** THE SENSOR'S OWN ENTRY, and the only caller that is not the viewer.
 *
 *  It writes NOTHING. A machine that struggled once during a screen share has
 *  not told us what this viewer wants to look at tomorrow, so calm lasts the
 *  session and the stored preference stays `auto`. */
export function enterCalm(): GlassMode {
  return applyGlass("calm");
}

/** What the query string asks for, or null if it says nothing. */
function requestedGlass(): GlassPreference | null {
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
      case "calm":
        return "calm";
      case "auto":
        return "auto";
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Read once at boot and write the classes. Query, then storage, then auto.
 *  Returns the PREFERENCE, because that is what decides whether the frame
 *  sensor runs; the material it painted is `currentGlass()`. */
export function bootGlass(): GlassPreference {
  preference = requestedGlass() ?? readStored() ?? "auto";
  applyGlass(materialFor(preference));
  return preference;
}
