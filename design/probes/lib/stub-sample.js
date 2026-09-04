/* PROBE HARNESS ONLY: A STAND-IN SESSION DOOR.

   The memo room's draft and steer run on `claude.use("sample")`. Without a door
   the room says so and writes nothing, which is the channel-none doctrine and is
   right; but "the room while it drafts" is the scene the founder feels the
   latency in, so the harness supplies a narrator of its own, from OUTSIDE the
   app, exactly the way `stub-connector.js` supplies an org.

   IT STREAMS LIKE A MODEL, IN BURSTS. A narrator that resolved in one lump
   would never exercise the stream pacer, which is half of what the memo scene
   is measuring. Nothing here ships: this file is never bundled. */
(function () {
  var LOREM = ("The borrower's leverage stands inside policy and the coverage "
    + "cushion is intact at the tested quarter. Working capital is seasonal and "
    + "the revolver carries it; the term facility amortises on schedule. "
    + "Collateral is the plant and equipment, valued within the year, and the "
    + "advance rate is unchanged from the last review.").split(/(\s+)/);

  function sample(input, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var i = 0;
      var text = "";
      var cancelled = false;
      if (options.signal) {
        options.signal.addEventListener("abort", function () {
          cancelled = true;
          reject({ code: "aborted", message: "probe narrator aborted", text: text });
        });
      }
      // Four tokens every 40ms: a model's own cadence, not a firehose.
      (function burst() {
        if (cancelled) return;
        if (i >= LOREM.length) {
          resolve({ text: text, truncated: false, modelTierApplied: options.modelTier || "default" });
          return;
        }
        var before = text;
        for (var n = 0; n < 8 && i < LOREM.length; n++, i++) text += LOREM[i];
        if (options.onText) options.onText({ text: text, delta: text.slice(before.length) });
        setTimeout(burst, 40);
      })();
    });
  }
  sample.json = function () { return Promise.resolve({}); };

  window.claude = window.claude || {};
  var prior = window.claude.use;
  window.claude.use = function (name) {
    if (name === "sample") return Promise.resolve(sample);
    if (typeof prior === "function") return prior.call(window.claude, name);
    return Promise.resolve(null);
  };
})();
