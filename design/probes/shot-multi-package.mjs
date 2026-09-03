/* MORE THAN ONE PRODUCT PACKAGE. THE EVIDENCE SHOTS.
 *
 * Fabian, 2026-09-02: "by that time we have not even selected a Product Package,
 * why does it know that we are talking about this package (there is only one but
 * what happens on multiple ones)?"
 *
 * Four beats, driven through the assembled build at 1440x940 and
 * deviceScaleFactor 2, against the two-package fixture
 * (`scripts/two-package-fixture.mjs`): Sterling Fabrication with a second
 * package holding one facility still in credit approval. The shipped book has no
 * such relationship, so these are the first frames this branch has ever had.
 *
 *   1  the ask            the room asks which package, as line items, with no
 *                         route chips, no facilities and no greeting under it
 *   2  after the pick     the room anchored, greeting composed against THAT
 *                         package, route chips back, facilities under them
 *   3  the header line    the Package line on the header, open, listing both
 *   4  one package        Hartwell, for the regression: bound silently, and the
 *                         header says which
 *
 * Usage:  node shot-multi-package.mjs <two-package url> <shipped url> [outDir]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TWO = process.argv[2] ?? "http://127.0.0.1:8951/two.html";
const ONE = process.argv[3] ?? "http://127.0.0.1:8951/";
const OUT = process.argv[4] ?? "/tmp/mp-shots";
const HERE = fileURLToPath(new URL(".", import.meta.url));

/* THE DOOR, STUBBED TO SPEAK THE ENVELOPE BACK.
 *
 * `lib/stub-hygiene.js` answers a fixed Hartwell sentence, which under a
 * Sterling package would be evidence of nothing. This one QUOTES the envelope it
 * was handed - the package name, the id and the member count - so the shot is
 * proof that the greeting was composed against the package the banker picked
 * rather than against the relationship. Nothing here reaches a model. */
const stub = `(function () {
  window.claude = {
    mcp: { callTool: function () { return Promise.resolve({ payload: {} }); } },
    use: function (name) {
      if (name !== "sample") return Promise.resolve(null);
      return Promise.resolve(function (input, options) {
        var env = null, i = input.lastIndexOf("\\nCONTEXT:\\n");
        if (i >= 0) { try { env = JSON.parse(input.slice(i + 10)); } catch (e) {} }
        var text = env
          ? "Standing in " + env.packageName + " (" + (env.productPackageId || "no id") +
            "), " + (env.facilities || []).length + " member(s) in scope. Every figure below is this package's."
          : "No envelope reached the door.";
        var onText = options && options.onText;
        if (onText) setTimeout(function () { onText({ text: text, delta: text }); }, 120);
        return new Promise(function (r) { setTimeout(function () { r({ text: text, truncated: false, modelTierApplied: "quick" }); }, 260); });
      });
    },
  };
})();`;

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jsClick = (page, sel, n = 0) =>
  page.evaluate(
    ([s, i]) => {
      const e = document.querySelectorAll(s)[i];
      if (e) e.click();
      return Boolean(e);
    },
    [sel, n],
  );

async function intoRoom(page, url, accountId) {
  await page.goto(url, { waitUntil: "load" });
  await sleep(2200);
  // A whisper or an intent lane over the worklist would take the click.
  await page.keyboard.press("Escape");
  await sleep(400);
  const opened = await jsClick(page, `[data-open="${accountId}"]`);
  if (!opened) throw new Error(`no worklist row for ${accountId}`);
  await sleep(1500);
  await jsClick(page, "#fab");
  await sleep(800);
  await jsClick(page, "#actFacility");
  await sleep(3000);
}

const main = async () => {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
  await ctx.addInitScript({ content: stub });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));

  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("  ->", name);
  };
  const reader = () => {
      const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
      const line = document.querySelector(".wk-pkgline");
      return {
        pkgline: line ? line.getAttribute("data-pkgline") : null,
        pklineText: clean(line?.textContent),
        headline: clean(document.querySelector(".wk-headline")?.textContent),
        askCards: [...document.querySelectorAll(".wk-pkgask .wk-pkg")].map((b) => clean(b.textContent)),
        routeChips: [...document.querySelectorAll(".wk-routes .wk-opt")].map((b) => clean(b.textContent)),
        facilities: document.querySelectorAll(".wk-mchip").length,
        remark: clean(document.querySelector(".wk-narr .wk-bub")?.textContent),
        placeholder: document.querySelector(".wk-txt")?.placeholder ?? null,
      };
  };
  const read = () => page.evaluate(reader);

  /* 1. THE ASK. */
  await intoRoom(page, TWO, "001SAMPLE0000STRL");
  const asking = await read();
  await shot("01-the-ask");
  console.log("1 asking:", JSON.stringify(asking, null, 1));

  /* 2. THE PICK, and the room that comes back anchored. */
  await jsClick(page, ".wk-pkgask .wk-pkg");
  await sleep(4200);
  const anchored = await read();
  await shot("02-after-the-pick");
  console.log("2 anchored:", JSON.stringify(anchored, null, 1));

  /* 2b. AND THE ROUTE, so the anchored package's own members are on the glass. */
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".wk-opt")].find((b) => /Modify/i.test(b.textContent || ""));
    if (chip) chip.click();
  });
  await sleep(3000);
  const bound = await read();
  await shot("02b-the-anchored-package-and-its-members");
  console.log("2b bound:", JSON.stringify(bound, null, 1));

  /* 3. THE HEADER LINE, open. */
  await jsClick(page, ".wk-pkgline");
  await sleep(700);
  const listed = await page.evaluate(() =>
    [...document.querySelectorAll("[data-pkgrow]")].map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()),
  );
  await shot("03-the-header-package-line");
  console.log("3 listed:", JSON.stringify(listed, null, 1));

  /* 4. ONE PACKAGE, THE REGRESSION, in a page of its own. The room mounts a
        body class and a modal stack, and a second relationship driven through
        the same page would be evidence about the navigation rather than about
        the beat. */
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
  await ctx2.addInitScript({ content: stub });
  const page2 = await ctx2.newPage();
  page2.on("pageerror", (e) => errors.push(String(e.message)));
  await intoRoom(page2, ONE, "001bb00001I7FPNAA3");
  const only = await page2.evaluate(reader);
  await page2.screenshot({ path: `${OUT}/04-one-package-binds-silently.png` });
  console.log("  -> 04-one-package-binds-silently");
  console.log("4 one package:", JSON.stringify(only, null, 1));

  console.log("page errors:", JSON.stringify(errors));
  await browser.close();
  if (errors.length) process.exit(1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
