/* HANDOVER §3 — Header / nav.
   Capsule visibility + centring, bar/capsule geometry, the animation-delay
   cascade, the transition-delay poison trap, the active wash, scroll shadow. */

export async function landing(page, T) {
  return page.evaluate((S) => {
    const P = window.__P;
    const wrap = P.el(S.navWrap);
    const s = wrap ? getComputedStyle(wrap) : null;
    const r = P.rect(wrap);
    const visible = !!(s && s.display !== "none" && parseFloat(s.opacity) > 0.01 && r && r.w > 0);
    return {
      navVisibleOnLanding: visible,
      navOpacityOnLandingPct: s ? P.r2(parseFloat(s.opacity) * 100) : null,
      navPointerEvents: s ? s.pointerEvents : null,
      navDisplay: s ? s.display : null,
      bodyHasOnClient: document.body.classList.contains(S.onClientBodyClass)
    };
  }, T.sel);
}

export async function client(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    const cap = P.el(S.navCapsule);
    const bar = P.el(S.topbarInner);
    const capR = P.rect(cap), barR = P.rect(bar);
    const wrapS = getComputedStyle(P.el(S.navWrap));

    const tabs = P.all(S.navTab);
    const tabDelaysMs = tabs.map((t) => P.ms(getComputedStyle(t).animationDelay));
    const tabAnimNames = tabs.map((t) => getComputedStyle(t).animationName);
    const tabTransitionDelaysMs = tabs.map((t) => P.ms(getComputedStyle(t).transitionDelay));

    // The poison trap: click a tab, then read its computed transition-delay.
    // The wash must also interpolate from the FIRST frame (alpha 0 -> .06),
    // which only happens if nothing delays the transition.
    const target = tabs[3] || tabs[1] || tabs[0];
    const alphaOf = (c) => {
      const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? (m[4] == null ? 1 : parseFloat(m[4])) : null;
    };
    const rgbOf = (c) => {
      const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    target.click();
    const washFrames = await P.sample(() => getComputedStyle(target).backgroundColor, 400);
    await P.sleep(60);
    const clicked = getComputedStyle(target);
    const activeWash = getComputedStyle(P.el(S.navTabActive) || target).backgroundColor;
    const washAlphas = washFrames.map((f) => alphaOf(f.v)).filter((a) => a != null);
    const washRgbEnd = rgbOf(activeWash);
    // the frame the violet hue first shows through (alpha below ~.005 rounds the
    // hue away, so this is the honest "the wash has started moving" marker)
    const hueFrame = washFrames.find((f) => {
      const c = rgbOf(f.v);
      return c && (c[0] + c[1] + c[2]) > 0;
    });

    return {
      navVisibleOnClient: parseFloat(wrapS.opacity) > 0.9,
      capsuleCenterDeltaPx: capR ? P.r2(Math.abs(capR.cx - window.innerWidth / 2)) : null,
      capsuleHeightPx: capR ? capR.h : null,
      barHeightPx: barR ? barR.h : null,
      capsuleFitsInsideBar: !!(capR && barR && capR.h <= barR.h),
      navWrapTransitionDelayMs: P.ms(wrapS.transitionDelay),
      tabCount: tabs.length,
      tabAnimationDelaysMs: tabDelaysMs,
      tabAnimationName: tabAnimNames[0],
      tabAnimationDelayFirstMs: tabDelaysMs[0],
      tabAnimationDelayLastMs: tabDelaysMs[tabDelaysMs.length - 1],
      tabTransitionDelaysAllZero: tabTransitionDelaysMs.every((d) => d === 0),
      clickedTabTransitionDelayMs: P.ms(clicked.transitionDelay),
      clickedTabTransitionDelayRaw: clicked.transitionDelay,
      activeTabWashColor: activeWash,
      activeTabWashRgb: washRgbEnd,
      activeTabWashStartAlphaPct: washAlphas.length ? P.r2(washAlphas[0] * 100) : null,
      activeTabWashEndAlphaPct: washAlphas.length ? P.r2(Math.max(...washAlphas) * 100) : null,
      activeTabWashHueAppearsByMs: hueFrame ? hueFrame.t : null,
      activeTabWashInterpolatesFromFirstFrame:
        washAlphas.length > 3 &&
        washAlphas[0] < Math.max(...washAlphas) &&
        P.ms(clicked.transitionDelay) === 0 &&
        !!hueFrame && hueFrame.t < P.ms(clicked.transitionDuration),
      tabTransitionDurationMs: P.ms(clicked.transitionDuration)
    };
  }, T.sel);
}

export async function scrollShadow(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    const bar = P.el(S.topbar);
    const insets = (v) => (v.match(/inset/g) || []).length;
    const outer = (v) => v.split(/,(?![^(]*\))/).filter((p) => p.indexOf("inset") === -1).length;
    const scrollable = () => document.documentElement.scrollHeight > window.innerHeight + 20;

    /* The mint is laid out to fit 1360x900, so most surfaces cannot scroll at
       all. Find one that can before asserting anything about the shadow. */
    let surface = "current";
    if (!scrollable()) {
      for (const t of P.all(S.navTab)) {
        t.click();
        await P.sleep(420);
        if (scrollable()) { surface = t.getAttribute("data-pane") || t.textContent.trim(); break; }
      }
    }
    const found = scrollable();
    const docHeightPx = document.documentElement.scrollHeight;

    window.scrollTo(0, 0);
    await P.sleep(180);
    const atTop = getComputedStyle(bar).boxShadow;
    const flagAtTop = document.body.classList.contains(S.scrolledBodyClass);

    window.scrollTo(0, 8);
    await P.sleep(180);
    const flagAt8 = document.body.classList.contains(S.scrolledBodyClass);

    window.scrollTo(0, 40);
    await P.sleep(600);
    const scrolled = getComputedStyle(bar).boxShadow;
    const flagAt40 = document.body.classList.contains(S.scrolledBodyClass);

    window.scrollTo(0, 0);
    await P.sleep(600);
    const back = getComputedStyle(bar).boxShadow;

    const bs = getComputedStyle(bar);
    const props = bs.transitionProperty.split(",").map((s) => s.trim());
    const durs = P.msList(bs.transitionDuration);
    const shadowIdx = props.findIndex((p) => p === "box-shadow" || p === "all");

    return {
      scrollableSurfaceFound: found,
      scrollableSurface: surface,
      documentHeightPx: docHeightPx,
      bodyScrolledAtTop: flagAtTop,
      bodyScrolledAt8: flagAt8,
      bodyScrolledAt40: flagAt40,
      shadowToggleThresholdRespected: flagAtTop === false && flagAt8 === false && flagAt40 === true,
      topbarInsetCountAtTop: insets(atTop),
      topbarInsetCountScrolled: insets(scrolled),
      topbarOuterShadowCountAtTop: outer(atTop),
      topbarOuterShadowCountScrolled: outer(scrolled),
      topbarShadowAppearsOnScroll: outer(scrolled) > outer(atTop),
      shadowRestoredOnReturn: back === atTop,
      topbarTransitionProperties: props,
      topbarBoxShadowTransitionMs: shadowIdx === -1 ? null : (durs[shadowIdx] ?? durs[0] ?? null),
      topbarBlurPx: (() => {
        const bf = bs.backdropFilter || "";
        const m = bf.match(/blur\(([\d.]+)px\)/);
        return m ? parseFloat(m[1]) : null;
      })()
    };
  }, T.sel);
}

/* Pane switch must be a 3px settle, never an 8px view jump. */
export async function paneSettle(page, T) {
  return page.evaluate(async ({ S, K }) => {
    const P = window.__P;
    const tabs = P.all(S.navTab);
    const other = tabs.find((t) => !t.classList.contains(S.navTabActiveClass)) || tabs[1];
    other.click();
    const pane = await P.until(() => P.el(S.paneShown), 1500);
    const samples = await P.sample(() => {
      const t = getComputedStyle(pane).transform;
      return P.matrix(t).ty;
    }, 160);
    const maxTy = Math.max(...samples.map((s) => Math.abs(s.v || 0)));
    const st = getComputedStyle(pane);
    const kf = P.keyframes(K.paneEntry);
    return {
      paneEntryAnimationName: st.animationName,
      paneEntryDurationMs: P.ms(st.animationDuration),
      paneSettleTravelPx: P.r2(maxTy),
      paneEntryKeyframeFrom: kf ? (kf.find((k) => k.key === "from" || k.key === "0%") || {}).css || null : null
    };
  }, { S: T.sel, K: T.keyframes });
}
