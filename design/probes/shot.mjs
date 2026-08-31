/* SIDE-BY-SIDE EVIDENCE — SURFACE 5, THE WORKROOM RITUAL.
   HANDOVER §7.3: "side-by-side eyeball at 1360x900 ... founder sign-off per
   surface". This drives the frozen dummy and the built port through the SAME
   eight beats of the ritual and writes both sets to /tmp/mint-workroom-compare,
   so the sign-off is a pair of images per beat rather than a description.

   The port run installs the probe's stand-in connector (lib/stub-connector.js):
   the room refuses to invent a plan, so the execute-side beats only exist on
   the far side of a write, and the harness supplies one from OUTSIDE the app.

   Usage:  node shot.mjs      (expects /tmp/mint-workroom-serve/index.html,
                               the built cockpit with live-data.json injected)
*/
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const OUT = "/tmp/mint-workroom-compare";
const stub = readFileSync("lib/stub-connector.js", "utf8");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".woff2":"font/woff2", ".svg":"image/svg+xml" };

function serve(dir, port) {
  return createServer((q, r) => {
    let f = join(dir, q.url.split("?")[0] === "/" ? "/index.html" : q.url.split("?")[0]);
    if (!existsSync(f)) f = join(dir, "index.html");
    r.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
    r.end(readFileSync(f));
  }).listen(port);
}

const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("  ->", name); };
const jsClick = (p, sel, n = 0) => p.evaluate(([s, i]) => { const e = document.querySelectorAll(s)[i]; if (e) e.click(); }, [sel, n]);
const byText = (p, txt, all = false) => p.evaluate(([t, a]) => {
  const bs = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === t);
  (a ? bs : bs.slice(0, 1)).forEach((b) => b.click());
  return bs.length;
}, [txt, all]);

async function dummy(browser) {
  const srv = serve("../dummy", 39001);
  const p = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await p.goto("http://127.0.0.1:39001/"); await p.waitForTimeout(1200);
  await jsClick(p, ".wlrow", 0); await p.waitForTimeout(1400);
  await jsClick(p, "#fab"); await p.waitForTimeout(700);
  await jsClick(p, "#actModify"); await p.waitForTimeout(900);
  await shot(p, "dummy-1-open");
  await p.waitForTimeout(2200); await jsClick(p, "#pkgBooked"); await p.waitForTimeout(1600);
  await shot(p, "dummy-2-brief");
  await jsClick(p, ".wk-fac", 0); await p.waitForTimeout(700);
  await p.evaluate(() => { const i = document.querySelector("#wkInput"); i.value = "Increase the revolver to $19M"; document.querySelector("#wkSend").click(); });
  await p.waitForTimeout(1600); await shot(p, "dummy-3-delta");
  await byText(p, "Confirm"); await p.waitForTimeout(700);
  await jsClick(p, ".wk-propose"); await p.waitForTimeout(700); await shot(p, "dummy-4-flowcard");
  await byText(p, "Execute write"); await p.waitForTimeout(1400); await shot(p, "dummy-5-executing");
  await p.waitForTimeout(3900); await shot(p, "dummy-6-dossier");
  await p.waitForTimeout(900); await shot(p, "dummy-7-writeback");
  await jsClick(p, "#wkClose"); await p.waitForTimeout(500); await shot(p, "dummy-8-closed-wash");
  await p.close(); srv.close();
}

async function port(browser) {
  const srv = serve("/tmp/mint-workroom-serve", 39002);
  const p = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await p.addInitScript(stub);
  await p.goto("http://127.0.0.1:39002/"); await p.waitForTimeout(1400);
  await jsClick(p, '[data-open="001bb00001I7FPNAA3"]'); await p.waitForTimeout(1600);
  await jsClick(p, '.topnav .itab[data-pane="exposure"]'); await p.waitForTimeout(600);
  await jsClick(p, "#fab"); await p.waitForTimeout(700);
  await jsClick(p, "#actModify"); await p.waitForTimeout(900);
  await shot(p, "port-1-open");
  await p.waitForTimeout(2200); await shot(p, "port-2-brief");
  await jsClick(p, ".wk-mchip", 0); await p.waitForTimeout(1100);
  await p.evaluate(() => { const i = document.querySelector(".wk-txt"); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(i, "Increase the Line of Credit to $19M"); i.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector(".wk-send").click(); });
  await p.waitForTimeout(1800); await shot(p, "port-3-delta");
  await byText(p, "Confirm"); await p.waitForTimeout(700);
  await byText(p, "Discard", true); await p.waitForTimeout(500);
  await byText(p, "Acknowledge", true); await p.waitForTimeout(500);
  await jsClick(p, ".wk-propose"); await p.waitForTimeout(900); await shot(p, "port-4-flowcard");
  await p.evaluate(() => { const bs = [...document.querySelectorAll(".wk-flowcard button")]; bs[bs.length - 1].click(); });
  await p.waitForTimeout(900); await shot(p, "port-5-executing");
  await p.waitForTimeout(1600); await shot(p, "port-6-dossier");
  await p.waitForTimeout(1200); await shot(p, "port-7-writeback");
  await jsClick(p, ".wk-head .wk-icobtn"); await p.waitForTimeout(500); await shot(p, "port-8-closed-wash");
  await p.close(); srv.close();
}

const b = await chromium.launch();
console.log("dummy:"); await dummy(b);
console.log("port:"); await port(b);
await b.close();
