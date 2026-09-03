/* THE REMARK CLIP.

   Founder, 2026-09-03: "the text in the workroom flickers: some chat bubbles
   grow and then shrink, and it kicks out the nice bullet listing." The cause
   was guard-after-reveal: the raw stream was rendered, then the figure and
   claim guards and the word budget ran on the finished text and replaced the
   node.

   This records one take of a remark landing WITH LINE ITEMS, and samples the
   bubble every 8ms: its character count, and how many rows and lists it is
   showing. A shrink is any frame shorter than the one before it; a collapse is
   the row count dropping. Both are reported as counts, so the clip is evidence
   and the numbers are the proof.

   Usage:  node clip-remark.mjs [url] [outDir]
*/
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TARGET = process.argv[2] ?? "http://127.0.0.1:8924/";
const OUT = process.argv[3] ?? "/tmp/remark-clip";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const stub = readFileSync(`${HERE}lib/stub-hygiene.js`, "utf8");

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clickText = (page, sel, rx) =>
  page.evaluate(
    ([s, r]) => {
      const el = [...document.querySelectorAll(s)].find((b) => new RegExp(r).test(b.textContent || ""));
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
};

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 820 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 820 } },
});
await ctx.addInitScript({ content: `window.__DRIVE = ${JSON.stringify({ intent: false, rows: true })};` });
await ctx.addInitScript({ content: stub });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(TARGET, { waitUntil: "load" });
await sleep(1800);
await page.evaluate(() => document.querySelector('[data-open="001bb00001I7FPNAA3"]')?.click());
await sleep(1500);
await page.evaluate(() => document.getElementById("fab")?.click());
await sleep(700);
await page.evaluate(() => document.getElementById("actFacility")?.click());
await sleep(3600);
await clickText(page, ".wk-opt", "^Modify$");
await sleep(2600);

/* THE SAMPLER. Every 8ms, what the remark bubble is showing. */
await page.evaluate(() => {
  window.__REMARK = [];
  window.__BASE = document.querySelectorAll(".wk-narr .wk-bub").length;
  const t0 = performance.now();
  const iv = setInterval(() => {
    /* THE LAST remark on the glass. The greeting has one of its own and it is
       finished long before this drive types anything; sampling the first would
       measure a bubble that is not moving. */
    const bubs = document.querySelectorAll(".wk-narr .wk-bub");
    const bub = bubs.length ? bubs[bubs.length - 1] : null;
    window.__REMARK.push({
      at: Math.round(performance.now() - t0),
      chars: bub ? (bub.textContent || "").length : 0,
      rows: bub ? bub.querySelectorAll(".wk-narr-row").length : 0,
      lists: bub ? bub.querySelectorAll(".wk-narr-rows, .wk-narr-list").length : 0,
      pending: bub ? bub.classList.contains("wk-narr-wait") : false,
      nth: bubs.length,
    });
    if (performance.now() - t0 > 9000) clearInterval(iv);
  }, 8);
});

/* A REMOVAL IS NOT A ROUTINE SCALAR, so the model is consulted and speaks. A
   plain term change says the whole of itself on the chip and gets no remark at
   all, which is the one-voice rule and not a failure. */
await say(page, "remove the Accounts Receivable covenant from the 15M line of credit");
await sleep(9200);

const trace = await page.evaluate(() => window.__REMARK ?? []);
await sleep(600);
await ctx.close();
await browser.close();

/* THE TWO FAILURES, COUNTED. A shrink is a frame shorter than the one before
   it; a collapse is the row count going down. Both were what the founder read. */
/* ONLY THE NEW REMARK. Frames before it existed are the greeting's. */
const base = trace.length ? Math.min(...trace.map((f) => f.nth ?? 0)) : 0;
const live = trace.filter((f) => (f.nth ?? 0) > base && f.chars > 0);
let shrinks = 0;
let collapses = 0;
let worstShrink = 0;
for (let i = 1; i < live.length; i++) {
  const d = live[i - 1].chars - live[i].chars;
  if (d > 0) {
    shrinks += 1;
    worstShrink = Math.max(worstShrink, d);
  }
  if (live[i].rows < live[i - 1].rows) collapses += 1;
}
const video = readdirSync(OUT).find((f) => f.endsWith(".webm"));
if (video) renameSync(`${OUT}/${video}`, `${OUT}/remark-no-shrink.webm`);

const report = {
  target: TARGET,
  at: new Date().toISOString(),
  clip: video ? `${OUT}/remark-no-shrink.webm` : null,
  samples: trace.length,
  framesWithRemark: live.length,
  rowsFirstFrame: live.length ? live[0].rows : 0,
  rowsLastFrame: live.length ? live[live.length - 1].rows : 0,
  charsFirstFrame: live.length ? live[0].chars : 0,
  charsLastFrame: live.length ? live[live.length - 1].chars : 0,
  shrinks,
  worstShrinkChars: worstShrink,
  rowCollapses: collapses,
  errors,
};
writeFileSync(`${OUT}/report.json`, JSON.stringify({ ...report, trace }, null, 2));
console.log(JSON.stringify(report, null, 2));
