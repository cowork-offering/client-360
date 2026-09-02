/* THE GREETING v2 DRIVE: six runs, one report, one screenshot each.

   Modelled on shot-brain.mjs and standing on the SAME assembled build the probe
   suite measures, with lib/stub-greeting.js in front of it. Everything between
   the room and the glass is the real code: the mail read, the envelope, the
   gate, the consent moment, the parser, the resolver and the render. What the
   stub supplies is a mailbox and a session door.

     A  no mail                          three rows, no CONTEXT.mail, three route chips
     B  the founder's real seed          the greeting prompt carries sender, date, subject, gist
     C  the same, dated after the book,  the greeting has NO mail; a SECOND remark carries it
        answering at 4000ms
     D  the mail asks a RENEWAL          the close names the renewal; chips stay three
     E  a plain question                 the close names the three routes and no route from the mail
     F  the route BOUND to renew         no route-open block, the bound route line present

   RUN F IS A NARRATE PROMPT, NOT A GREETING PROMPT, and deliberately so:
   primeConsent is memoised per VIEW, so a room cannot be greeted twice in one
   page load and binding a route mid-run cannot produce a second greeting. F
   binds the renewal, types one line, and reads the prompt the bound room sent.

   Usage:  node drive-greeting.mjs [url] [outDir]
*/
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TARGET = process.argv[2] ?? "http://127.0.0.1:8908/";
const OUT = process.argv[3] ?? "/tmp/greeting-drive";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const stub = readFileSync(`${HERE}lib/stub-greeting.js`, "utf8");

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The founder's own seeded message, at the shape the live tool answers in. */
const SEED = {
  uri: "m365://message/AAMk-seed",
  id: "AAMk-seed",
  subject: "Increase of Line of Credit - Hartwell Precision Manufacturimg LLC",
  sender: "sarah.hartwell@hartwellprecision.com",
  recipients: ["fabian.goetzens@connectry.io"],
  receivedDateTime: "2026-07-20T23:29:36Z",
  sentDateTime: "2026-07-20T23:29:36Z",
  summary:
    "Following unforeseen building efforts we would like to increase the Line of Credit from 15Mio to 20Mio. Please prepare the contract.",
  hasAttachments: false,
  importance: "normal",
  isRead: false,
  webLink: "https://outlook.office.com/mail/AAMk-seed",
  internetMessageId: "<AAMk-seed@hartwell>",
};

const RUNS = [
  { id: "A", label: "no mail", mail: null, delayMs: 0 },
  { id: "B", label: "the founder's real seed, at 300ms", mail: SEED, delayMs: 300 },
  {
    id: "C",
    label: "the same message dated AFTER the book, answering at 4000ms",
    mail: { ...SEED, receivedDateTime: "2026-08-28T09:12:00Z", sentDateTime: "2026-08-28T09:12:00Z" },
    delayMs: 4000,
    lateMail: true,
  },
  {
    id: "D",
    label: "the mail asks a RENEWAL of the equipment loan",
    mail: {
      ...SEED,
      id: "AAMk-renew",
      subject: "Hartwell equipment loan renewal",
      summary: "Can we renew the $8M equipment loan when it matures next spring? Same structure is fine.",
      receivedDateTime: "2026-07-20T09:00:00Z",
      sentDateTime: "2026-07-20T09:00:00Z",
    },
    delayMs: 300,
  },
  {
    id: "E",
    label: "a plain question, no credit action",
    mail: {
      ...SEED,
      id: "AAMk-ask",
      subject: "Hartwell June covenant certificate",
      summary: "Could you send us a copy of the June covenant certificate for our auditors?",
      receivedDateTime: "2026-07-20T09:00:00Z",
      sentDateTime: "2026-07-20T09:00:00Z",
    },
    delayMs: 300,
  },
  {
    id: "F",
    label: "the route BOUND to renew, mail present",
    mail: {
      ...SEED,
      id: "AAMk-renew",
      subject: "Hartwell equipment loan renewal",
      summary: "Can we renew the $8M equipment loan when it matures next spring?",
      receivedDateTime: "2026-07-20T09:00:00Z",
      sentDateTime: "2026-07-20T09:00:00Z",
    },
    delayMs: 300,
    bind: "Renew",
  },
];

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

const say = async (page, text) => {
  await page.evaluate((t) => {
    const input = document.querySelector(".wk-txt");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(".wk-send").click();
  }, text);
  await sleep(1600);
};

/** What the glass is actually showing, block by block, row by row. */
const readRoom = (page) =>
  page.evaluate(() => {
    const text = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null);
    const narrs = [...document.querySelectorAll(".wk-narr")];
    const shape = (n) => {
      const bub = n.querySelector(".wk-bub");
      if (!bub) return { pending: Boolean(n.querySelector(".wk-narr-wait")) };
      const parts = [...bub.children].map((el) => el.className);
      const lines = [...bub.querySelectorAll(".wk-narr-line")].map(text);
      return {
        blocks: parts,
        lead: lines[0] ?? null,
        closing: parts[parts.length - 1] === "wk-narr-line" && lines.length > 1 ? lines[lines.length - 1] : null,
        rows: [...bub.querySelectorAll(".wk-narr-row")].map((r) => ({
          label: text(r.querySelector("b")),
          clause: text(r.querySelector(".wk-narr-row-l")),
          value: text(r.querySelector(".wk-narr-row-v")),
          tone: r.classList.contains("wk-bad") ? "bad" : r.classList.contains("wk-warn") ? "warn" : null,
          hasControl: Boolean(r.querySelector("button")),
        })),
        bullets: [...bub.querySelectorAll(".wk-narr-list li")].map(text),
      };
    };
    return {
      narrationCount: narrs.length,
      narrations: narrs.map(shape),
      chips: [...document.querySelectorAll(".wk-opts .wk-opt, .wk-opt")].map(text),
      greetingSlotLine: text(document.querySelector(".wk-msg.wk-agent .wk-bub")),
      tips: [...document.querySelectorAll(".wk-tip-l")].map(text),
      out: window.__DRIVE_OUT,
    };
  });

const envelopeOf = (prompt) => {
  const i = prompt.lastIndexOf("\nCONTEXT:\n");
  if (i < 0) return null;
  try {
    return JSON.parse(prompt.slice(i + "\nCONTEXT:\n".length));
  } catch {
    return null;
  }
};

async function drive(browser, run) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  const console_ = [];
  await ctx.addInitScript({
    content: `window.__DRIVE = ${JSON.stringify({ mail: run.mail, delayMs: run.delayMs, label: run.label })};`,
  });
  await ctx.addInitScript({ content: stub });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console_.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => console_.push(`pageerror: ${e.message}`));

  await page.goto(TARGET, { waitUntil: "load" });
  await sleep(1400);
  await jsClick(page, '[data-open="001bb00001I7FPNAA3"]');
  await sleep(1300);
  await jsClick(page, "#fab");
  await sleep(600);
  await jsClick(page, "#actFacility");
  // Past the room's own 1500ms lookup and past the 1200ms mail gate.
  await sleep(3400);

  if (run.lateMail) {
    // The mail answers at 4000ms: it has missed the gate. Wait for the second
    // remark rather than for a rewritten greeting.
    await sleep(3200);
  }

  if (run.bind) {
    await clickText(page, ".wk-opt", run.bind);
    await sleep(2600);
    await say(page, "what covenants do we carry on the equipment loan");
  }

  const state = await readRoom(page);
  await page.screenshot({ path: `${OUT}/${run.id}-${run.label.replace(/[^a-z0-9]+/gi, "-")}.png` });
  await ctx.close();

  const prompts = state.out.prompts;
  const greeting = prompts.find((p) => p.kind === "greeting");
  const lateRemark = prompts.find((p) => p.kind === "mail");
  const narrate = prompts.find((p) => p.kind === "narrate");
  const subject = run.bind ? narrate : greeting;
  const env = subject ? envelopeOf(subject.text) : null;

  return {
    run: run.id,
    label: run.label,
    mailCalls: state.out.mailCalls,
    marks: state.out.marks,
    timing: {
      lookupLanded: (state.out.marks.find((m) => m.what === "lookup-landed") || {}).at ?? null,
      mailAnswered: (state.out.marks.find((m) => m.what === "mail-answered") || {}).at ?? null,
      greetingSent: greeting ? greeting.at : null,
      lateRemarkSent: lateRemark ? lateRemark.at : null,
    },
    prompt: subject
      ? {
          kind: subject.kind,
          route: env ? env.route : null,
          routeOptions: env ? env.routeOptions : null,
          mail: env ? env.mail : null,
          hasMailDoctrine: /THE CLIENT HAS WRITTEN/.test(subject.text),
          hasRouteOpenDoctrine: /THE ROUTE IS NOT BOUND\./.test(subject.text),
          routeLine: (subject.text.match(/THE ROUTE IS (?:NOT )?BOUND[^\n]*/) || [null])[0],
          budgetLine: (subject.text.match(/ABOUT [A-Z-]+ WORDS[^\n]*/) || [null])[0],
          correspondenceNotCarried: /correspondence beyond the one message/.test(subject.text),
        }
      : null,
    lateRemarkPrompt: lateRemark
      ? {
          mail: (envelopeOf(lateRemark.text) || {}).mail ?? null,
          arrivedAfterBook: Boolean(((envelopeOf(lateRemark.text) || {}).mail || {}).arrivedAfterBook),
        }
      : null,
    glass: {
      narrationCount: state.narrationCount,
      narrations: state.narrations,
      chips: state.chips,
      tips: state.tips,
    },
    consoleErrors: console_,
    pageErrors: state.out.errors,
  };
}

const main = async () => {
  const browser = await chromium.launch({
    args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
  });
  const report = [];
  for (const run of RUNS) {
    process.stdout.write(`\n== RUN ${run.id}: ${run.label}\n`);
    const result = await drive(browser, run);
    report.push(result);
    process.stdout.write(JSON.stringify(result, null, 1) + "\n");
  }
  await browser.close();
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log("\nwrote", `${OUT}/report.json`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
