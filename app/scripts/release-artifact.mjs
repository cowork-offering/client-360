// Promote the built bundle to the assembler's template slot (SPEC §12 A2).
// Copies dist/cockpit.html -> artifact/customer-360-template.html and asserts
// the injection marker is present exactly once. This is the ONLY sanctioned way
// to update the artifact template from a build.
//
//   node scripts/release-artifact.mjs
//
// NOTE: the artifact/ directory is owned by the assembler agent — run this only
// when explicitly promoting a reviewed bundle.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "dist", "cockpit.html");
const dest = join(here, "..", "..", "artifact", "customer-360-template.html");
const MARKER = '<script id="c360-data" type="application/json">/*__C360_DATA__*/</script>';

if (!existsSync(src)) {
  console.error(`FAIL: ${src} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const html = readFileSync(src, "utf8");
const count = html.split(MARKER).length - 1;
if (count !== 1) {
  console.error(`FAIL: injection marker must appear exactly once in the bundle (found ${count}).`);
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`OK — promoted dist/cockpit.html -> ${dest} (marker verified once).`);
