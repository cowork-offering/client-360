/* THE THREAD HYGIENE DRIVE.

   Founder, 2026-09-03: the workroom reads like double chats, and a single
   bubble is too much to read. This drive is the evidence, on the assembled
   build, with lib/stub-hygiene.js in front of it. Everything between the room
   and the glass is the real code.

     1  the intent run     open Hartwell, take the intent, settle the first card
                           (Confirm, Acknowledge, 240 months, a date) and record
                           what is ON STAGE after each settle: the bubbles, the
                           settled rows, and the words a reader actually meets.
     2  the manual run     three typed lines, no intent, so the fed marker and
                           the queue are out of the picture and the settle
                           choreography is on its own.
     3  the relationship   the covenant review, two steps, so the second room's
        run                own settle row can be read rather than trusted.

   Usage:  node drive-hygiene.mjs [url] [outDir]
*/
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TARGET = process.argv[2] ?? "http://127.0.0.1:8924/";
const OUT = process.argv[3] ?? "/tmp/hygiene-drive";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const stub = readFileSync(`${HERE}lib/stub-hygiene.js`, "utf8");

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ARGS = ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"];

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
  await sleep(2400);
};

/**
 * WHAT THE GLASS IS ACTUALLY SHOWING.
 *
 * ON STAGE means visible to a reader: not inside a collapsed step, not inside a
 * settled exchange, not aria-hidden. The word count is what a reader meets, so
 * it is taken off the same set.
 */
const readStage = (page) =>
  page.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const thread = document.querySelector(".wk-thread");
    if (!thread) return null;
    const hidden = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.classList.contains("wk-gone")) return true;
        if (n.classList.contains("wk-ex-gone") || n.classList.contains("wk-ex-out")) return true;
        if (n.classList.contains("wk-tier-gone") || n.classList.contains("wk-tier-out")) return true;
        if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return true;
      }
      return false;
    };
    const onStage = (sel) => [...thread.querySelectorAll(sel)].filter((el) => !hidden(el));

    const bubbles = onStage(".wk-msg .wk-bub").map((b) => clean(b.textContent));
    const cards = onStage(".wk-chip").length;
    const rows = onStage(".wk-settled").map((r) => clean(r.textContent));
    const fed = onStage("[data-fed='line']").map((r) => clean(r.textContent));
    const chips = onStage(".wk-opt").map((b) => clean(b.textContent));
    const visible = onStage(".wk-msg .wk-bub, .wk-settled, [data-fed='line'], .wk-chipwrap, .wk-check")
      .map((el) => clean(el.textContent))
      .join(" ");

    const feedHead = document.querySelector("[data-feed='progress']");
    const tiers = [...document.querySelectorAll("[data-tier]")].map((t) => ({
      tier: t.getAttribute("data-tier"),
      state: t.getAttribute("data-tier-state"),
    }));
    return {
      bubbles,
      bubbleCount: bubbles.length,
      openCards: cards,
      settledRows: rows,
      fedMarkers: fed,
      chips,
      words: visible.split(/\s+/).filter(Boolean).length,
      mountedButHidden: document.querySelectorAll("[data-settle-state='settled']").length,
      feedHead: feedHead ? clean(feedHead.textContent) : null,
      tiers,
      compileCards: document.querySelectorAll("[data-card='compile']").length,
    };
  });

/* THE PACKAGE ASK. Hartwell's org grew a second package (2026-09-03), so the
   room now opens on `.wk-pkgask` — one `.wk-pkg` card per package, radio-style
   — before anything else, where it used to bind silently. The card's own text
   never says "C&I" or "Industrial" (`packageLabel` in actions/schemas.ts
   builds it off the booked products' type words, "Non-Real Estate" and "Real
   Estate", which both packages' labels contain as a substring of each other),
   so the pick goes by the C&I package's own record id instead: a5Fbb000000IHFJEA4,
   the same id every other drive and test in this session anchors on. A no-op
   wherever the ask is not on stage. */
const pickCNIPackage = async (page) => {
  const clicked = await jsClick(page, '.wk-pkg[data-pkg="a5Fbb000000IHFJEA4"]');
  if (clicked) await sleep(1800);
  return clicked;
};

async function openRoom(page, { relationship = false } = {}) {
  await page.goto(TARGET, { waitUntil: "load" });
  await sleep(1600);
  await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
  await sleep(1400);
  await jsClick(page, "#fab");
  await sleep(700);
  await jsClick(page, relationship ? "#actRelationship" : "#actFacility");
  await sleep(3600);
  await pickCNIPackage(page);
}

/* =========================================================== 1. the intent run */

async function intentRun(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
  await ctx.addInitScript({ content: `window.__DRIVE = ${JSON.stringify({ intent: true })};` });
  await ctx.addInitScript({ content: stub });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(TARGET, { waitUntil: "load" });
  await sleep(2000);

  // THE WHISPER. The intent lane offers the relationship the intent names.
  const took = await clickText(page, "button", "^Open$");
  await sleep(4200);
  await pickCNIPackage(page);

  const steps = [];
  const snap = async (label) => {
    const s = await readStage(page);
    steps.push({ label, ...s });
    await page.screenshot({ path: `${OUT}/intent-${steps.length}-${label.replace(/[^a-z0-9]+/gi, "-")}.png` });
    return s;
  };

  await snap("the fed line landed, the card is up");

  await clickText(page, "button", "^Confirm$");
  await sleep(1400);
  await snap("after Confirm");

  await clickText(page, "button", "^Acknowledge$");
  await sleep(1600);
  await snap("after Acknowledge");

  await clickText(page, ".wk-opt", "240 months");
  await sleep(1800);
  await clickText(page, "button", "^Confirm$");
  await sleep(1600);
  await snap("after the amortisation");

  await clickText(page, ".wk-opt", "^1 ");
  await sleep(1800);
  await clickText(page, "button", "^Confirm$");
  await sleep(1600);
  const last = await snap("after the first payment date");

  /* THE EXPAND. A settled row brings its whole exchange back. Taken on the
     LAST row that has a control: a row whose exchange was a tier carries none,
     because the summon already owns that question. */
  const beforeExpand = last.bubbleCount;
  const expandable = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("button.wk-settled")];
    const row = rows[rows.length - 1];
    if (!row) return null;
    row.click();
    return (row.textContent || "").replace(/\s+/g, " ").trim();
  });
  await sleep(700);
  const expanded = await readStage(page);
  await page.screenshot({ path: `${OUT}/intent-expanded.png` });

  await ctx.close();
  return {
    took,
    steps,
    expand: {
      row: expandable,
      before: beforeExpand,
      after: expanded.bubbleCount,
      wordsBefore: last.words,
      wordsAfter: expanded.words,
      broughtBack: expanded.bubbleCount - beforeExpand,
    },
    errors,
  };
}

/* =========================================================== 2. the manual run */

async function manualRun(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
  await ctx.addInitScript({ content: `window.__DRIVE = ${JSON.stringify({ intent: false })};` });
  await ctx.addInitScript({ content: stub });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await openRoom(page);
  await clickText(page, ".wk-opt", "^Modify$");
  await sleep(2600);

  const steps = [];
  const snap = async (label) => {
    const s = await readStage(page);
    steps.push({ label, ...s });
    return s;
  };

  const lines = [
    "increase the 15M line of credit to 20M",
    "move the construction loan maturity to 2029-06-30",
    "move the 2.5M line of credit rate to 7.25%",
  ];
  for (const line of lines) {
    await say(page, line);
    await snap(`said: ${line}`);
    await clickText(page, "button", "^Confirm$");
    await sleep(1400);
    // A commitment change trips the coverage check; the others do not.
    await clickText(page, "button", "^Acknowledge$");
    await sleep(1400);
    await snap(`settled: ${line}`);
  }
  await page.screenshot({ path: `${OUT}/manual-end.png` });
  const frames = await page.evaluate(() => window.__DRIVE_OUT.frames);
  const releases = await page.evaluate(() => window.__DRIVE_OUT.releases ?? []);
  await ctx.close();
  return { steps, errors, frames, releases };
}

/* ==================================================== 3. the relationship run */

async function relationshipRun(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
  await ctx.addInitScript({ content: `window.__DRIVE = ${JSON.stringify({ intent: false })};` });
  await ctx.addInitScript({ content: stub });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await openRoom(page, { relationship: true });
  await clickText(page, ".wk-opt", "covenant");
  await sleep(3000);

  const steps = [];
  const snap = async (label) => {
    const s = await readStage(page);
    steps.push({ label, ...s });
    return s;
  };
  await snap("the review opened");

  // Two steps, on the chips the room offers.
  await jsClick(page, ".wk-step:not(.wk-gone) .wk-opt");
  await sleep(1800);
  await snap("step 1 settled");
  await jsClick(page, ".wk-step:not(.wk-gone) .wk-opt");
  await sleep(1800);
  await snap("step 2 settled");

  await page.screenshot({ path: `${OUT}/relationship-end.png` });
  await ctx.close();
  return { steps, errors };
}

/* ------------------------------------------------------------------- report */

const browser = await chromium.launch({ args: ARGS });
const report = {
  target: TARGET,
  at: new Date().toISOString(),
  intent: await intentRun(browser),
  manual: await manualRun(browser),
  relationship: await relationshipRun(browser),
};
await browser.close();

/* THE RELEASE TRACE. Growth steps only: a remark being replaced by the next
   one is a new remark, not a jump inside this one. */
const rel = report.manual.releases ?? [];
const jumps = [];
for (let i = 1; i < rel.length; i++) {
  const d = rel[i].len - rel[i - 1].len;
  if (d > 0) jumps.push(d);
}
report.stream = {
  releases: jumps.length,
  maxJumpChars: jumps.length ? Math.max(...jumps) : null,
  medianJumpChars: jumps.length ? [...jumps].sort((a, b) => a - b)[Math.floor(jumps.length / 2)] : null,
};
delete report.manual.releases;

const frames = report.manual.frames ?? [];
const slow = frames.filter((g) => g > 18.5).length;
report.frameRate = {
  frames: frames.length,
  medianGapMs: frames.length ? [...frames].sort((a, b) => a - b)[Math.floor(frames.length / 2)] : null,
  slowFrames: slow,
  fps: frames.length ? Math.round(1000 / ([...frames].sort((a, b) => a - b)[Math.floor(frames.length / 2)] || 16.7)) : null,
};
delete report.manual.frames;

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
