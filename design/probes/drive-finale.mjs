/* THE FILED FINALE DRIVE.

   Founder, 2026-09-03: "when the modification is done, can we gently and
   elegantly clean up the room, a cinematic kind of creation success with that
   card. Right now the room stays like nothing happened. But elegant."

   This is the evidence, on the assembled build, in a real browser - which is the
   only place the finale's middle beat exists at all: jsdom has no matchMedia, so
   every render test in the app is the reduced-motion path by construction.

     1  drive a modification to the executed card, the way a banker does
     2  catch the room MID-EXHALE, the moment anything carries data-finale=exhale
     3  shoot the settled end state, card alone in a centred pane
     4  read what the glass is actually showing at each beat, rather than trust it

   The stand-in connector (lib/stub-connector.js) supplies the write, because the
   room refuses to invent a plan and the finale only exists on the far side of a
   real filing. Nothing here ships.

   Usage:  node drive-finale.mjs [outDir]
*/
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] ?? "/tmp/c360-finale-drive";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = `${HERE}../../`;
const stub = readFileSync(`${HERE}lib/stub-connector.js`, "utf8");

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* THE BUILT COCKPIT, WITH THE LIVE BOOK IN ITS INERT DATA SLOT. Same mechanic as
   assemble-cockpit.mjs (a JSON-typed script tag, never executed as JS); done here
   rather than through the assembler because the assembler runs the SR 11-7
   validation stage, and this drive is about motion, not about data quality. */
const MARKER = '<script id="c360-data" type="application/json">/*__C360_DATA__*/</script>';
function bundle() {
  const shell = readFileSync(`${ROOT}app/dist/cockpit.html`, "utf8");
  if (shell.split(MARKER).length !== 2) throw new Error("the built cockpit carries no single data slot");
  const json = JSON.stringify(JSON.parse(readFileSync(`${ROOT}artifact/live-data.json`, "utf8")))
    .replace(/<\//g, "<\\/")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return shell.replace(MARKER, `<script id="c360-data" type="application/json">${json}</script>`);
}

const jsClick = (page, sel, n = 0) =>
  page.evaluate(
    ([s, i]) => {
      const e = document.querySelectorAll(s)[i];
      if (e) e.click();
      return Boolean(e);
    },
    [sel, n],
  );

const clickText = (page, sel, rx) =>
  page.evaluate(
    ([s, r]) => {
      const el = [...document.querySelectorAll(s)].find((b) => new RegExp(r, "i").test(b.textContent || ""));
      if (el) el.click();
      return Boolean(el);
    },
    [sel, rx],
  );

const say = async (page, text) => {
  await page.evaluate((t) => {
    const input = document.querySelector(".wk-txt");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".wk-send").click();
  }, text);
  await sleep(2600);
};

/**
 * WHAT THE GLASS IS ACTUALLY SHOWING, in the finale's own terms.
 *
 * ON STAGE means a reader can meet it: not in a collapsed step, not settled
 * away, not drained by the finale, not aria-hidden.
 */
const readFinale = (page) =>
  page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const thread = document.querySelector(".wk-thread");
    if (!thread) return null;
    const hidden = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.classList.contains("wk-gone")) return true;
        if (n.classList.contains("wk-ex-gone") || n.classList.contains("wk-ex-out")) return true;
        if (n.classList.contains("wk-tier-gone") || n.classList.contains("wk-tier-out")) return true;
        if (n.classList.contains("wk-fin-gone")) return true;
        if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return true;
      }
      return false;
    };
    const onStage = (sel) => [...document.querySelectorAll(sel)].filter((el) => !hidden(el));
    const card = document.querySelector(".wk-rescard");
    const aura = card?.querySelector(".aura");
    const inner = card?.closest("[data-finale-card]")?.querySelector(":scope > .wk-ex-in");
    const rail = document.querySelector('[data-rail="filed"]');
    const after = document.querySelector(".wk-afterglow");
    return {
      threadFinale: thread.getAttribute("data-finale"),
      exhaling: document.querySelectorAll('[data-finale="exhale"]').length,
      drained: document.querySelectorAll('[data-finale="gone"]').length,
      onStageItems: onStage("[data-ex-id]").length,
      onStageWords: onStage(".wk-msg .wk-bub, .wk-settled, .wk-chipwrap, .wk-check, .wk-rescard")
        .map((el) => clean(el.textContent))
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length,
      card: card
        ? {
            rows: card.querySelectorAll(".rc-r").length,
            footer: clean(card.querySelector(".rc-f")?.textContent),
            isStar: Boolean(card.closest("[data-finale-card]")),
            hold: card.closest("[data-finale-card]")?.style.getPropertyValue("--wk-fin-hold") ?? null,
            /* THE SWEEP. One pass, then still: the aura's animation must be a
               single iteration rather than the endless turn it has while lit. */
            auraAnimation: aura ? getComputedStyle(aura).animationName : null,
            auraIterations: aura ? getComputedStyle(aura).animationIterationCount : null,
            auraOpacity: aura ? getComputedStyle(aura).opacity : null,
            /* AND THE ASCENT ITSELF. The card is mounted from the moment it
               files and held at nothing until the room has cleared, so its
               opacity mid-drain is the only proof the wait is real. */
            ascend: inner ? getComputedStyle(inner).animationName : null,
            ascendDelay: inner ? getComputedStyle(inner).animationDelay : null,
            opacity: inner ? getComputedStyle(inner).opacity : null,
          }
        : null,
      rail: rail ? clean(rail.textContent) : null,
      railCardsDrained: [...document.querySelectorAll(".wk-ent")].every((e) => e.getAttribute("data-finale") === "gone"),
      afterglow: after ? clean(after.textContent) : null,
      afterglowHref: after?.querySelector("a")?.getAttribute("href") ?? null,
      composer: document.querySelector(".wk-txt")?.getAttribute("placeholder") ?? null,
      /* AND WHETHER THE PANE IS CENTRING WHAT IS LEFT. */
      threadJustify: getComputedStyle(thread).justifyContent,
    };
  });

const server = createServer((_q, r) => {
  r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end(bundle());
}).listen(0);
const port = server.address().port;
const TARGET = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
await ctx.addInitScript({ content: stub });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const beats = {};
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return name;
};

await page.goto(TARGET, { waitUntil: "load" });
await sleep(1800);
await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
await sleep(1500);
await jsClick(page, "#fab");
await sleep(700);
await jsClick(page, "#actFacility");
await sleep(3600);
/* THE PACKAGE ASK. Hartwell's org grew a second package, so the pick goes by the
   C&I package's own record id, the same one every other drive anchors on. */
if (await jsClick(page, '.wk-pkg[data-pkg="a5Fbb000000IHFJEA4"]')) await sleep(1800);
await clickText(page, ".wk-opt", "^Modify$");
await sleep(2600);

/* A MATURITY MOVE, deliberately: it stages cleanly and trips neither the
   coverage check nor the pricing gate, so the drive is about the finale rather
   than about how many questions the room asks on the way to it. */
await say(page, "move the construction loan maturity to 2029-06-30");
await clickText(page, "button", "^Confirm$");
await sleep(1600);
await say(page, "move the 2.5M line of credit rate to 7.25%");
await clickText(page, "button", "^Confirm$");
await sleep(1600);

beats.before = await readFinale(page);
beats.beforeShot = await shot("finale-0-before");

await jsClick(page, ".wk-propose");
await sleep(1400);
await page.evaluate(() => {
  const bs = [...document.querySelectorAll(".wk-flowcard button")];
  bs[bs.length - 1].click();
});

/* THE MIDDLE BEAT, IF IT CAN BE CAUGHT. The drain is 600ms plus 40ms per item,
   so there is close to a second of it; the wait is on the state itself rather
   than on a sleep that would have to guess when the org's answer lands. */
let caught = false;
try {
  /* ATTACHED, not visible: an item mid-exhale is fading to nothing inside a
     track that is collapsing to nothing, so a visibility wait would sit out the
     whole beat it is here to catch. */
  await page.waitForSelector('[data-finale="exhale"]', { state: "attached", timeout: 12_000 });
  caught = true;
  /* FREEZE THE FRAME BEFORE SHOOTING IT. `page.screenshot` settles the page
     before it captures, which on a ~920ms drain is long enough for the drain to
     be over by the time the shutter falls: the DOM read said the card was at
     opacity 0 and the image showed it at 1. Pausing every running animation
     holds the beat where it actually is.

     AND THE SECOND FRAME WAITS ON THE CARD, not on a clock. Pausing the world
     for the first shot costs however long a 2x capture takes and everything
     resumes where it stopped, so wall time and the finale's own time have
     parted company by then. The card's opacity is the honest cue: the handover
     is the frame where it is halfway in and the room is halfway out.

     TWO FRAMES, because there are two things to see: the SINK, with the room on
     its way down, and the HANDOVER, which is the beat that has to prove the pane
     never goes empty between the two. */
  const stop = () => page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const go = () => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  /* THE CARD'S OWN ASCENT, IN SLOW MOTION, so the crossing can be photographed.
     Its three animations are the only ones touched and the DRAIN still runs at
     full speed: what is slowed is the arrival, and the frame is therefore a real
     frame of the real animation rather than a reconstruction of one. */
  const cardRate = (rate) =>
    page.evaluate((r) => {
      const names = ["wk-fin-ascend", "aurarot", "wk-fin-glow"];
      for (const a of document.getAnimations()) if (names.includes(a.animationName)) a.updatePlaybackRate(r);
    }, rate);

  await cardRate(0.25);
  await sleep(200);
  await stop();
  beats.mid = await readFinale(page);
  beats.midShot = await shot("finale-1-mid-exhale");
  await go();

  const crossed = await page.evaluate(
    () =>
      new Promise((done) => {
        const card = document.querySelector(".wk-rescard");
        const inner = card?.closest("[data-finale-card]")?.querySelector(":scope > .wk-ex-in");
        if (!inner) return done(false);
        const t0 = performance.now();
        const tick = () => {
          const o = Number(getComputedStyle(inner).opacity);
          if (o >= 0.25 && o <= 0.85) {
            document.getAnimations().forEach((a) => a.pause());
            return done(true);
          }
          if (performance.now() - t0 > 8000) return done(false);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  beats.handover = { crossed, ...((await readFinale(page)) ?? {}) };
  beats.handoverShot = await shot("finale-2-handover");
  await cardRate(1);
  await go();
} catch {
  beats.mid = null;
}

/* AND THE END. Past the drain, past the card's paced reveal, past the sweep. */
await page.waitForSelector('.wk-thread[data-finale="still"]', { state: "attached", timeout: 12_000 });
await sleep(3400);
beats.settled = await readFinale(page);
beats.settledShot = await shot("finale-3-settled");

/* THE SWEEP SETTLES TO STILL AND NEVER COMES BACK ROUND. Read a second time,
   well past one pass, so "single iteration" is measured and not asserted. */
await sleep(2600);
beats.after = await readFinale(page);
beats.afterShot = await shot("finale-4-afterglow");

await ctx.close();
await browser.close();
server.close();

const report = { target: TARGET, at: new Date().toISOString(), caughtMidExhale: caught, beats, errors };
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
