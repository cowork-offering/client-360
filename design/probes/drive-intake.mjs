/* THE RELATIONSHIP INTAKE DRIVE: the sixth route, both flows, one report.

   Modelled on drive-greeting.mjs and standing on the SAME assembled build the
   probe suite measures, with lib/stub-intake.js in front of it. Everything
   between the room and the glass is the real code: the route reader, the step
   machine, the chips, the loops, the read-back, the payload builder and the
   confirm gate. What the stub supplies is the org's own catalogs and the intake
   pair, which is not deployed yet.

   TWO RUNS.

     COV   three covenants through the covenant flow, the first one carried
           whole on the opening line, then two more through the loop.
     COL   two assets through the collateral flow, in full detail: the type from
           a family the org splits, the description, the value, the basis, the
           source, the date, the address as one line, and the owner.

   WHAT THE REPORT CARRIES. Every question the room asked with its chips, the
   lane rows it read back, the payload as it went on the wire byte for byte, the
   plan's own step names and refusals, and the trail after the execute.

   Usage:  node drive-intake.mjs [outDir] [port]
*/
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { resolve } from "node:path";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = process.argv[2] ?? "/tmp/intake-drive";
const PORT = Number(process.argv[3] ?? 8922);
const HARTWELL = "001bb00001I7FPNAA3";

const stub = readFileSync(`${HERE}lib/stub-intake.js`, "utf8");
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------- the assembled build

   THE DRIVE ASSEMBLES ITS OWN PAGE and never touches artifact/, which the
   assembler agent owns. It is the same injection assemble-artifact.mjs makes:
   the full script tag, asserted unique, and the JSON re-parsed before it goes
   anywhere near a browser. */
const BUNDLE = resolve(ROOT, "app", "dist", "cockpit.html");
const DATA = resolve(ROOT, "artifact", "live-data.json");
const FULL_TAG = '<script id="c360-data" type="application/json">/*__C360_DATA__*/</script>';

if (!existsSync(BUNDLE)) {
  console.error(`FATAL: ${BUNDLE} not found. Run \`npm run build\` in app/ first.`);
  process.exit(1);
}
const tpl = readFileSync(BUNDLE, "utf8");
const data = readFileSync(DATA, "utf8");
JSON.parse(data);
const occurrences = tpl.split(FULL_TAG).length - 1;
if (occurrences !== 1) {
  console.error(`FATAL: expected exactly 1 injection marker, found ${occurrences}. Refusing to guess.`);
  process.exit(1);
}
const page = tpl.replace(
  FULL_TAG,
  `<script id="c360-data" type="application/json">${data.replace(/<\//g, "<\\/")}</script>`,
);
const PAGE_FILE = `${OUT}/cockpit-intake.html`;
writeFileSync(PAGE_FILE, page);

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(page);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const TARGET = `http://127.0.0.1:${PORT}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jsClick = (p, sel, n = 0) =>
  p.evaluate(
    ([s, i]) => {
      const e = document.querySelectorAll(s)[i];
      if (e) e.click();
      return Boolean(e);
    },
    [sel, n],
  );

const clickText = (p, sel, rx) =>
  p.evaluate(
    ([s, r]) => {
      const el = [...document.querySelectorAll(s)].find((b) => new RegExp(r, "i").test(b.textContent || ""));
      if (el) el.click();
      return Boolean(el);
    },
    [sel, rx],
  );

/**
 * ANSWER THE LIVE QUESTION THE WAY A BANKER WOULD.
 *
 * A CHIP IS CLICKED, NOT TYPED. The chips carry the org's own VALUE and show a
 * banker-language LABEL, and typing the label at a chips step is not the same
 * gesture: the room reads a chips answer against the value, so "Add a second"
 * typed at a step whose value is "second" is a line the step cannot read and it
 * goes to the desk instead. The first run of this drive typed everything and
 * stalled there. Anything the chips do not carry is typed, which is the other
 * half of what a banker does.
 */
const answerRoom = async (p, said) => {
  const clicked = await p.evaluate((t) => {
    const live = [...document.querySelectorAll(".wk-step:not(.wk-gone) .wk-agent .wk-bub")]
      .map((el) => ({ el, n: Number(((el.textContent || "").replace(/\s+/g, " ").trim().match(/^Step (\d+) of/) || [0, -1])[1]) }))
      .filter((x) => x.n >= 0)
      .sort((a, b) => a.n - b.n)
      .pop();
    if (!live) return false;
    const chips = [...live.el.querySelectorAll(".wk-opts .wk-opt")];
    /* A CHIP READS AS ITS LABEL FOLLOWED BY ITS DETAIL LINE, both inside the
       button, so the match is on the label the chip OPENS with rather than on
       the whole of its text. */
    const hit = chips.find((c) => {
      const label = (c.textContent || "").replace(/\s+/g, " ").trim();
      return label.toLowerCase().startsWith(t.toLowerCase());
    });
    if (!hit) return false;
    hit.click();
    return true;
  }, said);
  if (clicked) {
    await sleep(1400);
    return "chip";
  }
  await say(p, said);
  return "typed";
};

const say = async (p, text) => {
  await p.evaluate((t) => {
    const input = document.querySelector(".wk-txt");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".wk-send").click();
  }, text);
  await sleep(1400);
};

/**
 * THE QUESTION ON THE GLASS RIGHT NOW.
 *
 * THE SELECTOR IS THE ROOM'S OWN, and getting it wrong is what the first run of
 * this drive got wrong: collapsed steps stay in the DOM and are not in
 * chronological order, so "the last agent bubble" is a stale question and a
 * scripted drive then answers the wrong one. The live step is the one that is
 * not `.wk-gone`, which is the same read the render suite makes.
 */
const liveQuestion = (p) =>
  p.evaluate(() => {
    const clean = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
    /* THE HIGHEST STEP NUMBER IS THE LIVE QUESTION.
       Collapsed steps stay in the DOM, several questions share one `.wk-step`
       group, and their order inside it is the entry choreography's rather than
       the conversation's, so "the last agent bubble" is whichever the animation
       last touched. The step counter the room prints on every question is the
       one unambiguous read, and getting this wrong is what made the first run of
       this drive answer the question before last. */
    const bubbles = [...document.querySelectorAll(".wk-step:not(.wk-gone) .wk-agent .wk-bub")]
      .map((el) => ({ el, n: Number((clean(el).match(/^Step (\d+) of/) || [0, -1])[1]) }))
      .filter((x) => x.n >= 0)
      .sort((a, b) => a.n - b.n);
    const live = bubbles.length ? bubbles[bubbles.length - 1] : null;
    const copy = live ? live.el.cloneNode(true) : null;
    if (copy) copy.querySelectorAll(".wk-opts, button").forEach((n) => n.remove());
    return {
      stepNo: live ? live.n : null,
      ask: clean(copy).replace(/^Step \d+ of \d+/, "").trim(),
      chips: [...(live ? live.el.querySelectorAll(".wk-opts .wk-opt") : [])].map((c) =>
        clean(c.querySelector("b") || c),
      ),
      placeholder: document.querySelector(".wk-txt")?.getAttribute("placeholder") ?? null,
      ready: Boolean([...document.querySelectorAll("button")].find((b) => /Review . file/i.test(b.textContent || ""))),
    };
  });

/** The lane: what the room says it is holding, row by row. */
const laneRows = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll(".wk-ent")].map((r) => {
      const t = r.querySelector(".wk-ent-t");
      const label = t?.querySelector("b")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const value = t?.querySelector("span")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return `${label}  ${value}`;
    }),
  );

const roomText = (p) => p.evaluate(() => (document.body.textContent || "").replace(/\s+/g, " ").trim());

/* ============================================================== THE SCRIPT

   ADAPTIVE, NOT SEQUENTIAL. The room decides what to ask next, so the drive
   answers what it is ASKED rather than walking a fixed list: the first run of
   this script fed a sequence into a room that had inserted one extra question
   (Hartwell already carries a Minimum Liquidity covenant, so the room asked
   whether to add a second) and every answer after that landed on the wrong
   question. An adaptive script also PROVES something a sequential one cannot:
   every question the room asked is one this drive recognises, and an unexpected
   question is a failure rather than a silent misalignment. */

const RUNS = [
  {
    id: "COV",
    label: "three relationship covenants",
    open: "add a relationship covenant: minimum liquidity of 5M tested quarterly",
    /* Answered by what the room asks. `once` fires the first time only, so the
       loop's "another one" does not run forever. */
    answers: [
      { when: /already carries a Minimum Liquidity covenant/, say: "Add a second" },
      { when: /already carries a .* covenant/, say: "Add a second" },
      { when: /Which test is this covenant/, say: "Minimum Liquidity" },
      { when: /And the next test/, cycle: ["Minimum Current Ratio", "Maximum Debt to Worth"] },
      { when: /holds no covenant type called/, say: "Minimum Current Ratio" },
      { when: /What does the Minimum Current Ratio test have to hold/, say: "at least 1.25" },
      { when: /What does the Maximum Debt to Worth test have to hold/, say: "no more than 3.00" },
      { when: /What does the .* test have to hold/, say: "at least 5,000,000" },
      { when: /Which way does the .* test run/, say: ">=" },
      { when: /And the figure the .* test/, say: "5000000" },
      { when: /How often is it tested/, say: "Quarterly" },
      { when: /From what date does the .* test run/, say: "The 1st of next month, 2026-08-01" },
      { when: /What date does it run from/, say: "2026-08-01" },
      { when: /Anything for the record on this covenant/, cycle: ["from the amended and restated credit agreement", "Not assessed", "Not assessed"] },
      { when: /Another covenant, or is that all/, cycle: ["Another one", "Another one", "That is all"] },
    ],
  },
  {
    id: "COL",
    label: "two assets in full detail",
    open: "add collateral: two Haas VF-4SS machining centres",
    answers: [
      { when: /What kind of asset is it/, say: "UCC-Equipment" },
      { when: /And the next asset, what kind is it/, say: "Real Estate" },
      { when: /holds \d+ collateral types under that name/, say: "Real Estate-Warehouse" },
      { when: /collateral catalog holds nothing called/, say: "UCC-Equipment" },
      /* The first asset's description came whole from the opening line, so the
         room only asks for the second one's. */
      { when: /How is the asset described/, say: "Kokomo distribution warehouse" },
      { when: /machining centres worth/i, say: "850000" },
      { when: /warehouse worth/i, say: "4200000" },
      { when: /worth\?/i, cycle: ["850000", "4200000"] },
      { when: /On what basis is that figure struck/, cycle: ["Net Orderly Liquidation Value", "Fair Market Value - Real Estate"] },
      { when: /where did that figure come from/, cycle: ["Appraisal", "Real Estate Evaluation"] },
      { when: /As of what date is that figure good/, cycle: ["Today, 2026-07-25", "Not assessed"] },
      { when: /What date is it good as of/, say: "2026-07-25" },
      { when: /Where is it\?/, cycle: ["1400 Industrial Parkway, Fort Wayne, IN 46802", "900 Markland Avenue, Kokomo, IN 46901"] },
      { when: /Who owns it/, say: "Hartwell Precision Manufacturing LLC" },
      { when: /Another asset, or is that all/, cycle: ["Another one", "That is all"] },
    ],
  },
];

/** The rule that answers this question, WITHOUT consuming it. A cycle rule that
 *  has run out of answers no longer matches, so "another one" cannot loop for
 *  ever. */
function matchRule(run, ask, used) {
  return (
    run.answers.find((rule) => {
      if (!rule.when.test(ask)) return false;
      return rule.cycle ? (used.get(rule) ?? 0) < rule.cycle.length : true;
    }) ?? null
  );
}

/** Take the rule's answer, advancing its cycle. */
function takeAnswer(rule, used) {
  if (!rule.cycle) return rule.say;
  const n = used.get(rule) ?? 0;
  used.set(rule, n + 1);
  return rule.cycle[n];
}

async function drive(browser, run) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 980 }, deviceScaleFactor: 1 });
  const console_ = [];
  await ctx.addInitScript({ content: `window.__DRIVE = ${JSON.stringify({ label: run.label })};` });
  await ctx.addInitScript({ content: stub });
  const p = await ctx.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console_.push(`${m.type()}: ${m.text()}`);
  });
  p.on("pageerror", (e) => console_.push(`pageerror: ${e.message}`));

  await p.goto(TARGET, { waitUntil: "load" });
  await sleep(1400);
  await jsClick(p, `[data-open="${HARTWELL}"]`);
  await sleep(1300);
  await jsClick(p, "#fab");
  await sleep(600);
  const opened = await jsClick(p, "#actRelationship");
  // Past the room's own 1500ms lookup and past the 1200ms mail gate.
  await sleep(3600);

  const transcript = [];
  transcript.push({ said: "(the room, before anything is typed)", ...(await liveQuestion(p)) });

  await say(p, run.open);
  const used = new Map();
  let unanswered = null;

  /* THE ROOM ASKS ON ITS OWN BEAT. Steps arrive staggered, and a drive that
     read the glass the instant a line was sent read the question BEFORE it. So
     the drive waits for a question it recognises rather than for a duration. */
  const nextQuestion = async () => {
    let last = null;
    for (let i = 0; i < 26; i++) {
      const q = await liveQuestion(p);
      last = q;
      if (q.ready) return { q, rule: null, ready: true };
      const rule = matchRule(run, q.ask ?? "", used);
      if (rule) return { q, rule, ready: false };
      await sleep(400);
    }
    return { q: last, rule: null, ready: false };
  };

  for (let turn = 0; turn < 70; turn++) {
    const { q, rule, ready } = await nextQuestion();
    if (ready) {
      transcript.push({ said: "(the room says it has everything)", ...q });
      break;
    }
    if (!rule) {
      unanswered = q?.ask ?? "(nothing on the glass)";
      transcript.push({ said: "UNRECOGNISED QUESTION", ...q });
      break;
    }
    const said = takeAnswer(rule, used);
    const how = await answerRoom(p, said);
    transcript.push({ ...q, said, how });
  }

  const readBack = await laneRows(p);
  const beforeFile = await roomText(p);

  // REVIEW AND FILE. The chip the room offers once the last question is
  // answered, then the approval the org's own token arms.
  const reviewed = await clickText(p, ".wk-propose", "Review . file");
  await sleep(2400);
  const cardText = await p.evaluate(() => {
    const el = document.querySelector(".wk-flowcard");
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
  });
  const filed = await clickText(p, ".wk-approve", "File them");
  await sleep(2600);

  await p.screenshot({ path: `${OUT}/${run.id}-${run.label.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: false });
  const out = await p.evaluate(() => window.__DRIVE_OUT);
  const trail = await p.evaluate(() => {
    const rows = [...document.querySelectorAll(".rc-r")].map((r) => (r.textContent || "").replace(/\s+/g, " ").trim());
    const foot = document.querySelector(".rc-f");
    return { rows, footer: foot ? (foot.textContent || "").replace(/\s+/g, " ").trim() : null };
  });
  const afterFile = await roomText(p);
  await ctx.close();

  return {
    run: run.id,
    label: run.label,
    opened,
    unanswered,
    reviewed,
    filed,
    catalogCalls: out.catalogCalls,
    transcript,
    readBack,
    stagedPayloads: out.staged.map((s) => s.request),
    stagedCovenants: out.staged.flatMap((s) => s.covenants),
    stagedCollateral: out.staged.flatMap((s) => s.collateral),
    executed: out.executed,
    card: cardText,
    trail,
    saysNoPledge: /No pledge, no lien position, no advance rate and no coverage/.test(beforeFile),
    saysNoComplianceRow: /No compliance row is minted/.test(beforeFile),
    filedWords: /filed|Filed/.test(afterFile),
    errors: out.errors,
    console: console_,
  };
}

const browser = await chromium.launch();
const report = { target: TARGET, at: new Date().toISOString(), runs: [] };
for (const run of RUNS) {
  report.runs.push(await drive(browser, run));
}
await browser.close();
await new Promise((r) => server.close(r));

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

/* ------------------------------------------------------------- the console */
for (const r of report.runs) {
  console.log(`\n${"=".repeat(78)}\n${r.run}  ${r.label}\n${"=".repeat(78)}`);
  console.log(`room opened: ${r.opened}   catalog reads: ${r.catalogCalls}   errors: ${r.errors.length}   unrecognised: ${r.unanswered ?? "none"}`);
  console.log("\n-- the questions the room asked, and what the drive answered --");
  for (const t of r.transcript) {
    if (t.ask) console.log(`\n  ask:   ${t.ask}`);
    if (t.chips?.length) console.log(`  chips: ${t.chips.join(" | ")}`);
    console.log(`  >>     ${t.said}${t.how ? `  (${t.how})` : ""}`);
  }
  console.log("\n-- the read-back --");
  for (const row of r.readBack) console.log(`  ${row}`);
  console.log("\n-- the payload on the wire --");
  console.log(JSON.stringify(r.stagedPayloads, null, 2));
  console.log("\n-- what the card said --");
  console.log(`  ${r.card ?? "(no flow card)"}`);
  console.log("\n-- the trail --");
  for (const row of r.trail.rows) console.log(`  ${row}`);
  if (r.trail.footer) console.log(`  ${r.trail.footer}`);
  console.log(`\n  no pledge said: ${r.saysNoPledge}   no compliance row said: ${r.saysNoComplianceRow}`);
  if (r.errors.length) console.log(`\n  ERRORS: ${r.errors.join(" | ")}`);
  if (r.console.length) console.log(`  console: ${r.console.slice(0, 6).join(" | ")}`);
}
console.log(`\nreport: ${OUT}/report.json`);
