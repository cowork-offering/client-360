/* THE COMPOSER PLUS MENU — THE EVIDENCE SHOTS.

   Five beats, driven through the built cockpit with the live Hartwell package
   injected, at 1360x900 and deviceScaleFactor 2. One image per claim, so the
   sign-off is a picture rather than a description.

   Usage:  node shot-composer-plus.mjs <url> [outDir]
*/
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const URL = process.argv[2] ?? "http://127.0.0.1:8901/";
const OUT = process.argv[3] ?? "/tmp/composer-plus-shots";
const stub = readFileSync(resolve(HERE, "lib", "stub-connector.js"), "utf8");

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name) => {
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  ->", name);
};
const jsClick = (p, sel, n = 0) =>
  p.evaluate(([s, i]) => {
    const e = document.querySelectorAll(s)[i];
    if (e) e.click();
    return !!e;
  }, [sel, n]);

/** Click the panel row whose label matches. */
const pickRow = (p, re) =>
  p.evaluate((src) => {
    const rx = new RegExp(src, "i");
    const row = [...document.querySelectorAll(".cp-row")].find((b) => rx.test(b.textContent || ""));
    if (row) row.click();
    return !!row;
  }, re);

async function intoRoom(page) {
  await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
  await sleep(1400);
  await jsClick(page, "#fab");
  await sleep(700);
  await jsClick(page, "#actFacility");
  await sleep(2800);
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".wk-opt")].find((b) => /Modify|modification/i.test(b.textContent));
    if (chip) chip.click();
  });
  await sleep(2000);
}

const main = async () => {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript({ content: stub });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "load" });
  await sleep(1600);

  await intoRoom(page);

  /* 1 — THE COMPOSER AT REST, with the plus beside the send. */
  await page.evaluate(() => {
    const el = document.querySelector(".wk-composer");
    if (el) el.scrollIntoView({ block: "center" });
  });
  await sleep(400);
  await shot(page, "01-composer-closed");

  /* 2 — LEVEL ONE: the members of the Product Package. */
  await page.click(".cp-plus");
  await page.mouse.move(680, 450);
  await sleep(600);
  await shot(page, "02-level-1-facilities");

  /* 3 — THE FILTER READS EVERY LEVEL AT ONCE. */
  await page.fill(".cp-find-in", "guarantor");
  await page.mouse.move(680, 450);
  await sleep(500);
  await shot(page, "03-filter-guarantor");
  await page.fill(".cp-find-in", "");
  await sleep(400);

  /* 4 — LEVEL TWO: the topics on the $15M line of credit. */
  await pickRow(page, "Line of Credit");
  await sleep(400);
  await shot(page, "04-level-2-topics-15M-line");

  /* 5 — LEVEL THREE: Legal Entity, then the REAL parties on that facility. */
  await pickRow(page, "^\\s*Legal Entity");
  await sleep(350);
  await pickRow(page, "Remove a party");
  await sleep(400);
  await shot(page, "05-level-3-legal-entity-real-borrowers");

  /* 5 — THE PICK LANDS IN THE COMPOSER, placeholder selected, nothing sent.
        Facility Terms, because that is where a figure the banker has to supply
        actually is: the line arrives with [amount] under the caret. */
  await page.keyboard.press("Backspace");
  await sleep(300);
  await page.keyboard.press("Backspace");
  await sleep(300);
  await pickRow(page, "Facility Terms");
  await sleep(350);
  await pickRow(page, "Increase the commitment");
  await sleep(700);
  await shot(page, "06-composer-after-pick");

  /* 7 — THE RELATIONSHIP ROOM. Level one has one subject, so the panel opens
        past it, on the reviews and the service request this build carries. */
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.reload({ waitUntil: "load" });
  await sleep(1600);
  await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
  await sleep(1400);
  await jsClick(page, "#fab");
  await sleep(700);
  await jsClick(page, "#actRelationship");
  await sleep(3200);
  await page.click(".cp-plus");
  await sleep(600);
  await shot(page, "07-relationship-room-reviews");

  const draft = await page.evaluate(() => document.querySelector(".wk-txt").value);
  const sel = await page.evaluate(() => {
    const el = document.querySelector(".wk-txt");
    return { start: el.selectionStart, end: el.selectionEnd, selected: el.value.slice(el.selectionStart, el.selectionEnd) };
  });
  console.log("composer draft:", JSON.stringify(draft));
  console.log("selection:", JSON.stringify(sel));

  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
