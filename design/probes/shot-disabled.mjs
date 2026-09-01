/* Tweak 7 — the ineligible facility row. Hartwell's package is entirely booked,
   so the state is shown on the relationship that actually carries it: Piedmont,
   whose three facilities are all at Final Review and none of which a credit
   action can run against. */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const URL = process.argv[2], OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const stub = readFileSync("lib/stub-connector.js", "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript({ content: stub });
const p = await ctx.newPage();
await p.goto(URL, { waitUntil: "load" });
await sleep(1300);
await p.evaluate(() => document.querySelector('[data-open="001bb00001DLtRMAA1"]').click());
await sleep(1500);
await p.evaluate(() => document.querySelector("#fab").click());
await sleep(600);
await p.evaluate(() => document.querySelector("#actFacility").click());
await sleep(2800);
await p.evaluate(() => {
  const c = [...document.querySelectorAll(".wk-opt")].find((x) => /Modify/i.test(x.textContent));
  if (c) c.click();
});
await sleep(2000);
const rows = await p.evaluate(() =>
  [...document.querySelectorAll(".wk-mchip")].map((r) => ({ text: r.textContent, disabled: r.disabled, title: r.title })),
);
console.log(JSON.stringify(rows, null, 1));
await p.evaluate(() => {
  const r = document.querySelector(".wk-mchip");
  if (r) r.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
});
await sleep(400);
await p.screenshot({ path: `${OUT}/07-facility-rows-disabled-and-spacing.png` });
console.log("  -> 07-facility-rows-disabled-and-spacing (Piedmont: all three at Final Review)");
await b.close();
