// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCalmDetector, p95, startCalmSensor, CALM_P95_MS } from "./perf/calmSensor";
import {
  applyGlass,
  bootGlass,
  currentGlass,
  currentPreference,
  enterCalm,
  setGlass,
  watchGlassPreference,
} from "./glassMode";

/* =============================================================================
   THE PAGE THAT NOTICES IT IS DROWNING.

   FOUNDER, 2026-09-04: "when I share via video there is latency, stuff gets
   delayed, the system seems to overload; stabilise it so it runs super smooth,
   in all instances."

   FOUR CLAIMS, AND THE WHOLE OF CALM MODE RESTS ON THEM.

     1. A page that is keeping up is left alone. A p95 AT the threshold is
        keeping up; only past it counts.
     2. One bad second is not a verdict. The entry choreography is expensive on
        purpose and is over before anyone could act on it, so the material only
        changes after two consecutive bad windows.
     3. The viewer outranks the sensor. An explicit choice from the palette is
        remembered and is what the next open boots into.
     4. The sensor writes nothing. Calm arrived at by measurement lasts the
        session; it never becomes this viewer's saved preference.
   ============================================================================= */

const KEY = "c360.glass";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  watchGlassPreference(null);
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  watchGlassPreference(null);
});

describe("the frame sensor decides on evidence", () => {
  it("reads the 95th percentile by nearest rank", () => {
    expect(p95([16, 16, 16, 16, 16])).toBe(16);
    /* ONE BAD FRAME IN TWENTY IS NOT A BAD SECOND, and this is the point of
       reading a percentile rather than a max: a single hitch (a card arriving, a
       tab switching) leaves the number where it was. */
    expect(p95([...Array(19).fill(16), 200])).toBe(16);
    // Two in twenty, and the 95th is the slow one. That is a page missing
    // vsyncs, not a page having a moment.
    expect(p95([...Array(18).fill(16), 200, 200])).toBe(200);
  });

  /* AT THE THRESHOLD IS NOT PAST IT. A page holding exactly 28ms is holding. */
  it("leaves a page alone at the threshold", () => {
    const d = createCalmDetector();
    for (let i = 0; i < 400; i++) expect(d.push(CALM_P95_MS)).toBe(false);
    expect(d.streak()).toBe(0);
  });

  it("leaves a page alone below the threshold", () => {
    const d = createCalmDetector();
    for (let i = 0; i < 400; i++) expect(d.push(16.7)).toBe(false);
    expect(d.streak()).toBe(0);
  });

  /* ONE BAD SECOND IS THE ENTRY CHOREOGRAPHY. Two is a machine in trouble. */
  it("takes two consecutive bad windows, not one", () => {
    const d = createCalmDetector();
    // A first bad second: 25 frames of 40ms is a full window, well past 28.
    for (let i = 0; i < 25; i++) expect(d.push(40)).toBe(false);
    expect(d.streak()).toBe(1);
    // A good second in between resets the count. Nothing has been decided.
    for (let i = 0; i < 60; i++) expect(d.push(16.7)).toBe(false);
    expect(d.streak()).toBe(0);
    // Now two bad ones in a row, and the second one trips it.
    for (let i = 0; i < 25; i++) expect(d.push(40)).toBe(false);
    let tripped = false;
    for (let i = 0; i < 25; i++) tripped = d.push(40) || tripped;
    expect(tripped).toBe(true);
  });

  it("decides once and then says nothing", () => {
    const d = createCalmDetector();
    for (let i = 0; i < 25; i++) d.push(40);
    let trips = 0;
    for (let i = 0; i < 500; i++) if (d.push(40)) trips += 1;
    expect(trips).toBe(1);
  });

  /* A TAB THAT WAS AWAY IS NOT A SLOW TAB. One five-second delta says nothing
     about how the cockpit renders, and must not be read as a stall. */
  it("throws away the frame a backgrounded tab hands back", () => {
    const d = createCalmDetector();
    for (let i = 0; i < 20; i++) d.push(20);
    expect(d.push(5000)).toBe(false);
    expect(d.streak()).toBe(0);
  });

  it("drives the material from a run of slow frames", () => {
    let now = 0;
    const pending: Array<(t: number) => void> = [];
    let calm = 0;
    startCalmSensor({
      raf: (cb) => {
        pending.push(cb);
        return pending.length;
      },
      cancelRaf: () => {},
      onCalm: () => {
        calm += 1;
      },
    });
    // Fifty 40ms frames: two full windows, both bad.
    for (let i = 0; i < 60 && pending.length; i++) {
      const cb = pending.shift()!;
      now += 40;
      cb(now);
    }
    expect(calm).toBe(1);
    // The loop is over: nothing is left pending, so it cannot trip twice.
    expect(pending.length).toBe(0);
  });
});

describe("calm is a material on <html>", () => {
  it("takes the bend off and adds its own class", () => {
    applyGlass("calm");
    const c = document.documentElement.classList;
    expect(c.contains("eg-calm")).toBe(true);
    expect(c.contains("eg-refract")).toBe(false);
    expect(c.contains("eg-liquid")).toBe(false);
    expect(currentGlass()).toBe("calm");
  });

  it("comes off again when the viewer asks for liquid", () => {
    applyGlass("calm");
    applyGlass("liquid");
    const c = document.documentElement.classList;
    expect(c.contains("eg-calm")).toBe(false);
    expect(c.contains("eg-liquid")).toBe(true);
    expect(currentGlass()).toBe("liquid");
  });
});

describe("the viewer outranks the sensor", () => {
  it("boots into auto, and auto paints liquid", () => {
    expect(bootGlass()).toBe("auto");
    expect(currentGlass()).toBe("liquid");
    expect(currentPreference()).toBe("auto");
  });

  it("remembers an explicit choice for the next open", () => {
    setGlass("frost");
    expect(window.localStorage.getItem(KEY)).toBe("frost");
    document.documentElement.className = "";
    expect(bootGlass()).toBe("frost");
    expect(currentGlass()).toBe("frost");
  });

  it("remembers calm asked for outright", () => {
    setGlass("calm");
    expect(window.localStorage.getItem(KEY)).toBe("calm");
    document.documentElement.className = "";
    bootGlass();
    expect(currentGlass()).toBe("calm");
  });

  /* THE SENSOR IS ARMED BEHIND AUTO AND ONLY BEHIND AUTO. A viewer who asked
     for liquid on a struggling machine has been told what it costs. */
  it("tells its listener which preference is in force", () => {
    const seen: string[] = [];
    watchGlassPreference((p) => seen.push(p));
    setGlass("liquid");
    setGlass("auto");
    setGlass("calm");
    expect(seen).toEqual(["liquid", "auto", "calm"]);
  });

  /* AUTOMATIC CALM LASTS THE SESSION, NOT THE ACCOUNT. */
  it("writes nothing when the sensor is the one that decided", () => {
    bootGlass();
    expect(window.localStorage.getItem(KEY)).toBe(null);
    enterCalm();
    expect(currentGlass()).toBe("calm");
    expect(window.localStorage.getItem(KEY)).toBe(null);
  });
});

/* =============================================================================
   THE STYLESHEET'S OWN CLAIMS.

   Three of the fluidity pass's biggest wins are single CSS rules, and a rule is
   exactly the kind of thing a later edit reverts by accident while meaning
   something else. The acceptance probe would normally hold the halo's end of
   this (trap 3), but its execute step cannot reach the halo on this build -
   measured on 2026-09-04 against BOTH this tree and the baseline it branched
   from, same error either side, so it is not a regression and it is also not
   cover. These read the sheets the way `sync.ui.test.tsx` already does.
   ============================================================================= */
const workroomCss = readFileSync(resolve(process.cwd(), "src/styles/workroom.css"), "utf8");
const glassCss = readFileSync(resolve(process.cwd(), "src/styles/electric-glass.css"), "utf8");

/** The body of the first rule whose selector list contains `selector`. */
function ruleFor(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) return "";
  const open = css.indexOf("{", at);
  return open < 0 ? "" : css.slice(open, css.indexOf("}", open));
}

describe("nothing turns, breathes or bends unless someone is looking at it", () => {
  /* THE HALO TURNS ONLY WHILE IT IS LIT. Measured cost of the alternative, on
     the facility room at 4x throttle: p95 983ms with every unlit aura rotating,
     333ms without. The mechanism trap 3 protects is unchanged, the box has no
     transform and the ANGLE is what animates, and that is what these assert. */
  it("gives the rotation to the lit halo and not to every aura in the room", () => {
    expect(ruleFor(workroomCss, "\n.aura {")).not.toContain("animation:");
    const lit = ruleFor(workroomCss, ".wk-lit > .aura {");
    expect(lit).toContain("aurarot");
    expect(lit).toContain("infinite");
    // The box still never rotates: the keyframe moves the angle, nothing else.
    expect(ruleFor(workroomCss, "@keyframes aurarot")).not.toContain("transform");
  });

  /* A LOOP INSIDE A LENSED SURFACE RE-RUNS THAT SURFACE'S FILTER. The live dot
     sits in the top bar, which carries the lens on every page. */
  it("stops the live dot's pulse under the lens", () => {
    const stopped = ruleFor(glassCss, "html.eg-liquid .fab::after,");
    expect(stopped).toContain("animation: none");
    expect(glassCss).toContain("html.eg-liquid .dot-live::after");
  });

  it("takes the lens off while the page is moving", () => {
    expect(glassCss).toContain("html.eg-scrolling.eg-liquid .topbar");
    expect(glassCss).toContain("html.eg-liquid .wk-ent.eg-off");
  });

  /* CALM CARRIES THE LOWEST BLUR IN THE APP, not merely half the frost. Half
     the frost is 14 to 18px, which measured slower than liquid's own 7 to 10px:
     a rescue material that costs more than the material it rescues you from is
     not a rescue. So calm takes liquid's radii and frost's tint. */
  it("gives calm the lowest blur radius in the app, and stills the loops", () => {
    const sheets = ruleFor(glassCss, "html.eg-calm .eg-glass,");
    expect(sheets).toContain("--eg-rblur: 9px");
    /* The chips' own rule, not the sheet group that also lists them: the group
       ends `... .wk-glass-sheet {`, this one ends `... .wk-propose {`. */
    const chips = ruleFor(glassCss, "html.eg-calm .wk-propose {");
    expect(chips).toContain("--eg-rblur: 7px");
    // And never above liquid's own scale: the sheet's 9px is liquid's number.
    expect(ruleFor(glassCss, "html.eg-liquid .eg-glass,")).toContain("--eg-rblur: 9px");
    const stilled = ruleFor(glassCss, "html.eg-calm .dot-live::after,");
    expect(stilled).toContain("animation: none");
    for (const s of [".fab::after", ".pane .empty .wm", ".c360-ambient-a", ".goo i", ".wk-orbit i", ".aura"]) {
      expect(glassCss).toContain(`html.eg-calm ${s}`);
    }
  });

  /* PAUSED, NOT STOPPED, so a page that comes back picks up mid-stride. */
  it("pauses rather than kills what is hidden or off screen", () => {
    expect(ruleFor(glassCss, "html.eg-hidden *,")).toContain("animation-play-state: paused");
    expect(ruleFor(glassCss, "\n.eg-off,")).toContain("animation-play-state: paused");
  });
});
