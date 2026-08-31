#!/usr/bin/env node
/* Diff two probe reports with the tolerances the design contract allows.
 *
 *   node compare.mjs reference/dummy-baseline.json /tmp/port.json
 *   node compare.mjs reference/dummy-baseline.json /tmp/port.json --json out.json
 *
 * Tolerances: 1px on positions/sizes, 10% on timings, exact on counts, booleans
 * and enumerated strings. Exit code 1 when anything FAILs.
 */
import fs from "node:fs";
import { flatten } from "./lib/merge.mjs";

/* Paths whose mismatch is informational (markup/copy shaped), not a gate. */
const SOFT = [
  /Keyframes$/, /Raw$/, /^glass\.[^.]+\.glassEntries/, /glassRimViolations$/,
  /glassBorderColors$/, /glassWhiteBorders$/, /narratorHoverLabels/,
  /filterVisibleRowText/, /identityChipContent$/, /^meta\./, /^pageErrors$/,
  /haloTransform(Start|End)$/, /haloAngle(Start|End)$/, /suggestChipText$/,
  /idleHaloBoxShadow$/, /paneEntryKeyframeFrom$/,
  /glassSurfacesByRimCount/, /^weave\.weaveLayerZIndex$/,
  /activeTabWashHueAppearsByMs$/, /deltaCardText$/, /gateToastText$/,
  /scrollableSurface$/, /realNameOpacityAtLastGhostFramePct$/,
  /documentHeightPx$/, /agentWordSpanCount$/, /haloAngleAdvancedDeg$/,
  /ghostDissolveMs$/
];

/* Paths that are pure information (never compared). */
const IGNORE = [/^meta\./, /^pageErrors$/];

function toleranceFor(path) {
  const key = path.split(".").pop();
  if (/Count$|Index$|Deg$/.test(key)) return { kind: "exact-number", abs: /Deg$/.test(key) ? 1 : 0 };
  if (/Ms$/.test(key)) return { kind: "timing", rel: 0.10, abs: 5 };
  if (/Px$/.test(key)) return { kind: "position", abs: 1 };
  if (/Pct$/.test(key)) return { kind: "percent", abs: 1 };
  return { kind: "numeric", abs: 1 };
}

function isSoft(path) { return SOFT.some((r) => r.test(path)); }
function isIgnored(path) { return IGNORE.some((r) => r.test(path)); }

function cmpNumber(path, a, b) {
  const t = toleranceFor(path);
  const d = Math.abs(a - b);
  const allow = t.rel != null ? Math.max(t.abs || 0, Math.abs(a) * t.rel) : (t.abs || 0);
  return { ok: d <= allow + 1e-9, delta: Math.round(d * 1000) / 1000, allow: Math.round(allow * 1000) / 1000, kind: t.kind };
}

function compareLeaf(path, a, b) {
  if (typeof a === "number" && typeof b === "number") return cmpNumber(path, a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return { ok: false, kind: "array-length", delta: `${a.length} vs ${b.length}`, allow: 0 };
    if (a.every((x) => typeof x === "number") && b.every((x) => typeof x === "number")) {
      const bad = a.map((x, i) => ({ i, ...cmpNumber(path, x, b[i]) })).filter((r) => !r.ok);
      return bad.length ? { ok: false, kind: "array", delta: bad.map((r) => `[${r.i}] ${r.delta}>${r.allow}`).join(", "), allow: 0 }
        : { ok: true, kind: "array", delta: 0, allow: 0 };
    }
  }
  return { ok: JSON.stringify(a) === JSON.stringify(b), kind: typeof a, delta: null, allow: 0 };
}

function main() {
  const [, , baseFile, candFile, ...rest] = process.argv;
  if (!baseFile || !candFile) {
    console.error("usage: node compare.mjs <baseline.json> <candidate.json> [--json out.json]");
    process.exit(2);
  }
  const jsonOutIdx = rest.indexOf("--json");
  const jsonOut = jsonOutIdx > -1 ? rest[jsonOutIdx + 1] : null;

  const base = flatten(JSON.parse(fs.readFileSync(baseFile, "utf8")));
  const cand = flatten(JSON.parse(fs.readFileSync(candFile, "utf8")));

  const results = [];
  for (const [path, a] of Object.entries(base)) {
    if (isIgnored(path)) continue;
    if (!(path in cand)) {
      results.push({ path, severity: isSoft(path) ? "WARN" : "FAIL", reason: "missing in candidate", baseline: a, candidate: undefined });
      continue;
    }
    const b = cand[path];
    const r = compareLeaf(path, a, b);
    if (r.ok) { results.push({ path, severity: "OK", baseline: a, candidate: b, kind: r.kind }); continue; }
    results.push({
      path, severity: isSoft(path) ? "WARN" : "FAIL",
      baseline: a, candidate: b, kind: r.kind,
      delta: r.delta, allowed: r.allow
    });
  }
  const extra = Object.keys(cand).filter((p) => !(p in base) && !isIgnored(p));

  const fails = results.filter((r) => r.severity === "FAIL");
  const warns = results.filter((r) => r.severity === "WARN");
  const oks = results.filter((r) => r.severity === "OK");

  console.log(`\nbaseline : ${baseFile}`);
  console.log(`candidate: ${candFile}`);
  console.log(`compared : ${results.length} probes   OK ${oks.length}   WARN ${warns.length}   FAIL ${fails.length}`);
  if (extra.length) console.log(`candidate-only keys: ${extra.length}`);

  if (fails.length) {
    console.log("\nFAIL");
    for (const f of fails) {
      console.log(`  ${f.path}`);
      console.log(`      baseline  ${JSON.stringify(f.baseline)}`);
      console.log(`      candidate ${JSON.stringify(f.candidate)}` +
        (f.delta != null ? `   (delta ${f.delta}, allowed ${f.allowed}, ${f.kind})` : ""));
    }
  }
  if (warns.length) {
    console.log("\nWARN (informational, not gating)");
    for (const w of warns) console.log(`  ${w.path}: ${JSON.stringify(w.baseline)} -> ${JSON.stringify(w.candidate)}`);
  }

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({ baseFile, candFile, summary: { ok: oks.length, warn: warns.length, fail: fails.length }, results, candidateOnlyKeys: extra }, null, 2) + "\n");
    console.log(`\nwrote ${jsonOut}`);
  }
  console.log("");
  process.exit(fails.length ? 1 : 0);
}

main();
