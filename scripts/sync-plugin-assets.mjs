// Keeps the plugin's shipped copies byte-identical to their sources. Run after any
// release-artifact / assemble step, and after any edit to the workroom brain pack.
// `--check` only verifies (exit 1 on drift).
//
//   client-360/assets/*                        <- artifact/*            (the publish staging)
//   client-360/skills/workroom-brain/…BRAIN.md <- brain/WORKROOM-BRAIN.md
//
// THE PACK SHIPS TWICE ON PURPOSE. `brain/` is where it is authored and reviewed; the copy under
// the skill is what the SESSION actually reads at answer time, because a skill can only bundle what
// sits beside its own SKILL.md. Two copies with no check between them is a pack that quietly stops
// being the one the brain obeys, which is exactly the failure the grounding exists to prevent.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** [label, source, destination] */
const pairs = [
  ...["customer-360-template.html", "live-data.json", "sample-data.json"].map((f) => [
    f,
    join(root, "artifact", f),
    join(root, "client-360", "assets", f),
  ]),
  [
    "WORKROOM-BRAIN.md",
    join(root, "brain", "WORKROOM-BRAIN.md"),
    join(root, "client-360", "skills", "workroom-brain", "WORKROOM-BRAIN.md"),
  ],
];
const check = process.argv.includes("--check");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
let drift = 0;
for (const [label, src, dst] of pairs) {
  if (!existsSync(src)) { console.error(`missing ${src}`); process.exit(2); }
  const same = existsSync(dst) && sha(src) === sha(dst);
  if (same) { console.log(`ok    ${label}`); continue; }
  drift++;
  if (check) console.log(`DRIFT ${label}`);
  else { writeFileSync(dst, readFileSync(src)); console.log(`synced ${label}`); }
}
if (check && drift) process.exit(1);
