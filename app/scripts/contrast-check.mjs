// WCAG AA contrast verification for the LIGHT tokens (SPEC §8 + §12 A24), kept
// in step with styles/tokens.css by hand — change a value there, change it here.
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
const PAGE = hex("#f6f6fb"); // page surface
const OVERLAY = hex("#f7f7fc"); // --surface-overlay, the wash inside a card
const accent = hex("#822db4");

// [label, fg, bg, minRatio]
const checks = [
  ["ink / card", hex("#1a1b25"), WHITE, 4.5],
  ["ink / page", hex("#1a1b25"), PAGE, 4.5],
  ["ink-muted / card", hex("#63637e"), WHITE, 4.5],
  ["ink-body / card", hex("#53536b"), WHITE, 4.5],
  ["ink-body-strong / card", hex("#3b3b52"), WHITE, 4.5],
  ["ink-label / card (label)", hex("#82829d"), WHITE, 3.0],
  ["ink-faint / card (kicker)", hex("#8a8aa4"), WHITE, 3.0],
  ["accent / card", accent, WHITE, 4.5],
  ["positive text / card", hex("#047857"), WHITE, 4.5],
  ["warning text / card", hex("#92400e"), WHITE, 4.5],
  ["critical text / card", hex("#991b1b"), WHITE, 4.5],
  // Reason/status chips: ink on its tint composited over the card.
  ["chip positive", hex("#047857"), over(hex("#047857"), 0.09, WHITE), 4.5],
  ["chip warning", hex("#92400e"), over(hex("#92400e"), 0.09, WHITE), 4.5],
  ["chip critical", hex("#991b1b"), over(hex("#991b1b"), 0.09, WHITE), 4.5],
  ["chip accent (maturity)", accent, over(accent, 0.1, WHITE), 4.5],
  ["chip neutral", hex("#53536b"), hex("#f1f1f8"), 4.5],
  // A27.1 — FAB glyph/badge sit on the accent, not on a page surface.
  ["FAB glyph on accent", WHITE, accent, 4.5],
  ["FAB badge text on critical", WHITE, hex("#991b1b"), 4.5],
  ["FAB accent vs page (edge definition)", accent, PAGE, 3.0],
  // A27.4 — actions panel: disabled row ink + the reason line.
  ["action reason ink / card", hex("#8a8aa4"), WHITE, 3.0],
  ["disabled action label / card", hex("#63637e"), WHITE, 4.5],
  // A28 — grade pill ink on its own tint.
  ["grade pill amber", hex("#92400e"), over(hex("#92400e"), 0.09, WHITE), 4.5],
  ["grade pill green", hex("#047857"), over(hex("#047857"), 0.09, WHITE), 4.5],
  ["grade pill red", hex("#991b1b"), over(hex("#991b1b"), 0.09, WHITE), 4.5],
  // A31.4 — Client Actions trigger: accent ink on an 8% accent wash.
  ["actions trigger ink on wash", accent, over(accent, 0.08, WHITE), 4.5],
  ["actions trigger hover wash", accent, over(accent, 0.14, WHITE), 4.5],
  // The zone switcher. The active segment sits on the thumb (card white); the
  // inactive one sits on the frosted glass, which is the page tinted 72% by
  // the page colour itself, so it composites back to the page surface.
  ["zone label active / thumb", accent, WHITE, 4.5],
  ["zone count active / thumb", hex("#53536b"), WHITE, 4.5],
  ["zone label inactive / frost", hex("#63637e"), PAGE, 4.5],
  ["zone count inactive / frost", hex("#82829d"), PAGE, 3.0],
  // A31.3 — user-driven activity (violet) on the card and on its 4% row wash.
  ["user tone / card", hex("#5f49c9"), WHITE, 4.5],
  ["user tone on activity row wash", hex("#5f49c9"), over(hex("#5f49c9"), 0.04, WHITE), 4.5],
  ["user tone marker on its wash", hex("#5f49c9"), over(hex("#5f49c9"), 0.1, WHITE), 4.5],

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
  ["acknowledged caption / card", hex("#8a8aa4"), WHITE, 3.0],

  // F4 — the technical toggle. A supplementary affordance, checked at 3:1 on
  // every ground it renders on: the gap note (card), the ticket's blocking-gap
  // banner (warning tint) and the deal header (accent wash). ink-faint fails
  // the last two, which is why the toggle carries ink-muted.
  ["technical toggle / card", hex("#63637e"), WHITE, 3.0],
  ["technical toggle / warning banner", hex("#63637e"), hex("#fbf2e7"), 3.0],
  ["technical toggle / deal header wash", hex("#63637e"), over(accent, 0.1, WHITE), 3.0],

  // F1/F5 — the deal header and the from -> to rows.
  ["deal name / header wash", hex("#1a1b25"), over(accent, 0.1, WHITE), 4.5],
  ["deal metadata / header wash", hex("#53536b"), over(accent, 0.1, WHITE), 4.5],
  ["deal selector inactive / raised", hex("#63637e"), WHITE, 4.5],
  ["deal selector active on accent", WHITE, accent, 4.5],
  ["from-to increase / overlay", hex("#047857"), OVERLAY, 4.5],
  ["from-to decrease / overlay", hex("#991b1b"), OVERLAY, 4.5],
  ["from-to unchanged / overlay", hex("#63637e"), OVERLAY, 4.5],

  /* --- The polish wave, "Violet Dusk Linen" adapted (2026-08-27) ---------- */
  // The raw brand violet is reserved for the typographic ">" and the single
  // approval. It carries white ink on the approve button, and stands as a
  // graphic mark on the page wherever the glyph loads, steps or lands.
  ["approve ink on brand", WHITE, hex("#a100ff"), 4.5],
  ["brand glyph / page (graphic mark)", hex("#a100ff"), PAGE, 3.0],
  ["brand glyph / card (graphic mark)", hex("#a100ff"), WHITE, 3.0],
  // The accent at rest: meter fills and a walked step. Graphic marks, never text.
  ["accent-quiet / card (graphic mark)", hex("#a766cc"), WHITE, 3.0],
  ["accent-quiet / page (graphic mark)", hex("#a766cc"), PAGE, 3.0],
  // The scene-bar action and the drawn bar carry inverse ink on --fill-strong.
  ["inverse ink on fill-strong", WHITE, hex("#33324a"), 4.5],
  // A CLOSED gate still states its own name: quiet ink on the quiet wash.
  ["disabled action label / wash-2", hex("#82829d"), hex("#f1f1f8"), 3.0],

  // F6 — the security rows sit on the same overlay ground.
  ["security facility ink / overlay", hex("#1a1b25"), OVERLAY, 4.5],
  ["security pledge ink / overlay", hex("#53536b"), OVERLAY, 4.5],
  ["security figures / overlay", hex("#63637e"), OVERLAY, 4.5],
  ["security description / overlay", hex("#8a8aa4"), OVERLAY, 3.0],

  // Workroom Tier-1 advice. It is deliberately QUIET — a neutral wash rather
  // than a verdict tint — so it is the one place a legibility floor is easiest
  // to lose. The advice line is body text and is held to 4.5; its kicker is a
  // label and to 3.
  ["advisory line / wash-2", hex("#53536b"), hex("#f1f1f8"), 4.5],
  ["advisory kicker / wash-2", hex("#82829d"), hex("#f1f1f8"), 3.0],
  ["advisory action ink / card", hex("#3b3b52"), WHITE, 4.5],
  ["advisory action hover ink / card", accent, WHITE, 4.5],
  // The refusal's banker-language reading sits on the warning tint.
  ["refusal why / warning tint", hex("#5a4423"), hex("#fbf2e7"), 4.5],
  // The check's "why" line, one step quieter than its verdict text.
  ["check why / card", hex("#63637e"), WHITE, 4.5],
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
