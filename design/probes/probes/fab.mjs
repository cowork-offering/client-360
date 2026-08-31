/* HANDOVER §3 — FAB / arc / narrator chip / whisper. */

export async function position(page, T) {
  return page.evaluate(({ S, K }) => {
    const P = window.__P;
    const wrap = P.el(S.fabWrap);
    const r = P.rect(wrap);
    const fab = P.el(S.fab);
    const fr = P.rect(fab);
    const halo = getComputedStyle(fab, "::after");
    return {
      fabRightPx: r ? P.r2(window.innerWidth - r.x - r.w) : null,
      fabBottomPx: r ? P.r2(window.innerHeight - r.y - r.h) : null,
      fabWidthPx: fr ? fr.w : null,
      fabHeightPx: fr ? fr.h : null,
      idleHaloAnimationName: halo.animationName,
      idleHaloDurationMs: P.ms(halo.animationDuration),
      idleHaloTimingFunction: halo.animationTimingFunction,
      idleHaloIterationCount: halo.animationIterationCount,
      idleHaloBoxShadow: halo.boxShadow,
      idleHaloKeyframes: (P.keyframes(K.fabIdle) || []).map((k) => k.key + "{" + k.css + "}").join(" ")
    };
  }, { S: T.sel, K: T.keyframes });
}

export async function arc(page, T) {
  return page.evaluate(async ({ S, TX }) => {
    const P = window.__P;
    const wrap = P.el(S.fabWrap);
    const fab = P.el(S.fab);

    const labelAtRest = (P.el(S.arcLabel) || {}).textContent || null;

    fab.click();
    await P.sleep(700);

    const open = wrap.classList.contains(S.fabWrapOpenClass);
    const fabC = P.rect(fab);
    const btns = P.all(S.arcButton);
    const centers = btns.map((b) => P.rect(b)).map((r) => ({ cx: r.cx, cy: r.cy }));
    const radiiPx = centers.map((c) => P.r2(Math.hypot(c.cx - fabC.cx, c.cy - fabC.cy)));
    const neighbourSpacingPx = centers.slice(1).map((c, i) =>
      P.r2(Math.hypot(c.cx - centers[i].cx, c.cy - centers[i].cy)));

    const mark = P.el(S.fabMark);
    const markRotationDeg = P.matrix(getComputedStyle(mark).transform).rotateDeg;

    const lbl = P.el(S.arcLabel);
    const lr = P.rect(lbl);
    const labelCenterDeltaPx = lr ? P.r2(Math.abs(lr.cx - fabC.cx)) : null;

    // every satellite label must fit the viewport at 1360w
    const labels = [];
    let allFit = true;
    for (const b of btns) {
      b.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      await P.sleep(40);
      const rr = P.rect(lbl);
      labels.push(lbl.textContent);
      if (!rr || rr.x < 0 || rr.x + rr.w > window.innerWidth) allFit = false;
      b.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
      await P.sleep(20);
    }
    await P.sleep(60);
    const labelBackAtRest = lbl.textContent;

    // close the arc again
    document.body.click();
    await P.sleep(400);

    return {
      arcOpens: open,
      arcSatelliteCount: btns.length,
      arcRadiiPx: radiiPx,
      arcRadiusPx: P.r2(radiiPx.reduce((a, b) => a + b, 0) / radiiPx.length),
      arcNeighbourSpacingPx: neighbourSpacingPx,
      arcNeighbourSpacingMeanPx: P.r2(neighbourSpacingPx.reduce((a, b) => a + b, 0) / neighbourSpacingPx.length),
      markRotationOpenDeg: markRotationDeg,
      narratorChipCenterDeltaPx: labelCenterDeltaPx,
      narratorChipTextAtRest: labelAtRest,
      narratorChipTextRestoredAtRest: labelBackAtRest,
      narratorChipMatchesExpectedRest: (labelAtRest || "").trim() === TX.arcLabelAtRest,
      narratorHoverLabels: labels,
      narratorLabelsFitViewport: allFit,
      arcClosedOnOutsideClick: !wrap.classList.contains(S.fabWrapOpenClass)
    };
  }, { S: T.sel, TX: T.text });
}

/* Whisper: once per session, ~3.2s idle on landing, FAB breathes 2x. */
export async function whisper(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    const w = P.el(S.whisper);
    const fab = P.el(S.fab);
    const shown = await P.until(() => w.classList.contains(S.whisperShowClass), 6000, 60);
    await P.sleep(700); /* the whisper eases in over .45s */
    const ws = getComputedStyle(w);
    const fs = getComputedStyle(fab);
    return {
      whisperAppears: !!shown,
      whisperOpacityPct: P.r2(parseFloat(ws.opacity) * 100),
      whisperBreatheAnimationName: fs.animationName,
      whisperBreatheDurationMs: P.ms(fs.animationDuration),
      whisperBreatheIterationCount: fs.animationIterationCount
    };
  }, T.sel);
}
