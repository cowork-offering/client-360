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
const OVERLAY = hex("#f6f5fa"); // --surface-overlay, the wash inside a card
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
  // The zone switcher. The active segment sits on the thumb (card white); the
  // inactive one sits on the frosted glass, which is the page tinted 72% by
  // #f4f3f8 — the same colour, so it composites back to the page surface.
  ["zone label active / thumb", accent, WHITE, 4.5],
  ["zone count active / thumb", hex("#56535f"), WHITE, 4.5],
  ["zone label inactive / frost", hex("#6e6b7b"), PAGE, 4.5],
  ["zone count inactive / frost", hex("#8a8794"), PAGE, 3.0],
  // A31.3 — user-driven activity (violet) on the card and on its 4% row wash.
  ["user tone / card", hex("#6038ea"), WHITE, 4.5],
  ["user tone on activity row wash", hex("#6038ea"), over(hex("#6038ea"), 0.04, WHITE), 4.5],
  ["user tone marker on its wash", hex("#6038ea"), over(hex("#6038ea"), 0.1, WHITE), 4.5],

  /* --- The UX pass, founder UAT 2026-08-25 ------------------------------- */
  // F2 — the effective-challenge card. The card sits on --surface-overlay and
  // the VERDICT is toned by severity, so each tone is checked on that ground.
  // The severity chip sits on its own solid *-bg token, not on a tint.
  ["verdict critical / overlay", hex("#991b1b"), OVERLAY, 4.5],
  ["verdict warning / overlay", hex("#92400e"), OVERLAY, 4.5],
  ["verdict info (accent) / overlay", accent, OVERLAY, 4.5],
  ["severity chip critical", hex("#991b1b"), hex("#fbecec"), 4.5],
  ["severity chip warning", hex("#92400e"), hex("#fbf2e7"), 4.5],
  ["severity chip info on accent wash", accent, over(accent, 0.1, WHITE), 4.5],
  ["acknowledged caption / card", hex("#8f8c99"), WHITE, 3.0],

  // F4 — the technical toggle. A supplementary affordance, checked at 3:1 on
  // every ground it renders on: the gap note (card), the ticket's blocking-gap
  // banner (warning tint) and the deal header (accent wash). ink-faint fails
  // the last two, which is why the toggle carries ink-muted.
  ["technical toggle / card", hex("#6e6b7b"), WHITE, 3.0],
  ["technical toggle / warning banner", hex("#6e6b7b"), hex("#fbf2e7"), 3.0],
  ["technical toggle / deal header wash", hex("#6e6b7b"), over(accent, 0.1, WHITE), 3.0],

  // F1/F5 — the deal header and the from -> to rows.
  ["deal name / header wash", hex("#1a1a1a"), over(accent, 0.1, WHITE), 4.5],
  ["deal metadata / header wash", hex("#56535f"), over(accent, 0.1, WHITE), 4.5],
  ["deal selector inactive / raised", hex("#6e6b7b"), WHITE, 4.5],
  ["deal selector active on accent", WHITE, accent, 4.5],
  ["from-to increase / overlay", hex("#047857"), OVERLAY, 4.5],
  ["from-to decrease / overlay", hex("#991b1b"), OVERLAY, 4.5],
  ["from-to unchanged / overlay", hex("#6e6b7b"), OVERLAY, 4.5],

  // F6 — the security rows sit on the same overlay ground.
  ["security facility ink / overlay", hex("#1a1a1a"), OVERLAY, 4.5],
  ["security pledge ink / overlay", hex("#56535f"), OVERLAY, 4.5],
  ["security figures / overlay", hex("#6e6b7b"), OVERLAY, 4.5],
  ["security description / overlay", hex("#8f8c99"), OVERLAY, 3.0],
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
