/* THE SALESFORCE BUBBLE — THE EVIDENCE SHOTS.

   Four states from the 2026-09-01 founder directive, driven through the built
   port at 1360x900: arc closed, arc open (the cloud in its seat), the tier
   fanned, and the tier with nothing behind it. It also runs the glass census in
   each state and prints the measured arc + tier geometry, so the sign-off is a
   picture AND a number rather than a description.

   The disabled state is produced the way the app would actually meet it: the
   page is re-served with `meta.instanceUrl` stripped from the injected bundle.

   Usage:  node shot-sf-bubble.mjs [outDir]
*/
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? "/tmp/sf-bubble-compare";
const SRC = "/tmp/sf-bubble-serve/index.html";
const stub = readFileSync("lib/stub-connector.js", "utf8");
const probeLib = readFileSync("lib/inject.js", "utf8");

mkdirSync(OUT, { recursive: true });

const html = readFileSync(SRC, "utf8");

/** The same bundle with the org's Lightning host taken away — which is exactly
 *  what a view assembled without one looks like.
 *
 *  SURGERY ON THE SLOT, NEVER ON THE FILE. The bundle's own JS carries the
 *  marker text and the field name; a regex across the whole document rewrites
 *  code as readily as data and lands on "No data injected". The payload is
 *  parsed, edited and re-serialised instead. */
const OPEN = '<script id="c360-data" type="application/json">';
const hostless = (() => {
  const a = html.indexOf(OPEN) + OPEN.length;
  const b = html.indexOf("</script>", a);
  const payload = JSON.parse(html.slice(a, b));
  delete payload.meta.instanceUrl;
  return html.slice(0, a) + JSON.stringify(payload) + html.slice(b);
})();

function serve(body, port) {
  return createServer((_q, r) => {
    r.writeHead(200, { "content-type": "text/html" });
    r.end(body);
  }).listen(port);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name) => {
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  ->", name + ".png");
};
const jsClick = (p, sel, n = 0) =>
  p.evaluate(([s, i]) => {
    const e = document.querySelectorAll(s)[i];
    if (e) e.click();
    return !!e;
  }, [sel, n]);

const census = (p, state) =>
  p.evaluate((s) => {
    const raw = window.__P.census(false);
    const violations = raw.filter((e) => {
      const expected = e.cls.split(/\s+/).includes("arclbl") ? 1 : 3;
      return e.insetCount !== expected;
    });
    return {
      state: s,
      glassSurfaceCount: raw.length,
      glassRimViolationCount: violations.length,
      glassRimViolations: violations.map((v) => ({ cls: v.cls, insetCount: v.insetCount })),
      sfTierBlurPx: raw.filter((e) => e.cls.split(/\s+/).includes("sfbtn")).map((e) => e.blurPx),
    };
  }, state);

const geometry = (p) =>
  p.evaluate(() => {
    const c = (el) => {
      const r = el.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: +r.width.toFixed(2) };
    };
    const fab = c(document.querySelector("#fab"));
    const r2 = (n) => +n.toFixed(2);
    const arc = [...document.querySelectorAll(".arcbtn")].map(c);
    const tier = [...document.querySelectorAll(".sfbtn")].map(c);
    const sf = c(document.querySelector("#actSalesforce"));
    return {
      arcSatelliteCount: arc.length,
      arcRadiiPx: arc.map((a) => r2(Math.hypot(a.cx - fab.cx, a.cy - fab.cy))),
      arcNeighbourSpacingPx: arc.slice(1).map((a, i) => r2(Math.hypot(a.cx - arc[i].cx, a.cy - arc[i].cy))),
      tierCount: tier.length,
      tierDiameterPx: tier.map((t) => t.w),
      tierOffsetFromSatellitePx: tier.map((t) => r2(Math.hypot(t.cx - sf.cx, t.cy - sf.cy))),
      tierAngleOffRadialDeg: tier.map((t) =>
        r2((Math.atan2(-(t.cy - sf.cy), -(t.cx - sf.cx)) * 180) / Math.PI),
      ),
    };
  });

async function page(browser, port) {
  const p = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await p.addInitScript(stub);
  await p.goto(`http://127.0.0.1:${port}/`);
  await p.waitForTimeout(1400);
  await p.evaluate(probeLib);
  return p;
}

const browser = await chromium.launch();
const live = serve(html, 39101);
const dead = serve(hostless, 39102);
const report = [];

/* ---------------------------------------------- the wired org: three states */
{
  const p = await page(browser, 39101);
  await jsClick(p, ".wlrow, [role='button'][data-open]", 0);
  await sleep(1400);
  await shot(p, "1-arc-closed");
  report.push(await census(p, "arc-closed"));

  await jsClick(p, "#fab");
  await sleep(900);
  await shot(p, "2-arc-open");
  report.push(await census(p, "arc-open"));

  await jsClick(p, "#actSalesforce");
  await sleep(900);
  await shot(p, "3-tier-fanned");
  report.push(await census(p, "tier-fanned"));
  console.log("\ngeometry:", JSON.stringify(await geometry(p), null, 2));

  console.log("\nhrefs:", JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll(".sfbtn")].map((b) => ({
        id: b.id,
        tag: b.tagName,
        href: b.getAttribute("href"),
        target: b.getAttribute("target"),
        rel: b.getAttribute("rel"),
      })),
    ),
    null,
    2,
  ));

  // The narrator, hovered across the whole corner.
  console.log("\nnarrator:", JSON.stringify(
    await p.evaluate(async () => {
      const lbl = document.querySelector("#arcLbl");
      const out = { atRest: lbl.textContent, labels: [], fits: true };
      for (const b of [...document.querySelectorAll(".arcbtn"), ...document.querySelectorAll(".sfbtn")]) {
        b.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
        await new Promise((r) => setTimeout(r, 40));
        const rr = lbl.getBoundingClientRect();
        out.labels.push(lbl.textContent);
        if (rr.x < 0 || rr.x + rr.width > window.innerWidth) out.fits = false;
        b.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
        await new Promise((r) => setTimeout(r, 20));
      }
      return out;
    }),
  ));
  await p.close();
}

/* ------------------------------------------------- no org address: the dead tier */
{
  const p = await page(browser, 39102);
  await jsClick(p, ".wlrow, [role='button'][data-open]", 0);
  await sleep(1400);
  await jsClick(p, "#fab");
  await sleep(700);
  await jsClick(p, "#actSalesforce");
  await sleep(900);
  await shot(p, "4-tier-disabled");
  report.push(await census(p, "tier-disabled"));
  console.log("\ndisabled tier:", JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll(".sfbtn")].map((b) => ({
        id: b.id,
        tag: b.tagName,
        cls: b.className,
        title: b.getAttribute("title"),
        ariaDisabled: b.getAttribute("aria-disabled"),
        href: b.getAttribute("href"),
      })),
    ),
    null,
    2,
  ));
  await p.close();
}

console.log("\nglass census:", JSON.stringify(report, null, 2));
await browser.close();
live.close();
dead.close();
