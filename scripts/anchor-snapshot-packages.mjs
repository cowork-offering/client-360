// Puts the relationship's OWN product package on its snapshot, in `artifact/live-data.json`.
//
// WHY THIS EXISTS. Every borrower in the fixture carries `packageCount: 1` and every one of its
// facilities carries the same `productPackageId`, and the snapshot itself carried no such key at
// all. `relContextFor` reads the anchor off the SNAPSHOT, so both package-anchored relationship
// routes -- the covenant review and the collateral valuation -- refused with NO_PACKAGE_ANCHOR
// before their first question, on a relationship whose package is sitting one level down in the
// same file. The refusal was correct about the fixture and wrong about the org.
//
// This is a FIXTURE fix, not a room fix. The anchor is derived, never invented: a borrower whose
// facilities name no package, or name more than one, is REFUSED and left alone, because either of
// those is a real ambiguity a script must not resolve on the org's behalf.
//
// SURGICAL BY DESIGN. A JSON round trip is not byte-stable against this file, so a reformat would
// churn 113KB and bury the five lines that matter. The insert is textual and the result is then
// parsed and compared against the original, key by key: nothing but `snapshot.productPackageId` may
// differ, or the script writes nothing.
//
//   node scripts/anchor-snapshot-packages.mjs [--check]
//
// Then `node scripts/sync-plugin-assets.mjs` to carry it into `client-360/assets/`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "artifact", "live-data.json");
const check = process.argv.includes("--check");

const before = readFileSync(path, "utf8");
const data = JSON.parse(before);
let text = before;
let wrote = 0;
let refused = 0;

for (const [accountId, borrower] of Object.entries(data.borrowers ?? {})) {
  const name = borrower?.snapshot?.name ?? accountId;
  if (borrower?.snapshot?.productPackageId) {
    console.log(`ok      ${name} already anchored on ${borrower.snapshot.productPackageId}`);
    continue;
  }
  const ids = [...new Set((borrower?.exposure?.facilities ?? []).map((f) => f.productPackageId).filter(Boolean))];
  if (ids.length !== 1) {
    console.log(`REFUSED ${name}: its facilities name ${ids.length} packages, and one anchor cannot be derived from that`);
    refused++;
    continue;
  }

  // The snapshot's own `accountId` line, inside THIS borrower's object. The account id is unique in
  // the file, so the anchor for the insert is unambiguous without parsing structure by hand.
  const key = `"${accountId}": {`;
  const start = text.indexOf(key);
  if (start === -1) throw new Error(`${accountId}: no object in the text`);
  const marker = `"accountId": "${accountId}",`;
  const at = text.indexOf(marker, start);
  if (at === -1) throw new Error(`${accountId}: no snapshot accountId line to anchor the insert on`);
  const indent = text.slice(text.lastIndexOf("\n", at) + 1, at);
  text = `${text.slice(0, at + marker.length)}\n${indent}"productPackageId": "${ids[0]}",${text.slice(at + marker.length)}`;
  console.log(`anchored ${name} on ${ids[0]}`);
  wrote++;
}

if (refused) {
  console.error(`${refused} borrower(s) refused. Nothing written.`);
  process.exit(1);
}
if (!wrote) {
  console.log("nothing to do");
  process.exit(0);
}

// THE ONLY DIFFERENCE MAY BE THE ANCHOR. Parse the result and walk both trees; any other change,
// anywhere, is a bug in the insert and the file is not written.
const after = JSON.parse(text);
const diffs = [];
(function walk(a, b, at) {
  if (a === b) return;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return void diffs.push(at);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${at}.${k}`);
})(data, after, "");
const allowed = new Set(Object.keys(data.borrowers ?? {}).map((id) => `.borrowers.${id}.snapshot.productPackageId`));
const unexpected = diffs.filter((d) => !allowed.has(d));
if (unexpected.length) {
  console.error(`the insert changed something else: ${unexpected.join(", ")}`);
  process.exit(2);
}
if (check) {
  console.error(`${wrote} snapshot(s) are not anchored`);
  process.exit(1);
}
writeFileSync(path, text);
console.log(`wrote ${wrote} anchor(s) to artifact/live-data.json`);
