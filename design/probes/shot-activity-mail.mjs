/* THE ACTIVITY MAIL ROW: THE EVIDENCE SHOTS.

   Founder, 2026-09-03: "in the activity, when an email is coming in: it looks
   pretty bad, it has this long winded text, and the pop up still opens up the
   old loan modification tab, not our workroom. I need it sleek and elegant."

   Four states, driven through the ASSEMBLED build with lib/stub-mail.js in
   front of it. Everything between the sweep and the glass is the real code:
   the row, the expand, the whisper and the room are the app's own.

     1  the row        the trail after a sweep landed one client message
     2  expanded       the body brought back on one click
     3  the whisper    the arrival, one line, in the corner
     4  the room       our facility workroom, opened FROM the row, with the
                       message baked into the greeting

   Usage:  node shot-activity-mail.mjs <assembled index.html> [outDir]
*/
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2] ?? "/tmp/activity-mail-serve/index.html";
const OUT = process.argv[3] ?? "/tmp/activity-mail-shots";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const stub = readFileSync(`${HERE}lib/stub-mail.js`, "utf8");
const html = readFileSync(SRC, "utf8");

mkdirSync(OUT, { recursive: true });

const ARGS = ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer((_q, r) => {
  r.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  r.end(html);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const PORT = server.address().port;

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

const browser = await chromium.launch({ args: ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
await ctx.addInitScript({ content: stub });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const shot = async (name, clip) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  console.log("  ->", name + ".png");
};

/** The trail's own box, so the row is read at the size a banker reads it. */
const boxOf = async (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: r.width + 48, height: r.height + 48 };
  }, sel);

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
await sleep(1800);

// ---- the relationship, and the sweep that brings the message in -------------
await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
await sleep(1600);
await clickText(page, "button", "^Sync$");
await sleep(11000);

const row = await page.evaluate(() => {
  const el = document.querySelector("[data-mail-row]");
  return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
});
console.log("row:", row);

await shot("1-activity-feed");
const trail = await boxOf(".pane .tl");
if (trail) await shot("1-activity-feed-close", trail);

// ---- the whisper -----------------------------------------------------------
const whisper = await page.evaluate(() => {
  const el = document.querySelector("#mailWhisper");
  return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
});
console.log("whisper:", whisper);
const wbox = await boxOf("#mailWhisper");
if (wbox) await shot("3-whisper", wbox);

// ---- the body, brought back on one click -----------------------------------
await jsClick(page, "[data-mail-expand]");
await sleep(600);
await shot("2-row-expanded");
const openTrail = await boxOf(".pane .tl");
if (openTrail) await shot("2-row-expanded-close", openTrail);
await jsClick(page, "[data-mail-expand]");
await sleep(400);

// ---- the room, opened FROM the row -----------------------------------------
await jsClick(page, "[data-mail-open]");
await sleep(5200);
await shot("4-workroom-from-mail");

const greeting = await page.evaluate(() => {
  const prompts = (window.__DRIVE_OUT && window.__DRIVE_OUT.prompts) || [];
  const g = prompts.find((p) => /The room has just OPENED/.test(p));
  if (!g) return null;
  const i = g.lastIndexOf("\nCONTEXT:\n");
  try {
    return JSON.parse(g.slice(i + 10)).mail ?? null;
  } catch (e) {
    return "unparsed";
  }
});
const chips = await page.evaluate(() =>
  [...document.querySelectorAll(".wk-opt")].map((c) => (c.textContent || "").trim()),
);
const legacy = await page.evaluate(
  () => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute("aria-label")).filter(Boolean),
);

console.log(JSON.stringify({ row, whisper, greetingMail: greeting, chips, dialogs: legacy, errors }, null, 2));

await ctx.close();
await browser.close();
server.close();
