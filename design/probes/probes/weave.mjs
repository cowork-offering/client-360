/* HANDOVER addendum — the landing weave: 12 seeded filament threads that drift,
   behind the briefing, with the worklist still clickable through them. */

export async function weave(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    const nodes = P.all(S.weaveNodes);
    const before = nodes.map((n) => n.getAttribute("transform"));
    await P.sleep(500);
    const after = P.all(S.weaveNodes).map((n) => n.getAttribute("transform"));
    const moved = before.filter((t, i) => t !== after[i]).length;

    const layer = P.el(S.weaveLayer);
    const ls = layer ? getComputedStyle(layer) : null;
    const lr = P.rect(layer);

    const paths = P.all(S.weaveNodes + " path");
    const opacities = paths.map((p) => parseFloat(p.getAttribute("opacity")));
    const widths = paths.map((p) => parseFloat(p.getAttribute("stroke-width")));

    // the worklist must stay reachable through the weave
    const row = P.el(S.rowHartwell);
    const rr = P.rect(row);
    const hit = document.elementFromPoint(rr.cx, rr.cy);
    const kpi = P.el("#kpiband");
    const kr = P.rect(kpi);

    return {
      weaveNodeCount: nodes.length,
      weaveNodesWithTransform: before.filter((t) => t != null).length,
      weaveNodesDriftingCount: moved,
      weaveDrifts: moved > 0,
      weaveLayerPointerEvents: ls ? ls.pointerEvents : null,
      weaveLayerZIndex: ls ? ls.zIndex : null,
      weaveLayerHeightPx: lr ? lr.h : null,
      weaveLayerHasMask: !!(ls && (ls.maskImage || ls.webkitMaskImage) && (ls.maskImage || ls.webkitMaskImage) !== "none"),
      weaveReachesPastKpiBandTop: lr && kr ? lr.y + lr.h > kr.y : null,
      weaveLeadOpacityPct: opacities.length ? P.r2(Math.max(...opacities) * 100) : null,
      weaveMinOpacityPct: opacities.length ? P.r2(Math.min(...opacities) * 100) : null,
      weaveMinStrokeWidthPx: widths.length ? Math.min(...widths) : null,
      weaveMaxStrokeWidthPx: widths.length ? Math.max(...widths) : null,
      worklistRowHitThroughWeave: !!(hit && hit.closest(S.worklistRow))
    };
  }, T.sel);
}
