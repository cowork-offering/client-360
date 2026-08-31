/* HANDOVER §3 — Continuity (the name flight) and §4 trap 2 (entry-animation restart).
   The flight is driven and sampled entirely in-page so nothing races the ghost. */

export async function nameFlight(page, T, rowSel) {
  return page.evaluate(async (args) => {
    const { S, rowSel } = args;
    const P = window.__P;
    const row = P.el(rowSel);
    const src = row.querySelector(S.worklistRowName);
    const srcR = P.rect(src);

    row.click();

    const frames = await P.sample(() => {
      const g = document.querySelector(S.flyName);
      const name = document.querySelector(S.heroName);
      const view = document.querySelector(S.viewAccount);
      const gs = g ? getComputedStyle(g) : null;
      return {
        ghost: g ? {
          fontPx: P.px(gs.fontSize),
          opacityPct: P.r2(parseFloat(gs.opacity) * 100),
          durMs: P.ms(gs.transitionDuration),
          timing: gs.transitionTimingFunction.split(/,(?![^(]*\))/)[0].trim(),
          props: gs.transitionProperty,
          r: P.rect(g)
        } : null,
        nameOpacityPct: name ? P.r2(parseFloat(getComputedStyle(name).opacity) * 100) : null,
        nameR: name ? P.rect(name) : null,
        viewOpacityPct: view ? P.r2(parseFloat(getComputedStyle(view).opacity) * 100) : null,
        viewAnim: view ? getComputedStyle(view).animationName : null,
        viewNoanim: view ? view.classList.contains(S.viewSuppressClass) : null
      };
    }, 1400); /* long enough to always contain the .16s ghost dissolve */

    const withGhost = frames.filter((f) => f.v.ghost);
    const first = withGhost[0];
    const at = (t) => withGhost.reduce((best, f) =>
      Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best, withGhost[0]);

    // "settled" = the last frame before the ghost starts dissolving, i.e. the
    // flight has finished travelling. Reading at a fixed clock would race the
    // machine, so the dissolve is found rather than assumed.
    const dissolveStart = withGhost.findIndex((f) => (f.v.ghost.opacityPct ?? 100) < 99.9);
    const settled = dissolveStart > 0 ? withGhost[dissolveStart - 1] : at(600);

    /* The "no dip" rule, measured the way the eye sees it: at EVERY frame of the
       flight something at full opacity must be carrying the name — the ghost, or
       the real element revealed underneath it. Keying the assertion off a
       dissolve-start timestamp races the frame clock (the .16s fade can start and
       finish between two samples on a loaded machine); this cannot. */
    const carried = frames
      .filter((f) => f.v.ghost || f.v.nameOpacityPct != null)
      .map((f) => Math.max(f.v.nameOpacityPct ?? 0, f.v.ghost ? f.v.ghost.opacityPct : 0));
    const minCombined = carried.length ? P.r2(Math.min(...carried)) : null;
    const minViewOpacity = P.r2(Math.min(...frames.map((f) => f.v.viewOpacityPct ?? 100)));
    const lastGhost = withGhost[withGhost.length - 1];
    const nameAtLastGhostFrame = lastGhost ? lastGhost.v.nameOpacityPct : null;
    const nameFinal = frames.length ? frames[frames.length - 1].v.nameOpacityPct : null;

    return {
      ghostAppeared: withGhost.length > 0,
      ghostStartFontPx: first ? first.v.ghost.fontPx : null,
      ghostEndFontPx: settled ? settled.v.ghost.fontPx : null,
      ghostMaxFontPx: withGhost.length ? Math.max(...withGhost.map((f) => f.v.ghost.fontPx)) : null,
      ghostTransitionMs: first ? first.v.ghost.durMs : null,
      ghostTransitionTiming: first ? first.v.ghost.timing : null,
      ghostStartOriginDeltaXPx: first ? P.r2(Math.abs(first.v.ghost.r.x - srcR.x)) : null,
      ghostStartOriginDeltaYPx: first ? P.r2(Math.abs(first.v.ghost.r.y - srcR.y)) : null,
      landingOffsetXPx: settled && settled.v.nameR ? P.r2(Math.abs(settled.v.ghost.r.x - settled.v.nameR.x)) : null,
      landingOffsetYPx: settled && settled.v.nameR ? P.r2(Math.abs(settled.v.ghost.r.y - settled.v.nameR.y)) : null,
      flightMinCarriedOpacityPct: minCombined,
      flightMinViewOpacityPct: minViewOpacity,
      realNameOpacityAtLastGhostFramePct: nameAtLastGhostFrame,
      realNameOpacityFinalPct: nameFinal,
      handoffNoOpacityDip: minCombined === 100 && minViewOpacity === 100 && nameFinal === 100,
      ghostDissolveMs: (() => {
        const late = withGhost.filter((f) => f.t >= 540);
        return late.length ? late[late.length - 1].v.ghost.durMs : null;
      })(),
      viewEntryAnimationDuringFlight: (frames.find((f) => f.t > 40) || { v: {} }).v.viewAnim,
      viewSuppressClassDuringFlight: (frames.find((f) => f.t > 40) || { v: {} }).v.viewNoanim,
      ghostRemovedAfterFlight: !document.querySelector(S.flyName)
    };
  }, { S: T.sel, rowSel });
}

/* §4 trap 2 — the suppression class must OUTRANK the show rule, and must only
   clear while the view is hidden. Both halves are measured. */
export async function entrySuppression(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;

    // (a) specificity: does .view.noanim.show actually beat .view.show?
    const probe = document.createElement("div");
    probe.className = S.viewBaseClass;
    probe.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px";
    document.body.appendChild(probe);
    probe.classList.add(S.viewShowClass);
    const withShow = getComputedStyle(probe).animationName;
    probe.classList.add(S.viewSuppressClass);
    const withBoth = getComputedStyle(probe).animationName;
    probe.remove();

    // (b) live: the class must still be on the client view while it is shown
    const view = P.el(S.viewAccount);
    const heldWhileShown = view.classList.contains(S.viewSuppressClass) &&
      view.classList.contains(S.viewShowClass);

    // (c) leaving the view: the class clears only once the view is hidden,
    //     and no entry animation is left running on it
    P.el(S.goHome).click();
    await P.sleep(500);
    const afterLeave = {
      display: getComputedStyle(view).display,
      hasSuppress: view.classList.contains(S.viewSuppressClass),
      hasShow: view.classList.contains(S.viewShowClass),
      animName: getComputedStyle(view).animationName
    };

    return {
      showRuleAnimates: withShow !== "none",
      showRuleAnimationName: withShow,
      suppressOutranksShow: withBoth === "none",
      suppressHeldWhileViewShown: heldWhileShown,
      viewHiddenWhenSuppressCleared: afterLeave.display === "none",
      suppressClearedAfterLeave: afterLeave.hasSuppress === false,
      noEntryAnimationLeftRunning: afterLeave.display === "none" || afterLeave.animName === "none"
    };
  }, T.sel);
}
