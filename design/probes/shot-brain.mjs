/* THE BRAIN LANE + BATCH 2 — THE EVIDENCE SHOTS.

   Four beats, driven through the built port at 1360x900 and written to
   /tmp/brain-wiring-compare. One image per claim, so the sign-off is a picture.

     01  the brain lane's CLARIFY, as an agent bubble with its options as chips
     02  a READ-CARD rendered from a brain reply, through the room's own card
     03  the result dossier, with the link to the package the plan filed against
     04  the Activity trail, with the executed modification on it

   It runs against the SAME assembled build the probe suite measures and
   installs the probe's own stand-in connector, whose completion door answers IN
   CONTRACT so the lane's rendering can be seen. The app itself still refuses to
   simulate; nothing here ships.

   THE ROUND TRIP IS STUBBED, NOT THE LANE. Everything between the composer and
   the glass is the real code: the routing decision, the envelope, the hard
   validator, the card adapter and the degrade. What a live panel session adds
   is a real session on the far side of the door.

   Usage:  node shot-brain.mjs <url> [outDir]
*/
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const URL = process.argv[2] ?? "http://127.0.0.1:8901/";
const OUT = process.argv[3] ?? "/tmp/brain-wiring-compare";
const stub = readFileSync("lib/stub-connector.js", "utf8");

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

const say = async (p, text) => {
  await p.evaluate((t) => {
    const input = document.querySelector(".wk-txt");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".wk-send").click();
  }, text);
  await sleep(1300);
};

/** Open the client, then the room, then bind the modification route. */
async function intoRoom(page) {
  await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
  await sleep(1300);
  await jsClick(page, "#fab");
  await sleep(600);
  await jsClick(page, "#actFacility");
  await sleep(2600);
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".wk-opt")].find((b) => /Modify|modification/i.test(b.textContent));
    if (chip) chip.click();
  });
  await sleep(1900);
}

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript({ content: stub });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "load" });
  await sleep(1400);

  await intoRoom(page);

  /* 01 — THE CLARIFY. A question the room cannot answer from the package goes
          to the desk, and the desk asks back. An agent bubble, options as chips
          that SAY their own sentence through the same parser. */
  await say(page, "how much headroom is left before we trip the coverage test");
  await sleep(700);
  await shot(page, "01-brain-clarify-bubble");

  /* 02 — THE READ-CARD, from a brain reply, through the room's own card
          components: grouped rows, type icons, the warn row in the ink, and the
          follow-up that flows into an op the room already has. */
  await say(page, "which borrowers have we already in the package?");
  await sleep(900);
  await shot(page, "02-brain-read-card");

  /* 03 — THE DOSSIER, with the link. Stage a real change on the fast lane,
          confirm it, review it, file it. */
  await say(page, "increase the Line of Credit to $19M");
  await sleep(1500);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll(".wk-opt")].find((b) => /Line of Credit/i.test(b.textContent));
    if (opt) opt.click();
  });
  await sleep(1700);
  // "Line of Credit" legitimately names TWO members of this package, so the
  // parser offers both. Take the one the banker meant and drop the other: the
  // room takes one decision at a time and will not open the review until every
  // card in the step is settled.
  await page.evaluate(() => {
    const confirm = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Confirm");
    if (confirm) confirm.click();
  });
  await sleep(1200);
  await page.evaluate(() => {
    for (const b of [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === "Discard")) b.click();
  });
  await sleep(900);
  await page.evaluate(() => {
    for (const b of [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === "Acknowledge")) b.click();
  });
  await sleep(900);
  await jsClick(page, ".wk-propose");
  await sleep(1600);
  await page.evaluate(() => {
    const approve = document.querySelector(".wk-approve");
    if (approve) approve.click();
  });
  // The stand-in takes ~1.8s, then the dossier constructs itself over ~2s.
  await sleep(5200);
  await shot(page, "03-dossier-with-ncino-link");

  /* 04 — THE TRAIL. Close the room, open the client's Activity tab, and the
          modification is on the timeline with its count and its approver. The
          hero's own quiet "Open in nCino" is in the same frame. */
  await page.evaluate(() => {
    const x = document.querySelector(".wk-head .wk-icobtn");
    if (x) x.click();
  });
  await sleep(1600);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll(".topnav .itab")].find((t) => /activity/i.test(t.textContent || t.dataset.pane || ""));
    if (tab) tab.click();
  });
  await sleep(1600);
  await shot(page, "04-activity-trail-modification");

  await browser.close();
  console.log("\nwrote to", OUT);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
