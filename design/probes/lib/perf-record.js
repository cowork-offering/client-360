/* THE IN-PAGE FRAME RECORDER, injected before every document load.

   It measures what a viewer on a screen share actually feels: how long each
   frame took, how many the page missed, and how much of the main thread was
   spent in tasks long enough to swallow a click.

   ONE rAF LOOP, ALWAYS RUNNING. Starting a loop when a scene starts would
   measure the loop's own warm-up as jank, and stopping it between scenes would
   let the page settle into a state no viewer ever sees. The loop runs from the
   first frame; a scene simply marks where in the tape it began.

   NOTHING HERE TOUCHES THE APP. No styles are read, no elements are queried,
   no layout is forced: a recorder that read geometry every frame would be
   measuring itself. */
(function () {
  "use strict";
  if (window.__PERF) return;

  var IDEAL_MS = 1000 / 60;

  var deltas = [];   // { t, d }: page time and the frame's duration
  var longs = [];    // { t, d }: longtask start and duration
  var last = null;

  function frame(ts) {
    if (last !== null) deltas.push({ t: ts, d: ts - last });
    last = ts;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) { longs.push({ t: e.startTime, d: e.duration }); });
    }).observe({ entryTypes: ["longtask"] });
  } catch (e) {
    // A browser with no longtask observer still reports frame times.
  }

  function pct(sorted, p) {
    if (!sorted.length) return null;
    var i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Math.round(sorted[i] * 100) / 100;
  }

  /** Frames the page owed the compositor and did not deliver. A 50ms frame at
   *  60Hz is two missed vsyncs, not one slow one. */
  function droppedIn(window_) {
    var n = 0;
    for (var i = 0; i < window_.length; i++) n += Math.max(0, Math.round(window_[i] / IDEAL_MS) - 1);
    return n;
  }

  window.__PERF = {
    /** Mark the start of a scene. Returns the token to close it with. */
    mark: function () { return { at: performance.now(), frames: deltas.length, tasks: longs.length }; },

    /** Everything that happened since `token`, as one row. */
    since: function (token) {
      var wallMs = performance.now() - token.at;
      var ds = deltas.slice(token.frames).map(function (x) { return x.d; });
      var ls = longs.slice(token.tasks);
      var sorted = ds.slice().sort(function (a, b) { return a - b; });
      var totalLong = ls.reduce(function (a, x) { return a + x.d; }, 0);
      return {
        wallMs: Math.round(wallMs),
        frames: ds.length,
        fps: ds.length ? Math.round((ds.length / (wallMs / 1000)) * 10) / 10 : 0,
        frameMsP50: pct(sorted, 50),
        frameMsP95: pct(sorted, 95),
        frameMsMax: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : null,
        droppedFrames: droppedIn(ds),
        longTasks: ls.length,
        longTaskMsTotal: Math.round(totalLong),
        longTaskMsMax: ls.length ? Math.round(Math.max.apply(null, ls.map(function (x) { return x.d; }))) : 0
      };
    },

    /** What the page decided about its own material, read off <html>. */
    glass: function () {
      var c = document.documentElement.className || "";
      return {
        htmlClass: c,
        mode: c.indexOf("eg-calm") >= 0 ? "calm"
          : c.indexOf("eg-refract") < 0 ? "frost"
            : c.indexOf("eg-liquid") >= 0 ? "liquid" : "subtle"
      };
    },

    /** Every element the compositor has to blur a backdrop for, right now. */
    glassSurfaces: function () {
      return Array.prototype.slice.call(document.querySelectorAll("*")).filter(function (e) {
        var s = getComputedStyle(e);
        var bf = s.backdropFilter || s.webkitBackdropFilter || "";
        if (!bf || bf.indexOf("blur") === -1) return false;
        var r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
      }).length;
    },

    /** Every animation the document is currently running, and how many of them
     *  never end. An infinite animation on screen is a standing repaint. */
    animations: function () {
      var all;
      try { all = document.getAnimations(); } catch (e) { return { running: null, infinite: null }; }
      var running = 0, infinite = 0;
      all.forEach(function (a) {
        if (a.playState !== "running") return;
        running += 1;
        var it = a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : null;
        if (it === Infinity) infinite += 1;
      });
      return { running: running, infinite: infinite };
    }
  };
})();
