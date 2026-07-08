#!/usr/bin/env node
// ASSEMBLE the Customer 360 cockpit artifact in ONE deterministic step — the fast path.
//
// The agent composes C360_DATA (portfolio + anchor borrower + the staged `borrowers` book) and
// writes it to a small JSON file. This script bakes that JSON into the cockpit template's data
// slot and writes the finished ~170KB HTML. The agent then publishes the HTML file BY PATH.
// This replaces model-generating the whole artifact token-by-token (the slow path the user felt
// as "the artifact takes ages to load").
//
//   node assemble-cockpit.mjs --data <c360-data.json> --out <out.html> [--template <path>]
//
// Injection is SLOT-ONLY: it replaces exactly the one
//   <script id="c360-data" type="application/json">{{C360_DATA_JSON}}</script>
// anchor. It never does a global {{C360_DATA_JSON}} replace — the template's readData() carries the
// literal indexOf('{{C360_DATA_JSON}}') guard, and a global replace would corrupt that script.
// No dependencies beyond node built-ins. Node 18+.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { validateC360, challengeCount } from "./validate-c360.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : undefined; };
const die = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1); };

// ---------------------------------------------------------------- args
const dataPath = arg("--data");
const outPath = arg("--out");
// Default template resolves relative to THIS script (import.meta.url), never cwd.
const templatePath = arg("--template") ?? join(here, "..", "artifact", "customer-360-template.html");
if (!dataPath) die("missing --data <path/to/c360-data.json>  (usage: node assemble-cockpit.mjs --data <data.json> --out <out.html> [--template <path>])");
if (!outPath) die("missing --out <path/out.html>  (usage: node assemble-cockpit.mjs --data <data.json> --out <out.html> [--template <path>])");

// ---------------------------------------------------------------- read + validate the DATA (before injection)
let rawData;
try { rawData = readFileSync(dataPath, "utf8"); }
catch (e) { die(`cannot read --data ${dataPath}: ${e.message}`); }

let data;
try { data = JSON.parse(rawData); }
catch (e) { die(`--data ${dataPath} is not valid JSON: ${e.message}`); }

if (!data || typeof data !== "object" || Array.isArray(data)) die("--data must be a JSON object (window.C360_DATA)");
if (!data.meta || !data.meta.anchorAccountId) die("--data.meta.anchorAccountId is required");
if (!data.portfolio || !Array.isArray(data.portfolio.accounts)) die("--data.portfolio.accounts must be an array");
if (!data.borrower || !data.borrower.snapshot) die("--data.borrower.snapshot is required");

// borrowers staging is what makes portfolio row-switching instant + keeps the artifact functional
// where window.sendPrompt doesn't exist (SKILL.md: staging is MANDATORY). Warn loudly, don't fail —
// the render still works, but degraded (unstaged rows need an agent round-trip).
const accountIds = data.portfolio.accounts.map((a) => a && a.accountId).filter(Boolean);
if (!data.borrowers || typeof data.borrowers !== "object") {
  console.error("WARN: --data.borrowers map is MISSING. Portfolio row-switching will NOT be instant (each row needs an agent round-trip). Stage the whole book — see SKILL.md 'Staging is mandatory'.");
} else {
  const missing = accountIds.filter((id) => !(id in data.borrowers));
  if (missing.length) {
    console.error(`WARN: --data.borrowers does not cover every portfolio account. Missing ${missing.length}/${accountIds.length}: ${missing.join(", ")}. Those rows will need an agent round-trip instead of switching client-side. Stage the whole book — see SKILL.md.`);
  }
}
const stagedCount = data.borrowers && typeof data.borrowers === "object" ? Object.keys(data.borrowers).length : 0;

// ---------------------------------------------------------------- deterministic validation stage
// SR 11-7 effective challenge: recompute covenants from the Boom spread + run the data-quality sweep.
// Runs AFTER data validation and BEFORE injection so the rendered artifact always carries the
// challenge + dataQuality surfaces. The LLM never computes these figures — this is the only source.
// --no-validate skips it (raw passthrough).
const noValidate = process.argv.includes("--no-validate");
if (!noValidate) {
  try { validateC360(data); }
  catch (e) { die(`validation stage failed: ${e.message}`); }
}
const challengeN = noValidate ? 0 : challengeCount(data);
const dqN = noValidate ? 0 : (Array.isArray(data.dataQuality) ? data.dataQuality.length : 0);

// ---------------------------------------------------------------- read the template
let template;
try { template = readFileSync(templatePath, "utf8"); }
catch (e) { die(`cannot read template ${templatePath}: ${e.message}`); }

// ---------------------------------------------------------------- slot-only injection
const ANCHOR = '<script id="c360-data" type="application/json">{{C360_DATA_JSON}}</script>';
const parts = template.split(ANCHOR);
if (parts.length !== 2) die(`template must contain the data-slot anchor exactly once; found ${parts.length - 1} occurrence(s). Expected literal: ${ANCHOR}`);

// Re-serialize compactly and escape `</` so a "</script>" inside the payload can't close the tag early.
const payload = JSON.stringify(data).replace(/<\//g, "<\\/");
// Defensive: the injected payload must not itself carry the unrendered-placeholder literal, or
// readData() would treat a fully-rendered artifact as empty.
if (payload.indexOf("{{C360_DATA_JSON}}") !== -1) die("the composed C360_DATA contains the literal {{C360_DATA_JSON}} — remove it; it would defeat the template's readData() guard");

const injectedAnchor = `<script id="c360-data" type="application/json">${payload}</script>`;
const output = parts[0] + injectedAnchor + parts[1];

// The template's readData() must survive injection intact (a global placeholder replace would have
// nuked this literal — the bug this slot-only path exists to prevent).
if (output.indexOf("indexOf('{{C360_DATA_JSON}}')") === -1) die("post-injection sanity check failed: the readData() literal indexOf('{{C360_DATA_JSON}}') is missing from the output — injection corrupted the engine script");

// ---------------------------------------------------------------- write
try { writeFileSync(outPath, output); }
catch (e) { die(`cannot write --out ${outPath}: ${e.message}`); }

// ---------------------------------------------------------------- self-verify the written file
const written = readFileSync(outPath, "utf8");

// 1) the JSON slot must round-trip: extract it, unescape, JSON.parse.
const slotMatch = written.match(/<script id="c360-data" type="application\/json">([\s\S]*?)<\/script>/);
if (!slotMatch) die("self-verify: could not locate the c360-data JSON slot in the output");
let slotRaw = slotMatch[1].replace(/<\\\//g, "</");
try { JSON.parse(slotRaw); }
catch (e) { die(`self-verify: injected JSON slot does not parse: ${e.message}`); }

// 2) every JS <script> block must be syntactically valid; every application/json block must parse.
// Scan a comment-stripped copy so a <script ...> mentioned inside an HTML comment (the template's
// header docs reference the data slot) is not mistaken for a real script tag.
const scanned = written.replace(/<!--[\s\S]*?-->/g, "");
const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m, blockNo = 0;
while ((m = scriptRe.exec(scanned)) !== null) {
  blockNo++;
  const openAttrs = m[1] || "";
  const body = m[2] || "";
  if (/application\/json/.test(openAttrs)) {
    let jsonBody = body.replace(/<\\\//g, "</");
    try { JSON.parse(jsonBody); }
    catch (e) { die(`self-verify: <script${openAttrs}> (block ${blockNo}) is not valid JSON: ${e.message}`); }
  } else {
    try { new vm.Script(body, { filename: `cockpit-script-block-${blockNo}.js` }); }
    catch (e) { die(`self-verify: engine <script> block ${blockNo} has a syntax error: ${e.message}`); }
  }
}

// ---------------------------------------------------------------- success
const bytes = Buffer.byteLength(output);
const validateSummary = noValidate ? " · validation SKIPPED" : ` · challenge ${challengeN} covenants · DQ ${dqN} findings`;
console.log(`OK — wrote ${outPath} (${bytes.toLocaleString()} bytes) · anchor=${data.meta.anchorAccountId} · accounts staged ${stagedCount}/${accountIds.length}${validateSummary}`);
