#!/usr/bin/env node
/* Assemble the publishable cockpit artifact: inject a data file into the
 * template's inert application/json slot.
 *
 * Usage: node assemble-artifact.mjs [dataFile] [outFile] [templateFile]
 *   dataFile     default: ../artifact/live-data.json
 *   outFile      default: /tmp/c360-publish.html
 *   templateFile default: ../artifact/customer-360-template.html
 *
 * The template argument exists for MEASUREMENT, never for publishing: the perf
 * probe assembles the bundle it just built (app/dist/cockpit.html) so a run
 * measures the working tree. Promotion is still release-artifact.mjs and only
 * release-artifact.mjs.
 *
 * HARD LESSON (2026-07-27): the bundle's own JS contains the literal
 * "__C360_DATA__" (load.ts PLACEHOLDER) and even the comment form of the
 * marker. Replacing the first occurrence of the comment marker injected the
 * JSON into the middle of the code bundle and left the real slot empty —
 * shipping a cockpit that renders "No data injected". The ONLY safe match is
 * the FULL script tag, asserted unique, and the output slot is re-parsed
 * before this script will exit 0.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normaliseC360Boom } from "../../client-360/render/boom-normalise.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const dataFile = process.argv[2] ?? resolve(root, "artifact", "live-data.json");
const outFile = process.argv[3] ?? "/tmp/c360-publish.html";
const templateFile = process.argv[4] ?? resolve(root, "artifact", "customer-360-template.html");

const FULL_TAG = '<script id="c360-data" type="application/json">/*__C360_DATA__*/</script>';

const tpl = readFileSync(templateFile, "utf8");

// ONE Boom shape (item 6): normalise before injection so the Financials tab and the covenant
// challenge read the same object: display fields derived from the raw boom_get_ratios /
// boom_get_spread payloads, which stay underneath at boom.ratios.raw and boom.spread.file.
// Idempotent: a data file that already carries the normalised shape is unchanged by this.
const parsedData = JSON.parse(readFileSync(dataFile, "utf8")); // must be valid JSON before it goes anywhere
const data = JSON.stringify(normaliseC360Boom(parsedData));

const occurrences = tpl.split(FULL_TAG).length - 1;
if (occurrences !== 1) {
  console.error(`FATAL: expected exactly 1 full-tag marker, found ${occurrences}. Refusing to guess.`);
  process.exit(1);
}

// </ must not terminate the surrounding <script> block; \/ is a legal JSON escape.
const payload = data.replace(/<\//g, "<\\/");
const out = tpl.replace(FULL_TAG, `<script id="c360-data" type="application/json">${payload}</script>`);

// Verify the assembled slot end-to-end, the same way load.ts will read it.
const m = out.match(/<script id="c360-data" type="application\/json">([\s\S]*?)<\/script>/);
const slot = m ? m[1] : "";
if (!slot.trim().startsWith("{")) { console.error("FATAL: slot is not JSON after assembly"); process.exit(1); }
if (slot.includes("__C360_DATA__")) { console.error("FATAL: placeholder survived assembly"); process.exit(1); }
const parsed = JSON.parse(slot); // \/ parses identically to /
const borrowerCount = Object.keys(parsed.borrowers ?? {}).length;
if (borrowerCount === 0) { console.error("FATAL: assembled data has no borrowers"); process.exit(1); }

writeFileSync(outFile, out);
console.log(`OK — assembled ${outFile} (${out.length} bytes, ${borrowerCount} borrowers, slot verified)`);
