/* HANDOVER §3 — Client view. Every worklist row opens ITS client; the grade
   ring redraws from 119.4 on every entry; anchors cascade; meters fill from 0. */

export async function clients(page, T) {
  const out = {};
  for (const c of T.clients) {
    out[c.id] = await page.evaluate(async (args) => {
      const { S, rowSel } = args;
      const P = window.__P;
      const home = P.el(S.viewHome);
      if (!home.classList.contains(S.viewShowClass)) {
        const back = P.el(S.goHome);
        if (back) back.click();
        await P.until(() => P.el(S.viewHome).classList.contains(S.viewShowClass), 2000, 40);
        await P.sleep(350);
      }
      P.el(rowSel).click();

      const ring = await P.until(() => P.el(S.gradeRingFg), 2000, 16);
      const targetAttr = ring ? parseFloat(ring.getAttribute("stroke-dashoffset")) : null;
      const frames = ring ? await P.sample(() => {
        const r = P.el(S.gradeRingFg);
        return r ? P.px(getComputedStyle(r).strokeDashoffset) : null;
      }, 1500) : [];

      const vals = frames.map((f) => f.v).filter((v) => v != null);
      const early = frames.filter((f) => f.t < 260).map((f) => f.v).filter((v) => v != null);

      const name = P.el(S.heroName);
      const anchors = P.all(S.anchor);
      const anchorDelaysMs = anchors.map((a) => P.ms(getComputedStyle(a).animationDelay));

      /* the meter lives on the exposure pane; make sure that pane is the one
         showing before measuring its fill (panes persist across client switches) */
      const firstTab = P.all(S.navTab)[0];
      if (firstTab && !firstTab.classList.contains(S.navTabActiveClass)) { firstTab.click(); await P.sleep(450); }
      const meter = document.querySelector(S.paneShown + " " + S.paneMeterFill);
      const ms = meter ? getComputedStyle(meter) : null;

      return {
        heroName: name ? name.textContent.trim() : null,
        ringTargetAttrPx: targetAttr,
        ringStartOffsetPx: early.length ? Math.max(...early) : null,
        ringEndOffsetPx: vals.length ? vals[vals.length - 1] : null,
        ringAnimated: vals.length ? P.r2(Math.max(...vals) - Math.min(...vals)) > 1 : false,
        ringTransitionMs: ring ? P.ms(getComputedStyle(ring).transitionDuration) : null,
        anchorCount: anchors.length,
        anchorCascadeDelaysMs: anchorDelaysMs,
        anchorCascadeStepMs: anchorDelaysMs.length > 2 ? P.r2(anchorDelaysMs[2] - anchorDelaysMs[1]) : null,
        anchorEntryAnimationName: anchors.length ? getComputedStyle(anchors[0]).animationName : null,
        meterFillAnimationName: ms ? ms.animationName : null,
        meterFillDelayMs: ms ? P.ms(ms.animationDelay) : null,
        meterFillDurationMs: ms ? P.ms(ms.animationDuration) : null
      };
    }, { S: T.sel, rowSel: c.row });
    out[c.id].nameMatchesExpected = out[c.id].heroName === c.name;
    out[c.id].ringHitsExpectedTarget = Math.abs(out[c.id].ringEndOffsetPx - c.ringTargetOffsetPx) < 0.5;
  }
  return out;
}

/* The graph pane draws metro routes with 4px corners, drifting into the borrower. */
export async function graphPane(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    const tab = P.el(S.navTabGraph) || P.all(S.navTab).find((t) => /graph/i.test(t.textContent));
    if (!tab) return { graphTabFound: false };
    tab.click();
    await P.sleep(700);
    const paths = P.all(S.graphRoute);
    const ds = paths.map((p) => p.getAttribute("d"));
    const corners = ds.map((d) => (d.match(/Q/g) || []).length);
    const particles = P.all(S.graphParticle).length;
    return {
      graphTabFound: true,
      graphRouteCount: paths.length,
      graphCornerCountPerRoute: corners,
      graphParticleCount: particles,
      graphRoutesUseQuadraticCorners: corners.every((c) => c === 2 || c === 0)
    };
  }, T.sel);
}

/* The modification ritual is gated to Hartwell in the dummy: other clients toast. */
export async function workroomGate(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    P.el(S.fab).click();
    await P.sleep(600);
    P.el(S.arcModify).click();
    await P.sleep(500);
    const toast = P.el(S.toast);
    const roomOpen = P.el(S.workroom).classList.contains(S.workroomShowClass);
    const res = {
      gateToastShown: toast ? toast.classList.contains("show") : null,
      gateToastText: toast ? toast.textContent.trim() : null,
      workroomBlocked: !roomOpen
    };
    document.body.click();
    await P.sleep(300);
    return res;
  }, T.sel);
}
