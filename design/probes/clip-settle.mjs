/* THE SETTLE CLIP.

   Founder, 2026-09-03: "when a settled exchange disappears, the remaining
   content snaps from the bottom to the top abruptly". The fix is a height
   collapse on the same clock as the fade (workroom.css, `.wk-ex`), and the only
   honest evidence for a motion fix is the motion.

   This records ONE take of the sequence he described: the card lands, he
   confirms, the exchange glides out and the next question rises into the space
   it left. It also samples the thread's own scroll height every frame, so the
   report can say whether the layout moved continuously or in one jump.

   Usage:  node clip-settle.mjs [url] [outDir]
*/
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TARGET = process.argv[2] ?? "http://127.0.0.1:8924/";
const OUT = process.argv[3] ?? "/tmp/settle-clip";
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
  await sleep(2600);
};

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 820 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 820 } },
});
await ctx.addInitScript({ content: `window.__DRIVE = ${JSON.stringify({ intent: false })};` });
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

await say(page, "increase the 15M line of credit to 20M");
await sleep(900);

/* THE MEASUREMENT. Every frame from just before the confirm until the next
   question has settled: what the first on-stage node's top is, and how tall the
   thread's content is. A snap is one huge step between two frames; a glide is
   many small ones. */
await page.evaluate(() => {
  window.__TRACE = [];
  const thread = document.querySelector(".wk-thread");
  const t0 = performance.now();
  const tick = () => {
    const first = document.querySelector('.wk-thread [data-settle-state="on"]');
    window.__TRACE.push({
      at: Math.round(performance.now() - t0),
      top: first ? Math.round(first.getBoundingClientRect().top) : null,
      h: thread ? Math.round(thread.scrollHeight) : null,
    });
    if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  /* AND A TIMER BESIDE IT. Headless Chrome throttles rAF to about ten frames a
     second, which cannot tell a 420ms glide from a snap; an interval is not
     throttled the same way and samples the same two numbers. */
  const iv = setInterval(() => {
    const first = document.querySelector('.wk-thread [data-settle-state="on"]');
    /* THE SETTLING NODE'S OWN HEIGHT is the measurement that matters: it is the
       thing whose collapse used to happen in one frame. */
    const going = document.querySelector('.wk-thread [data-settle-state="leaving"], .wk-thread [data-settle-state="settled"]');
    window.__TRACE.push({
      at: Math.round(performance.now() - t0),
      top: first ? Math.round(first.getBoundingClientRect().top) : null,
      h: thread ? Math.round(thread.scrollHeight) : null,
      going: going ? Math.round(going.getBoundingClientRect().height) : null,
      via: "interval",
    });
    if (performance.now() - t0 > 2600) clearInterval(iv);
  }, 8);
});

const confirmed = await clickText(page, "button", "^Confirm$");
await sleep(3000);
await clickText(page, "button", "^Acknowledge$");
await sleep(2600);

const trace = await page.evaluate(() => window.__TRACE ?? []);
const shape = await page.evaluate(() => ({
  settledRows: document.querySelectorAll(".wk-settled").length,
  settledNodes: document.querySelectorAll('[data-settle-state="settled"]').length,
  wrappers: document.querySelectorAll(".wk-ex").length,
  buttons: [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).slice(0, 24),
}));
await sleep(700);
await ctx.close();
await browser.close();

/* THE STEP DISTRIBUTION. Only frames where the height actually moved. */
const steps = [];
for (let i = 1; i < trace.length; i++) {
  const d = Math.abs((trace[i].h ?? 0) - (trace[i - 1].h ?? 0));
  if (d > 0) steps.push(d);
}
/* AND THE COLLAPSE ITSELF, sampled on the node that is leaving. Many small
   steps is a glide; one step the height of the exchange is the snap. */
const going = trace.filter((x) => x.via === "interval" && x.going !== null && x.going > 0);
const shrink = [];
for (let i = 1; i < going.length; i++) {
  const d = going[i - 1].going - going[i].going;
  if (d > 0) shrink.push(d);
}
const video = readdirSync(OUT).find((f) => f.endsWith(".webm"));
if (video) renameSync(`${OUT}/${video}`, `${OUT}/settle-glide.webm`);

const report = {
  target: TARGET,
  at: new Date().toISOString(),
  clip: video ? `${OUT}/settle-glide.webm` : null,
  frames: trace.length,
  layoutSteps: steps.length,
  largestStepPx: steps.length ? Math.max(...steps) : 0,
  medianStepPx: steps.length ? [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)] : 0,
  collapse: {
    samples: going.length,
    fromPx: going.length ? going[0].going : null,
    steps: shrink.length,
    largestStepPx: shrink.length ? Math.max(...shrink) : 0,
    medianStepPx: shrink.length ? [...shrink].sort((a, b) => a - b)[Math.floor(shrink.length / 2)] : 0,
  },
  firstOnStageTopMovedPx: (() => {
    const tops = trace.filter((x) => typeof x.top === "number").map((x) => x.top);
    return tops.length ? Math.max(...tops) - Math.min(...tops) : null;
  })(),
  confirmed,
  shape,
  errors,
};
writeFileSync(`${OUT}/report.json`, JSON.stringify({ ...report, trace }, null, 2));
console.log(JSON.stringify(report, null, 2));
