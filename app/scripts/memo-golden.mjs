#!/usr/bin/env node
/* =============================================================================
   REGENERATE THE GOLDEN MEMO

   The golden is not our output. It is the credit-memo plugin's own output, from
   the plugin's own harness (`test/build-memo.mjs`), over the plugin's own
   Piedmont fixture. src/memo/parity.test.ts renders the same fixture through the
   cockpit's browser entry and asserts the two are byte-identical, which is the
   only claim worth making about a port: the room shows the memo, not a memo.

   The plugin mirror is READ-ONLY for us, and `build-memo.mjs` writes its output
   beside itself. So this copies the mirror to a temp directory, runs the harness
   there, and takes the HTML out. Nothing under vendor-src/ is ever written.

   Run:  node scripts/memo-golden.mjs
   ============================================================================= */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const MIRROR = join(APP, "..", "..", "vendor-src", "credit-memo-ro");
const GOLDEN = join(APP, "src", "memo", "golden", "piedmont-memo.golden.html");

const work = mkdtempSync(join(tmpdir(), "memo-golden-"));
try {
  cpSync(MIRROR, work, { recursive: true });
  const log = execFileSync(process.execPath, [join(work, "test", "build-memo.mjs")], { encoding: "utf8" });
  const html = readFileSync(join(work, "test", "piedmont-memo.html"), "utf8");
  writeFileSync(GOLDEN, html);
  console.log(log.trim());
  console.log(`\nWrote ${GOLDEN} (${html.length} chars)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
