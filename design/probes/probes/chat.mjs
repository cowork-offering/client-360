/* HANDOVER §3 — Chat. The FAB yields entirely (opacity 0, scale .6), the panel
   takes the FAB's spot, minimize folds into the "Assist" pill in that same spot,
   close brings the FAB back. */

export async function chat(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    const wrap = P.el(S.fabWrap);
    const fabSpot = P.rect(wrap);

    // open the assist from the arc's chat satellite
    P.el(S.fab).click();
    await P.sleep(600);
    const chatBtn = P.el(S.arcChat) || P.all(S.arcButton)[0];
    chatBtn.click();
    await P.sleep(700);

    const ws = getComputedStyle(wrap);
    const panel = P.el(S.chatPanel);
    const ps = getComputedStyle(panel);
    const pr = P.rect(panel);

    const out = {
      chatOpens: panel.classList.contains(S.chatShowClass),
      fabTuckedOnChat: wrap.classList.contains(S.fabTuckedClass),
      fabOpacityOnChatPct: P.r2(parseFloat(ws.opacity) * 100),
      fabScaleOnChat: P.matrix(ws.transform).scale,
      fabPointerEventsOnChat: ws.pointerEvents,
      chatPanelRightPx: pr ? P.r2(window.innerWidth - pr.x - pr.w) : null,
      chatPanelBottomPx: pr ? P.r2(window.innerHeight - pr.y - pr.h) : null,
      chatPanelAtFabRightDeltaPx: pr && fabSpot ? P.r2(Math.abs((window.innerWidth - pr.x - pr.w) - (window.innerWidth - fabSpot.x - fabSpot.w))) : null,
      chatPanelAtFabBottomDeltaPx: pr && fabSpot ? P.r2(Math.abs((window.innerHeight - pr.y - pr.h) - (window.innerHeight - fabSpot.y - fabSpot.h))) : null,
      chatPanelEntryAnimationName: ps.animationName,
      chatPanelEntryDurationMs: P.ms(ps.animationDuration)
    };

    // minimize: the panel folds into the pill, which holds the same spot
    P.el(S.chatMinimize).click();
    await P.sleep(600);
    const pill = P.el(S.chatMiniPill);
    const mr = P.rect(pill);
    out.minimizeShowsPill = pill.classList.contains(S.chatShowClass);
    out.minimizeHidesPanel = !panel.classList.contains(S.chatShowClass);
    out.pillRightPx = mr ? P.r2(window.innerWidth - mr.x - mr.w) : null;
    out.pillBottomPx = mr ? P.r2(window.innerHeight - mr.y - mr.h) : null;
    out.pillHoldsFabSpotDeltaPx = mr && fabSpot
      ? P.r2(Math.abs((window.innerWidth - mr.x - mr.w) - (window.innerWidth - fabSpot.x - fabSpot.w)) +
             Math.abs((window.innerHeight - mr.y - mr.h) - (window.innerHeight - fabSpot.y - fabSpot.h)))
      : null;
    out.pillText = pill.textContent.trim();
    out.fabStillTuckedWhileMinimized = wrap.classList.contains(S.fabTuckedClass);

    // restore, then close: the FAB comes back
    pill.click();
    await P.sleep(500);
    out.pillRestoresPanel = panel.classList.contains(S.chatShowClass);
    P.el(S.chatClose).click();
    await P.sleep(700);
    const ws2 = getComputedStyle(wrap);
    out.closeReturnsFab = !wrap.classList.contains(S.fabTuckedClass);
    out.fabOpacityAfterClosePct = P.r2(parseFloat(ws2.opacity) * 100);
    out.fabScaleAfterClose = P.matrix(ws2.transform).scale;
    out.chatClosed = !panel.classList.contains(S.chatShowClass);
    return out;
  }, T.sel);
}

/* The empty-state watermark breathes .04 -> .08 over 8s. */
export async function emptyStateWatermark(page, T) {
  return page.evaluate(({ S, K }) => {
    const P = window.__P;
    const wm = P.el(S.emptyWatermark);
    if (!wm) return { emptyWatermarkFound: false };
    const s = getComputedStyle(wm);
    return {
      emptyWatermarkFound: true,
      emptyWatermarkAnimationName: s.animationName,
      emptyWatermarkDurationMs: P.ms(s.animationDuration),
      emptyWatermarkIterationCount: s.animationIterationCount,
      emptyWatermarkKeyframes: (P.keyframes(K.watermarkBreathe) || []).map((k) => k.key + "{" + k.css + "}").join(" ")
    };
  }, { S: T.sel, K: T.keyframes });
}
