// Keeps client-360/assets byte-identical to artifact/ (the publish staging). Run after any
// release-artifact / assemble step. `--check` only verifies (exit 1 on drift).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["customer-360-template.html", "live-data.json", "sample-data.json"];
const check = process.argv.includes("--check");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
let drift = 0;
for (const f of files) {
  const src = join(root, "artifact", f), dst = join(root, "client-360", "assets", f);
  if (!existsSync(src)) { console.error(`missing ${src}`); process.exit(2); }
  const same = existsSync(dst) && sha(src) === sha(dst);
  if (same) { console.log(`ok    ${f}`); continue; }
  drift++;
  if (check) console.log(`DRIFT ${f}`);
  else { writeFileSync(dst, readFileSync(src)); console.log(`synced ${f}`); }
}
if (check && drift) process.exit(1);
