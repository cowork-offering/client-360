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

console.log(`bundle: dist/cockpit.html — ${bytes.toLocaleString()} bytes (${mib.toFixed(3)} MiB)`);
if (mib > 1.5) {
  console.error(`FAIL: bundle ${mib.toFixed(3)} MiB exceeds 1.5 MiB budget`);
  process.exit(1);
}
