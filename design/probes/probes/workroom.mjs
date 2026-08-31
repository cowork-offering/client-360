/* HANDOVER §3 — The workroom: seed, thread geometry, word stream, odometer,
   the execute halo (§4 trap 3: the box never rotates) and the write-back. */

/* Summon the room from the arc button and capture the glass seed. */
export async function openRoom(page, T) {
  return page.evaluate(async (S) => {
    const P = window.__P;
    const seen = [];
    const obs = new MutationObserver((recs) => {
      recs.forEach((r) => Array.prototype.slice.call(r.addedNodes).forEach((n) => {
        if (n.nodeType !== 1 || !n.matches || !n.matches(S.workroomSeed)) return;
        const cs = getComputedStyle(n);
        const rr = n.getBoundingClientRect();
        seen.push({
          widthPx: P.px(cs.width),
          heightPx: P.px(cs.height),
          backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || "none",
          borderRadius: cs.borderRadius,
          background: cs.backgroundColor,
          cx: P.r2(rr.left + rr.width / 2),
          cy: P.r2(rr.top + rr.height / 2)
        });
      }));
    });
    obs.observe(document.body, { childList: true });

    P.el(S.fab).click();
    await P.sleep(600);
    const btn = P.el(S.arcModify);
    const br = P.rect(btn);
    btn.click();
    await P.sleep(700);
    obs.disconnect();

    const room = P.el(S.workroom);
    const opened = await P.until(() => room.classList.contains(S.workroomShowClass), 3000, 40);
    await P.sleep(200);

    const seed = seen[0] || null;
    const thread = P.el(S.workroomThread);
    const ts = thread ? getComputedStyle(thread) : null;

    return {
      seedAppeared: !!seed,
      seedWidthPx: seed ? seed.widthPx : null,
      seedHeightPx: seed ? seed.heightPx : null,
      seedBackdropFilter: seed ? seed.backdropFilter : null,
      seedHasNoBackdropFilter: seed ? (seed.backdropFilter === "none" || !seed.backdropFilter) : null,
      seedOriginDeltaXPx: seed ? P.r2(Math.abs(seed.cx - br.cx)) : null,
      seedOriginDeltaYPx: seed ? P.r2(Math.abs(seed.cy - br.cy)) : null,
      roomOpened: !!opened,
      threadGapPx: ts ? P.px(ts.rowGap) : null,
      scrimShown: P.el(S.workroomScrim).classList.contains(S.workroomShowClass)
    };
  }, T.sel);
}

/* Drive the guided ritual up to (but not through) the execute press. */
export async function ritual(page, T) {
  return page.evaluate(async (args) => {
    const { S, TX } = args;
    const P = window.__P;
    const out = {};

    // 1. the agent greets, then looks up packages behind a shimmer chip
    const pkg = await P.until(() => P.el(S.workroomPackageButton), 8000, 60);
    out.packageChoiceAppeared = !!pkg;

    // agent messages stream word by word
    const firstAgent = P.el(S.workroomAgentMessage);
    const words = firstAgent ? Array.prototype.slice.call(firstAgent.querySelectorAll(S.workroomWord)) : [];
    const wordDelays = words.map((w) => P.ms(getComputedStyle(w).animationDelay));
    out.agentWordSpanCount = words.length;
    out.agentWordStaggerMs = wordDelays.length > 2 ? P.r2(wordDelays[2] - wordDelays[1]) : null;
    out.agentWordAnimationName = words.length ? getComputedStyle(words[0]).animationName : null;
    out.agentWordAnimationDurationMs = words.length ? P.ms(getComputedStyle(words[0]).animationDuration) : null;

    // identity chip sits above the bubble and never touches it
    const msg = P.el(S.workroomMessage);
    const before = msg ? getComputedStyle(msg, "::before") : null;
    out.identityChipOffsetPx = before ? P.px(before.top) : null;
    out.identityChipContent = before ? before.content : null;

    pkg.click();

    // 2. the package briefing, then the facility list
    const fac = await P.until(() => P.el(S.workroomFacility), 8000, 60);
    out.facilityListAppeared = !!fac;
    out.facilityCount = P.all(S.workroomFacility).length;

    // step gap only exists once there are at least two steps
    const step = P.el(S.workroomStep);
    out.stepGapPx = step ? P.px(getComputedStyle(step).rowGap) : null;
    out.stepCount = P.all(S.workroomStep).length;

    fac.click();
    await P.sleep(400);

    // 3a. the suggestion chip — recorded as the dummy behaves, not as prose
    //     assumes. (In the frozen dummy the "keep pricing" tail routes this line
    //     to the clarify branch, so it files nothing.)
    const chip = await P.until(() => P.el(S.workroomSuggestIncrease), 4000, 60);
    out.suggestChipFound = !!chip;
    out.suggestChipText = chip ? chip.getAttribute("data-say") : null;
    out.suggestChipVisibleAfterFacilitySelect = chip ? getComputedStyle(chip).display !== "none" : null;
    if (chip) {
      chip.click();
      await P.until(() => P.el(S.workroomDelta), 4000, 60);
      out.suggestChipProducesDeltaCard = !!P.el(S.workroomDelta);
    }

    // 3b. say what changes, in the banker's own words
    const input = P.el(S.workroomInput);
    out.composeInputEnabledAfterFacilitySelect = input ? !input.disabled : null;
    input.value = TX.workroomIncreaseLine;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    P.el(S.workroomSend).click();

    // 4. the delta card lands with Confirm / Discard
    const delta = await P.until(() => P.el(S.workroomDelta), 8000, 60);
    out.deltaCardAppeared = !!delta;
    out.deltaCardText = delta ? delta.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : null;
    const buttons = Array.prototype.slice.call(delta.querySelectorAll("button"));
    const confirm = buttons.find((b) => b.textContent.trim() === TX.workroomConfirm) || buttons[0];
    confirm.click();
    await P.sleep(200);

    // the proposed value rolls in the right lane, with a "was" note
    out.detailLaneOdoColumnCount = P.all(S.workroomDetail + " " + S.odoColumn).length;
    out.detailLaneWasNoteCount = P.all(S.workroomDetail + " " + S.workroomWas).length;
    out.manifestEntryCount = P.all(S.workroomManifestEntry).length;

    // 5. review & execute
    const propose = await P.until(() => P.el(S.workroomProposeButton), 6000, 60);
    out.proposeButtonAppeared = !!propose;
    propose.click();
    const flow = await P.until(() => P.el(S.workroomFlowCard), 6000, 60);
    out.flowCardAppeared = !!flow;

    // pre-write values that the write-back must move
    out.preExposureAnchorText = (P.el(S.anchorExposureValue) || {}).textContent || null;
    out.preWorklistAmountText = (P.el(S.worklistHartwellAmount) || {}).textContent || null;
    out.preExposureTotalText = (P.el(S.exposureTableTotal) || {}).textContent || null;
    return out;
  }, { S: T.sel, TX: T.text });
}

/* Press execute, then watch the halo and the odometer through the whole ritual. */
export async function execute(page, T) {
  return page.evaluate(async (args) => {
    const { S, TX, K } = args;
    const P = window.__P;
    const out = {};

    const flow = P.el(S.workroomFlowCard);
    const btns = Array.prototype.slice.call(flow.querySelectorAll("button"));
    const exec = btns.find((b) => b.textContent.trim() === TX.workroomExecute) || btns[btns.length - 1];

    const pre = {
      anchor: (P.el(S.anchorExposureValue) || {}).textContent,
      worklist: (P.el(S.worklistHartwellAmount) || {}).textContent,
      total: (P.el(S.exposureTableTotal) || {}).textContent
    };
    exec.click();

    // --- the halo: the gradient ANGLE turns, the box must never rotate ---
    await P.sleep(300);
    const aura = P.el(S.workroomFlowLoad + " " + S.workroomAura) || P.el(S.workroomAura);
    let halo = { auraFound: false };
    if (aura) {
      const a0 = getComputedStyle(aura);
      const t0 = a0.transform;
      const ang0 = a0.getPropertyValue("--aang").trim();
      const box0 = P.rect(aura);
      await P.sleep(900);
      const a1 = getComputedStyle(aura);
      const t1 = a1.transform;
      const ang1 = a1.getPropertyValue("--aang").trim();
      const box1 = P.rect(aura);
      halo = {
        auraFound: true,
        haloTransformStart: t0,
        haloTransformEnd: t1,
        haloBoxRotationDeg: P.matrix(t1).rotateDeg,
        haloBoxTransformIsStatic: t0 === t1 && (t0 === "none" || P.matrix(t0).rotateDeg === 0),
        haloBoxSizeStablePx: box0 && box1 ? P.r2(Math.abs(box0.w - box1.w) + Math.abs(box0.h - box1.h)) : null,
        haloAngleAnimates: !!(ang0 && ang1 && ang0 !== ang1),
        haloAngleAdvancedDeg: (ang0 && ang1) ? P.r2(parseFloat(ang1) - parseFloat(ang0)) : null,
        haloAnimationName: a1.animationName,
        haloAnimationDurationMs: P.ms(a1.animationDuration),
        haloAnimationTimingFunction: a1.animationTimingFunction,
        haloOpacityPct: P.r2(parseFloat(a1.opacity) * 100),
        haloBlurPx: (() => { const m = (a1.filter || "").match(/blur\(([\d.]+)px\)/); return m ? parseFloat(m[1]) : null; })(),
        haloFadeTransitionMs: P.ms(a1.transitionDuration),
        haloRotateKeyframes: (P.keyframes(K.auraRotate) || []).map((k) => k.key + "{" + k.css + "}").join(" ")
      };
    }
    Object.assign(out, halo);

    // --- the write-back: odometer columns while the room is still open ---
    let maxOdo = 0, odoSample = null, roomOpenAtRoll = null;
    const t0 = performance.now();
    while (performance.now() - t0 < 7000) {
      const cols = P.all(S.odoColumn);
      if (cols.length > maxOdo) {
        maxOdo = cols.length;
        const strip = cols[0].querySelector(".strip") || cols[0].firstElementChild;
        const ss = strip ? getComputedStyle(strip) : null;
        const delays = cols.map((c) => {
          const st = c.querySelector(".strip") || c.firstElementChild;
          return st ? P.ms(getComputedStyle(st).transitionDelay) : null;
        });
        const uniq = Array.from(new Set(delays.filter((d) => d != null))).sort((a, b) => a - b);
        odoSample = {
          odoStripTransitionMs: ss ? P.ms(ss.transitionDuration) : null,
          odoStripTimingFunction: ss ? ss.transitionTimingFunction : null,
          odoColumnDelaysMs: uniq,
          odoColumnStaggerMs: uniq.length > 1 ? P.r2(uniq[1] - uniq[0]) : null,
          odoBlurKeyframes: (P.keyframes(K.odoBlur) || []).map((k) => k.key + "{" + k.css + "}").join(" ")
        };
        /* the roll class lands a frame after the columns do; read the blur
           animation once it is actually on, never at insertion time */
        await P.sleep(140);
        const live = P.all(S.odoColumn)[0];
        odoSample.odoBlurAnimationName = live ? getComputedStyle(live).animationName : null;
        roomOpenAtRoll = P.el(S.workroom).classList.contains(S.workroomShowClass);
      }
      if (maxOdo && !P.all(S.odoColumn).length) break;
      await P.sleep(25);
    }
    out.writeBackOdoColumnCount = maxOdo;
    out.writeBackRolledWhileRoomOpen = roomOpenAtRoll;
    Object.assign(out, odoSample || {});

    // --- the dossier card constructs itself ---
    const card = await P.until(() => P.el(S.workroomResultCard), 4000, 60);
    out.resultCardAppeared = !!card;
    if (card) {
      const segs = Array.prototype.slice.call(card.querySelectorAll(".rc-h,.rc-line,.rc-r,.rc-f"));
      out.resultCardSegmentCount = segs.length;
      out.resultCardSegmentDelaysMs = segs.map((s) => P.ms(getComputedStyle(s).animationDelay));
      out.resultCardRowStepMs = (() => {
        const rows = Array.prototype.slice.call(card.querySelectorAll(".rc-r"))
          .map((s) => P.ms(getComputedStyle(s).animationDelay));
        return rows.length > 1 ? P.r2(rows[1] - rows[0]) : null;
      })();
      out.resultCardCheckAnimationName = (() => {
        const ok = card.querySelector(".ok");
        return ok ? getComputedStyle(ok).animationName : null;
      })();
      out.resultCardLit = card.classList.contains(S.workroomAuraLitClass);
    }

    await P.sleep(600);
    out.postExposureAnchorText = (P.el(S.anchorExposureValue) || {}).textContent;
    out.postWorklistAmountText = (P.el(S.worklistHartwellAmount) || {}).textContent;
    out.postExposureTotalText = (P.el(S.exposureTableTotal) || {}).textContent;
    out.writeBackChangedAllThree =
      out.postExposureAnchorText !== pre.anchor &&
      out.postWorklistAmountText !== pre.worklist &&
      out.postExposureTotalText !== pre.total;
    out.roomStillOpenAfterWrite = P.el(S.workroom).classList.contains(S.workroomShowClass);
    return out;
  }, { S: T.sel, TX: T.text, K: T.keyframes });
}

/* Close the room: the glass lifts and the wash settles on what changed. */
export async function closeAndWash(page, T) {
  return page.evaluate(async (args) => {
    const { S, K } = args;
    const P = window.__P;
    P.el(S.workroomClose).click();
    await P.sleep(120);
    const anchor = P.el(S.anchorExposure);
    const washed = anchor ? anchor.classList.contains(S.washedClass) : null;
    const cs = anchor ? getComputedStyle(anchor) : null;
    const out = {
      roomClosed: !P.el(S.workroom).classList.contains(S.workroomShowClass),
      washApplied: washed,
      washAnimationName: cs ? cs.animationName : null,
      washAnimationIsWashKeyframe: cs ? cs.animationName === K.anchorWash : null,
      washDurationMs: cs ? P.ms(cs.animationDuration) : null,
      washKeyframes: (P.keyframes(K.anchorWash) || []).map((k) => k.key + "{" + k.css + "}").join(" "),
      bodyOverflowRestored: getComputedStyle(document.body).overflow !== "hidden"
    };
    await P.sleep(2100);
    out.washClearedAfter = anchor ? !anchor.classList.contains(S.washedClass) : null;
    const valueAfterWash = (P.el(S.anchorExposureValue) || {}).textContent;

    // executed value survives navigation away and back
    P.el(S.goHome).click();
    await P.sleep(700);
    P.el(S.rowHartwell).click();
    await P.sleep(1000);
    out.valueBeforeNavigation = valueAfterWash;
    out.valueAfterNavigation = (P.el(S.anchorExposureValue) || {}).textContent;
    out.executedValueSurvivesNavigation = out.valueBeforeNavigation === out.valueAfterNavigation;
    return out;
  }, { S: T.sel, K: T.keyframes });
}

/* Tabular numerals are required wherever a figure can roll. */
export async function numerals(page, T) {
  return page.evaluate((S) => {
    const P = window.__P;
    const els = [S.anchorExposureValue, S.worklistHartwellAmount, S.exposureTableTotal]
      .map((s) => P.el(s)).filter(Boolean);
    return {
      rollingFigureCount: els.length,
      rollingFiguresTabularNums: els.every((e) => (getComputedStyle(e).fontVariantNumeric || "").indexOf("tabular-nums") !== -1)
    };
  }, T.sel);
}
