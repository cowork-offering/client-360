/* In-page probe toolkit. Injected before every document load (addInitScript).
   Everything here runs in the browser, in the page's own world, so probes can
   read computed style and sample animation frames without round-tripping. */
(function () {
  "use strict";
  if (window.__P) return;

  function el(x) { return typeof x === "string" ? document.querySelector(x) : x; }

  /* "0.52s" | "520ms" | "0s" -> 520 | 0 (ms) */
  function ms(v) {
    if (v == null) return null;
    v = String(v).trim().split(",")[0].trim();
    if (!v) return null;
    if (/ms$/.test(v)) return parseFloat(v);
    if (/s$/.test(v)) return Math.round(parseFloat(v) * 1000 * 1000) / 1000;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function msList(v) {
    if (v == null) return [];
    return String(v).split(",").map(function (p) { return ms(p); });
  }

  function px(v) {
    var n = parseFloat(v);
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  }

  function r2(n) { return n == null ? null : Math.round(n * 100) / 100; }

  function rect(x) {
    var e = el(x);
    if (!e) return null;
    var r = e.getBoundingClientRect();
    return { x: r2(r.left), y: r2(r.top), w: r2(r.width), h: r2(r.height), cx: r2(r.left + r.width / 2), cy: r2(r.top + r.height / 2) };
  }

  /* matrix(a,b,c,d,e,f) / matrix3d(...) -> {tx,ty,scale,rotateDeg} */
  function matrix(t) {
    if (!t || t === "none") return { tx: 0, ty: 0, scale: 1, rotateDeg: 0, none: true };
    var m = t.match(/matrix(3d)?\(([^)]+)\)/);
    if (!m) return { tx: 0, ty: 0, scale: 1, rotateDeg: 0, none: false, raw: t };
    var v = m[2].split(",").map(parseFloat);
    var a, b, tx, ty;
    if (m[1]) { a = v[0]; b = v[1]; tx = v[12]; ty = v[13]; }
    else { a = v[0]; b = v[1]; tx = v[4]; ty = v[5]; }
    var scale = Math.round(Math.sqrt(a * a + b * b) * 10000) / 10000;
    var deg = Math.round(Math.atan2(b, a) * 180 / Math.PI * 100) / 100;
    if (deg < 0) deg += 360;
    return { tx: r2(tx), ty: r2(ty), scale: scale, rotateDeg: deg, none: false };
  }

  /* sample fn() every animation frame for `dur` ms -> [{t, v}] */
  function sample(fn, dur) {
    return new Promise(function (res) {
      var out = [], t0 = performance.now();
      (function step() {
        var t = performance.now() - t0;
        try { out.push({ t: Math.round(t), v: fn() }); } catch (e) { out.push({ t: Math.round(t), v: null }); }
        if (t < dur) requestAnimationFrame(step); else res(out);
      })();
    });
  }

  function sleep(n) { return new Promise(function (r) { setTimeout(r, n); }); }

  /* poll until fn() is truthy (returns the value) or timeout -> null */
  function until(fn, timeout, step) {
    timeout = timeout || 8000; step = step || 50;
    return new Promise(function (res) {
      var t0 = performance.now();
      (function tick() {
        var v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) return res(v);
        if (performance.now() - t0 > timeout) return res(null);
        setTimeout(tick, step);
      })();
    });
  }

  function classOf(e) {
    var c = e.getAttribute && e.getAttribute("class");
    return c == null ? "" : String(c);
  }

  /* The HANDOVER §7 census snippet, widened: class + inset count + blur radius. */
  function census(visibleOnly) {
    return Array.prototype.slice.call(document.querySelectorAll("*")).filter(function (e) {
      var s = getComputedStyle(e);
      var bf = s.backdropFilter || s.webkitBackdropFilter || "";
      if (!bf || bf.indexOf("blur") === -1) return false;
      if (!visibleOnly) return true;
      var r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
    }).map(function (e) {
      var s = getComputedStyle(e);
      var bf = s.backdropFilter || s.webkitBackdropFilter || "";
      var m = bf.match(/blur\(([\d.]+)px\)/);
      var r = e.getBoundingClientRect();
      return {
        cls: classOf(e) || ("#" + (e.id || e.tagName.toLowerCase())),
        tag: e.tagName.toLowerCase(),
        insetCount: (s.boxShadow.match(/inset/g) || []).length,
        blurPx: m ? parseFloat(m[1]) : null,
        onScreen: r.width > 0 && r.height > 0
      };
    });
  }

  /* Read an @keyframes rule out of the CSSOM (same-origin sheets only). */
  function keyframes(name) {
    var out = null;
    Array.prototype.slice.call(document.styleSheets).forEach(function (sh) {
      var rules;
      try { rules = sh.cssRules; } catch (e) { return; }
      if (!rules) return;
      Array.prototype.slice.call(rules).forEach(function (r) {
        if (r.type === 7 /* KEYFRAMES */ && r.name === name) {
          out = Array.prototype.slice.call(r.cssRules).map(function (k) { return { key: k.keyText, css: k.style.cssText }; });
        }
      });
    });
    return out;
  }

  window.__P = {
    el: el, ms: ms, msList: msList, px: px, r2: r2, rect: rect, matrix: matrix,
    sample: sample, sleep: sleep, until: until, census: census, keyframes: keyframes,
    classOf: classOf,
    all: function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  };
})();
