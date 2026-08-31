/* HANDOVER §3 — cmdk. The lens (blur/saturate/scale on topbar + active view),
   the backdrop dim, live filter, keyboard traversal, Escape. */

export async function lens(page, T) {
  return page.evaluate(async (args) => {
    const { S, TX } = args;
    const P = window.__P;
    const bar = P.el(S.topbar);
    const view = document.querySelector(S.viewAccount + "." + S.viewShowClass)
      || document.querySelector(S.viewHome + "." + S.viewShowClass);
    const fabwrap = P.el(S.fabWrap);
    const wrap = P.el(S.cmdkWrap);

    const restFilter = getComputedStyle(bar).filter;

    P.el(S.cmdkOpenButton).click();
    await P.sleep(700);

    const parse = (f) => {
      const b = (f || "").match(/blur\(([\d.]+)px\)/);
      const s = (f || "").match(/saturate\(([\d.]+)\)/);
      return { blurPx: b ? parseFloat(b[1]) : null, saturate: s ? parseFloat(s[1]) : null };
    };
    const bs = getComputedStyle(bar), vs = view ? getComputedStyle(view) : null;
    const barF = parse(bs.filter), viewF = vs ? parse(vs.filter) : {};
    const fabF = parse(getComputedStyle(fabwrap).filter);

    const out = {
      bodyLensed: document.body.classList.contains(S.lensedBodyClass),
      cmdkShown: wrap.classList.contains(S.cmdkShowClass),
      lensTopbarBlurPx: barF.blurPx,
      lensTopbarSaturate: barF.saturate,
      lensTopbarScale: P.matrix(bs.transform).scale,
      lensViewBlurPx: viewF.blurPx,
      lensViewSaturate: viewF.saturate,
      lensViewScale: vs ? P.matrix(vs.transform).scale : null,
      lensFabBlurPx: fabF.blurPx,
      backdropDimColor: getComputedStyle(wrap).backgroundColor,
      lensTransitionMs: P.ms(bs.transitionDuration)
    };

    // live filter -> "Nothing matches." row
    const input = P.el(S.cmdkInput);
    input.value = "zzzzqqq";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await P.sleep(200);
    const nores = P.el(S.cmdkNoResults);
    out.filterHidesAllRows = P.all(S.cmdkRow).every((r) => r.classList.contains(S.cmdkRowHiddenClass));
    out.noMatchRowShown = nores.classList.contains(S.cmdkNoResultsOnClass);
    out.noMatchRowText = nores.textContent.trim();
    out.noMatchRowTextStartsAsExpected = nores.textContent.trim().indexOf(TX.cmdkNoMatch) === 0;

    // narrow to a real hit, then traverse with the keyboard
    input.value = "worklist";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await P.sleep(200);
    const visible = P.all(S.cmdkRow).filter((r) => !r.classList.contains(S.cmdkRowHiddenClass));
    out.filterVisibleRowCount = visible.length;
    out.filterVisibleRowText = visible.map((r) => r.textContent.trim().replace(/\s+/g, " "));

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await P.sleep(200);
    const rows = P.all(S.cmdkRow).filter((r) => !r.classList.contains(S.cmdkRowHiddenClass));
    const selIndex = () => rows.findIndex((r) => r.classList.contains(S.cmdkRowSelectedClass));
    const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

    const start = selIndex();
    key("ArrowDown"); await P.sleep(80);
    const afterDown = selIndex();
    key("ArrowDown"); await P.sleep(80);
    const afterDown2 = selIndex();
    key("ArrowUp"); await P.sleep(80);
    const afterUp = selIndex();

    out.cmdkRowCount = rows.length;
    out.cmdkSelectionStartIndex = start;
    out.cmdkSelectionAfterArrowDownIndex = afterDown;
    out.cmdkSelectionAfterTwoDownIndex = afterDown2;
    out.cmdkSelectionAfterArrowUpIndex = afterUp;
    out.cmdkArrowsTraverseVisibleRows = afterDown === start + 1 && afterUp === afterDown2 - 1;

    // Escape snaps the world back
    key("Escape");
    await P.sleep(700);
    out.escapeClearsLens = !document.body.classList.contains(S.lensedBodyClass);
    out.topbarFilterRestored = getComputedStyle(bar).filter === restFilter;
    out.topbarFilterAtRest = restFilter;
    out.cmdkHiddenAfterEscape = !wrap.classList.contains(S.cmdkShowClass);
    return out;
  }, { S: T.sel, TX: T.text });
}

/* Enter fires the selected row. */
export async function enterFires(page, T) {
  return page.evaluate(async (args) => {
    const { S, TX } = args;
    const P = window.__P;
    P.el(S.cmdkOpenButton).click();
    await P.sleep(600);
    const input = P.el(S.cmdkInput);
    input.value = TX.cmdkBackToWorklist;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await P.sleep(200);
    const rows = P.all(S.cmdkRow).filter((r) => !r.classList.contains(S.cmdkRowHiddenClass));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await P.sleep(80);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await P.sleep(900);
    return {
      enterCandidateRowCount: rows.length,
      enterNavigatedHome: P.el(S.viewHome).classList.contains(S.viewShowClass),
      enterClosedPalette: !P.el(S.cmdkWrap).classList.contains(S.cmdkShowClass)
    };
  }, { S: T.sel, TX: T.text });
}
