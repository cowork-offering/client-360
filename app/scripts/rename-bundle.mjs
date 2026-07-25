// Rename the Vite HTML output to the assembler's expected input name and print size.
import { renameSync, statSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const src = join(dist, "index.html");
const out = join(dist, "cockpit.html");

renameSync(src, out);

const bytes = statSync(out).size;
const mib = bytes / 1024 / 1024;

// Guardrail: the data-injection marker MUST survive the build (assembler contract).
const html = readFileSync(out, "utf8");
const marker = '<script id="c360-data" type="application/json">/*__C360_DATA__*/</script>';
const markerCount = html.split(marker).length - 1;
if (markerCount !== 1) {
  console.error(`FAIL: injection marker must appear exactly once (found ${markerCount}). Expected: ${marker}`);
  process.exit(1);
}

// FAIL-CLOSED GATE (A33.5.3): the NOT-LIVE simulation adapter must never reach
// a shipped artifact. Its plan bodies are stripped by Rollup because the guard
// reads `import.meta.env.DEV` alone; this asserts that stayed true, so a future
// edit to that guard fails the build instead of shipping fabricated plans.
const SIMULATION_MARKERS = [
  "sim-staging",
  "Files a new collateral valuation",
  "Stages an annual credit review for",
  "Create the collateral valuation",
  "CollateralValuationTrigger",
  "slackv2.caseTrigger",
  "Re-query the collateral record",
];
const leaked = SIMULATION_MARKERS.filter((m) => html.includes(m));
if (leaked.length) {
  console.error(`FAIL: simulated plan content reached the bundle: ${leaked.join(", ")}`);
  console.error("The simulation guard must remain a bare `import.meta.env.DEV` check so Rollup can strip it.");
  process.exit(1);
}

console.log(`bundle: dist/cockpit.html — ${bytes.toLocaleString()} bytes (${mib.toFixed(3)} MiB)`);
if (mib > 1.5) {
  console.error(`FAIL: bundle ${mib.toFixed(3)} MiB exceeds 1.5 MiB budget`);
  process.exit(1);
}
