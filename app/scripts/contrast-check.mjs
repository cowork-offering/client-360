// WCAG AA contrast verification for the LIGHT (legacy) tokens (SPEC §8 + §12 A24).
// Body/status text is checked at >=4.5:1; supplementary labels + graphic marks
// at >=3:1. Chip foregrounds are checked against their tint composited over the
// card surface (white). Exits non-zero on any failure.

const hex = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const srgb = (c) => {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (fg, bg) => {
  const a = lum(fg) + 0.05;
  const b = lum(bg) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
};
const over = ([r, g, b], a, base) => base.map((bc, i) => Math.round([r, g, b][i] * a + bc * (1 - a)));

const WHITE = hex("#ffffff"); // card surface
const PAGE = hex("#f4f3f8"); // page surface
const accent = hex("#6b1cc4");

// [label, fg, bg, minRatio]
const checks = [
  ["ink / card", hex("#1a1a1a"), WHITE, 4.5],
  ["ink / page", hex("#1a1a1a"), PAGE, 4.5],
  ["ink-muted / card", hex("#6e6b7b"), WHITE, 4.5],
  ["ink-body / card", hex("#56535f"), WHITE, 4.5],
  ["ink-body-strong / card", hex("#3f3d4a"), WHITE, 4.5],
  ["ink-label / card (label)", hex("#8a8794"), WHITE, 3.0],
  ["ink-faint / card (kicker)", hex("#8f8c99"), WHITE, 3.0],
  ["accent / card", accent, WHITE, 4.5],
  ["positive text / card", hex("#047857"), WHITE, 4.5],
  ["warning text / card", hex("#92400e"), WHITE, 4.5],
  ["critical text / card", hex("#991b1b"), WHITE, 4.5],
  // Reason/status chips: ink on its tint composited over the card.
  ["chip positive", hex("#047857"), over(hex("#047857"), 0.09, WHITE), 4.5],
  ["chip warning", hex("#92400e"), over(hex("#92400e"), 0.09, WHITE), 4.5],
  ["chip critical", hex("#991b1b"), over(hex("#991b1b"), 0.09, WHITE), 4.5],
  ["chip accent (maturity)", accent, over(accent, 0.1, WHITE), 4.5],
  ["chip neutral", hex("#56535f"), hex("#f1f0f6"), 4.5],
  // A27.1 — FAB glyph/badge sit on the accent, not on a page surface.
  ["FAB glyph on accent", WHITE, accent, 4.5],
  ["FAB badge text on critical", WHITE, hex("#991b1b"), 4.5],
  ["FAB accent vs page (edge definition)", accent, PAGE, 3.0],
  // A27.4 — actions panel: disabled row ink + the reason line.
  ["action reason ink / card", hex("#8f8c99"), WHITE, 3.0],
  ["disabled action label / card", hex("#6e6b7b"), WHITE, 4.5],
  // A28 — grade pill ink on its own tint.
  ["grade pill amber", hex("#92400e"), over(hex("#92400e"), 0.09, WHITE), 4.5],
  ["grade pill green", hex("#047857"), over(hex("#047857"), 0.09, WHITE), 4.5],
  ["grade pill red", hex("#991b1b"), over(hex("#991b1b"), 0.09, WHITE), 4.5],
  // A31.4 — Client Actions trigger: accent ink on an 8% accent wash.
  ["actions trigger ink on wash", accent, over(accent, 0.08, WHITE), 4.5],
  ["actions trigger hover wash", accent, over(accent, 0.14, WHITE), 4.5],
  // A31.3 — user-driven activity (violet) on the card and on its 4% row wash.
  ["user tone / card", hex("#6038ea"), WHITE, 4.5],
  ["user tone on activity row wash", hex("#6038ea"), over(hex("#6038ea"), 0.04, WHITE), 4.5],
  ["user tone marker on its wash", hex("#6038ea"), over(hex("#6038ea"), 0.1, WHITE), 4.5],
];

let fail = 0;
for (const [label, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2)}:1  (min ${min})  ${label}`);
}
if (fail) {
  console.error(`\n${fail} contrast check(s) failed`);
  process.exit(1);
}
console.log("\nAll contrast checks pass.");
