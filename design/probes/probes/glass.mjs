/* HANDOVER §3 glass census — the material regression test.
   Every backdrop-filter surface carries 3 inset rims; `.arclbl` is the sole
   1-rim exception. Dark outer hairlines only, never white borders on glass. */

const RIM_EXCEPTIONS = { arclbl: 1 };

export async function census(page, T, stateName) {
  const raw = await page.evaluate(() => window.__P.census(false));
  const entries = raw.map((e) => ({
    cls: e.cls,
    tag: e.tag,
    insetCount: e.insetCount,
    blurPx: e.blurPx,
    onScreen: e.onScreen
  }));

  const violations = [];
  for (const e of entries) {
    const key = Object.keys(RIM_EXCEPTIONS).find((k) => e.cls.split(/\s+/).includes(k));
    const expected = key ? RIM_EXCEPTIONS[key] : 3;
    if (e.insetCount !== expected) {
      violations.push({ cls: e.cls, insetCount: e.insetCount, expectedInsetCount: expected, state: stateName });
    }
  }

  const byRims = {};
  entries.forEach((e) => { byRims[e.insetCount] = (byRims[e.insetCount] || 0) + 1; });

  return {
    state: stateName,
    glassSurfaceCount: entries.length,
    glassSurfacesByRimCount: byRims,
    glassBlurScalePx: Array.from(new Set(entries.map((e) => e.blurPx).filter((b) => b != null))).sort((a, b) => a - b),
    glassRimViolationCount: violations.length,
    glassRimViolations: violations,
    glassEntries: entries.sort((a, b) => a.cls.localeCompare(b.cls))
  };
}

/* Glass must never wear a white outer border. */
export async function hairlines(page, T) {
  return page.evaluate(() => {
    const P = window.__P;
    const glass = P.census(false);
    const els = Array.prototype.slice.call(document.querySelectorAll("*")).filter((e) => {
      const s = getComputedStyle(e);
      const bf = s.backdropFilter || s.webkitBackdropFilter || "";
      return bf.indexOf("blur") !== -1;
    });
    const borders = els.map((e) => {
      const s = getComputedStyle(e);
      return { cls: P.classOf(e) || ("#" + e.id), borderTopColor: s.borderTopColor, borderTopWidthPx: P.px(s.borderTopWidth) };
    });
    const isWhitish = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return false;
      const a = m[4] == null ? 1 : parseFloat(m[4]);
      if (a < 0.02) return false;
      return +m[1] > 200 && +m[2] > 200 && +m[3] > 200;
    };
    const white = borders.filter((b) => b.borderTopWidthPx > 0 && isWhitish(b.borderTopColor));
    return {
      glassSurfaceCountForBorders: glass.length,
      glassWhiteBorderCount: white.length,
      glassWhiteBorders: white,
      glassBorderColors: Array.from(new Set(borders.filter((b) => b.borderTopWidthPx > 0).map((b) => b.borderTopColor))).sort()
    };
  });
}
