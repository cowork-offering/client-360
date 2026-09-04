#!/usr/bin/env node
/* =============================================================================
   MEMO VENDOR DRIFT CHECK

   src/memo/vendor/ is a VERBATIM copy of the credit-memo plugin (see
   src/memo/vendor/VENDOR.md). Nobody edits it. This script is what makes that
   claim checkable rather than aspirational:

     1. every vendored file is hashed against src/memo/vendor/vendor-manifest.json
        (missing, extra and changed files all fail),
     2. src/memo/renderMemo.vendor.mjs — the ONE derived file, the browser copy
        of render-memo.mjs — is regenerated from the vendored original and
        compared byte for byte, so the derivation can only ever be "the vendored
        file minus the recorded line ranges".

   Run:  node scripts/memo-vendor-check.mjs           verify (exit 1 on drift)
         node scripts/memo-vendor-check.mjs --write   re-record after a refresh

   `--write` is for ONE case only: the vendored copy was refreshed from a new
   upstream commit, and VENDOR.md was updated to name it.
   ============================================================================= */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const VENDOR = join(APP, "src", "memo", "vendor");
const MANIFEST = join(VENDOR, "vendor-manifest.json");
const SOURCE_MJS = join(VENDOR, "render", "render-memo.mjs");
const DERIVED_MJS = join(APP, "src", "memo", "renderMemo.vendor.mjs");

const MANIFEST_README =
  "sha256 of every file under src/memo/vendor/, recorded so upstream drift is detected rather than " +
  "discovered. Verified by scripts/memo-vendor-check.mjs and by src/memo/vendorDrift.test.ts. " +
  "Regenerate with --write ONLY when refreshing from a new upstream commit named in VENDOR.md.";

/* -----------------------------------------------------------------------------
   THE DERIVATION, declared as data.

   Three cuts, each anchored on the exact source text so a line-number drift can
   never silently cut the wrong thing. Everything between the cuts is the
   original file, byte for byte.
   ----------------------------------------------------------------------------- */
export const CUTS = [
  {
    lines: "1-1",
    why: "the `#!/usr/bin/env node` shebang. Legal only as the first bytes of a file, and this copy is a bundled module rather than an executable.",
    first: "#!/usr/bin/env node",
    last: "#!/usr/bin/env node",
  },
  {
    lines: "17-19",
    why: "node:fs / node:path / node:url imports at module top. Vite cannot resolve them for a browser bundle. They are used ONLY by the CLI block below, never by renderMemo itself.",
    first: 'import { readFileSync, writeFileSync } from "node:fs";',
    last: 'import { fileURLToPath } from "node:url";',
  },
  {
    lines: "748-771",
    why: "the `node render-memo.mjs --dossier ...` CLI entry. It reads argv and the filesystem; the browser has neither. renderMemo (lines 21-747) is untouched.",
    first: "",
    last: "}",
    secondLine: "// ---------------------------------------------------- CLI entry",
  },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else if (abs !== MANIFEST) out.push(abs);
  }
  return out;
}

/** Cut the recorded line ranges out of the vendored renderer, and say so in a header. */
export function deriveBrowserCopy(source) {
  const lines = source.split("\n");
  const ranges = CUTS.map((cut) => {
    const [from, to] = cut.lines.split("-").map((n) => Number(n) - 1);
    if (lines[from] !== cut.first || lines[to] !== cut.last) {
      throw new Error(
        `vendored render-memo.mjs no longer matches the recorded cut at lines ${cut.lines}: expected first ` +
          `${JSON.stringify(cut.first)} / last ${JSON.stringify(cut.last)}, got ${JSON.stringify(lines[from])} / ` +
          `${JSON.stringify(lines[to])}. Re-read the upstream file and re-record the cut before re-deriving.`,
      );
    }
    if (cut.secondLine && lines[from + 1] !== cut.secondLine) {
      throw new Error(`cut ${cut.lines} no longer opens with ${JSON.stringify(cut.secondLine)}.`);
    }
    return [from, to];
  });
  const header = [
    "/* =========================================================================",
    "   DERIVED FILE — DO NOT EDIT. Regenerate with:",
    "     node scripts/memo-vendor-check.mjs --write",
    "",
    "   This is src/memo/vendor/render/render-memo.mjs (the credit-memo plugin's",
    "   renderer, vendored verbatim — see src/memo/vendor/VENDOR.md) with exactly",
    "   three line ranges removed so vite can bundle it for the browser:",
    "",
    ...CUTS.map((c) => `     lines ${c.lines} — ${c.why}`),
    "",
    "   Nothing else differs. scripts/memo-vendor-check.mjs re-derives this file",
    "   from the vendored original on every run and fails on any byte of drift.",
    "   ========================================================================= */",
    "",
  ].join("\n");
  return header + lines.filter((_line, i) => !ranges.some(([a, b]) => i >= a && i <= b)).join("\n");
}

/** Vendored-file hashes as they are on disk right now. */
export function hashVendorTree() {
  return Object.fromEntries(
    walk(VENDOR).map((abs) => [relative(VENDOR, abs).split(sep).join("/"), sha256(readFileSync(abs))]),
  );
}

/** Recorded-vs-actual, plus the derived copy. Empty array = clean. */
export function vendorDrift() {
  const actual = hashVendorTree();
  const recorded = JSON.parse(readFileSync(MANIFEST, "utf8")).files;
  const problems = [];
  for (const [path, hash] of Object.entries(recorded)) {
    if (!(path in actual)) problems.push(`MISSING  ${path}`);
    else if (actual[path] !== hash) problems.push(`CHANGED  ${path}`);
  }
  for (const path of Object.keys(actual)) if (!(path in recorded)) problems.push(`EXTRA    ${path}`);
  if (readFileSync(DERIVED_MJS, "utf8") !== deriveBrowserCopy(readFileSync(SOURCE_MJS, "utf8"))) {
    problems.push(`CHANGED  src/memo/renderMemo.vendor.mjs (no longer matches the vendored renderer)`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    const files = hashVendorTree();
    writeFileSync(MANIFEST, JSON.stringify({ _README: MANIFEST_README, files }, null, 2) + "\n");
    writeFileSync(DERIVED_MJS, deriveBrowserCopy(readFileSync(SOURCE_MJS, "utf8")));
    console.log(`recorded ${Object.keys(files).length} vendored files and re-derived the browser copy`);
  } else {
    const problems = vendorDrift();
    if (problems.length) {
      console.error(`memo vendor drift (${problems.length}):`);
      for (const p of problems) console.error(`  ${p}`);
      console.error(
        "\nsrc/memo/vendor/ is upstream's, not ours. If this is an intentional refresh from a new " +
          "upstream commit, update src/memo/vendor/VENDOR.md and re-run with --write.",
      );
      process.exit(1);
    }
    console.log(`memo vendor clean: ${Object.keys(hashVendorTree()).length} files + the derived browser copy`);
  }
}
