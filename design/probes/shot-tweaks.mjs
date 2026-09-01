/* FOUNDER TWEAK PASS — THE EVIDENCE SHOTS.

   Eight beats from the 2026-09-01 tweak list, driven through the built port at
   1360x900 and written to /tmp/tweaks-round1-compare. One image per finding, so
   the sign-off is a picture rather than a description.

   It runs against the SAME assembled build the probe suite measures (the built
   cockpit with live-data.json injected), and installs the probe's own stand-in
   connector so the surfaces that need a channel have one. Nothing here ships.

   Usage:  node shot-tweaks.mjs <url> [outDir]
*/
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const URL = process.argv[2] ?? "http://127.0.0.1:8901/";
const OUT = process.argv[3] ?? "/tmp/tweaks-round1-compare";
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
  await sleep(900);
};

/** Open the client, then the room, then bind the modification route. */
async function intoRoom(page) {
  await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
  await sleep(1200);
  await jsClick(page, "#fab");
  await sleep(600);
  await jsClick(page, "#actFacility");
  await sleep(2600);
  // The room opens unbound and asks which route this is. Bind it the way the
  // banker does, off the chips.
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".wk-opt")].find((b) => /Modify|modification/i.test(b.textContent));
    if (chip) chip.click();
  });
  await sleep(1800);
}

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript({ content: stub });
  // The copilot answers instantly through the stand-in, and the thinking beat
  // is a thing that has to be SEEN. Hold its answer for a moment from outside
  // the app, exactly as the probe holds the execute call.
  await ctx.addInitScript({
    content: `(function(){
      var wait = new Promise(function(r){ setTimeout(r, 20000); });
      var inner = window.claude && window.claude.mcp && window.claude.mcp.callTool;
      if (!inner) return;
      window.claude.mcp.callTool = function (server, tool, input) {
        if (/llm|copilot/i.test(tool)) return wait.then(function(){ return inner(server, tool, input); });
        return inner(server, tool, input);
      };
    })();`,
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "load" });
  await sleep(1400);

  /* 2 + 3 — THE TIGHTENED ARC, OVER ITS SCRIM. */
  await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
  await sleep(1400);
  await jsClick(page, "#fab");
  await sleep(900);
  await shot(page, "02-03-arc-tightened-and-scrim");
  await page.keyboard.press("Escape");
  await sleep(400);

  /* 1 — THE ASSIST BREATHES between the send and the answer. */
  await jsClick(page, "#fab");
  await sleep(600);
  await page.evaluate(() => {
    const chat = [...document.querySelectorAll(".arcbtn")].find((b) => b.dataset.act === "chat");
    if (chat) chat.click();
  });
  await sleep(900);
  await page.evaluate(() => {
    const box = document.querySelector(".chatin textarea");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(box, "What is the headroom on the revolver?");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".chatin").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await sleep(700);
  await shot(page, "01-chat-thinking-state");
  await jsClick(page, "#chatX");
  await sleep(500);

  /* 5 — ONE-ROW ROUTING CHIPS + THE "?" IN THE CORNER. */
  await jsClick(page, "#fab");
  await sleep(500);
  await jsClick(page, "#actFacility");
  await sleep(2600);
  await page.evaluate(() => {
    const b = document.querySelector(".wk-openbub .wk-whybtn");
    if (b) b.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  await sleep(300);
  await shot(page, "05-one-row-chips-and-why-button");

  /* 7 — THE INELIGIBLE FACILITY ROW, VISIBLE BUT DISABLED. */
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".wk-opt")].find((b) => /Modify/i.test(b.textContent));
    if (chip) chip.click();
  });
  await sleep(1800);
  await shot(page, "07-facility-rows-disabled-and-spacing");

  /* 10 — THE BORROWERS READ CARD. */
  await say(page, "which borrowers have we already in the package?");
  await sleep(900);
  await shot(page, "10-borrowers-read-card");

  /* 11 — THE COVENANTS READ CARD (the question that used to stage a delta). */
  await say(page, "what covenants are against this Product Package");
  await sleep(1100);
  await shot(page, "11-covenants-read-card");

  /* 8 — THE THREAD, COMPACT: three sends behind one earlier-steps chip. */
  await say(page, "show me the collateral");
  await sleep(900);
  await shot(page, "08-thread-collapsed");

  /* 9 — THE NEUTRAL ADVISORY / DELTA CHIPS. */
  await say(page, "increase the Line of Credit to $19M");
  await sleep(1400);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll(".wk-opt")].find((b) => /\$15M|Line of Credit/i.test(b.textContent));
    if (opt) opt.click();
  });
  await sleep(1600);
  await shot(page, "09-neutral-delta-chips");

  await browser.close();
  console.log("\nwrote to", OUT);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
