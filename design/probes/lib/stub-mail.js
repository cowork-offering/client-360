/* PROBE HARNESS ONLY. THE ACTIVITY-MAIL STAND-IN.

   A SEPARATE FILE, for the same reason stub-hygiene.js is one: the other
   shots' stub is not this build's to move. This one supplies the two doors the
   activity-mail drive needs and nothing else. It is never bundled - the
   artifact's own build fails closed on simulation markers, and the app itself
   still refuses to simulate.

   1. window.claude.mcp        outlook_email_search answers ONE message from
                               James Hartwell; every other read THROWS, which is
                               the sweep's own partial path, so the book keeps
                               its facilities and the row's ask is derived
                               against the same read the room stands on. Nothing
                               here may reach a write path.
   2. window.claude.use("sample")  a session door answering in the v2 grammar,
                               so the greeting the room composes with the
                               message on its envelope actually renders. */
(function () {
  var MAIL = {
    id: "AAMkADQ2-HARTWELL-LOC-0001",
    subject: "Hartwell line increase before quarter end",
    sender: "james@hartwellprecision.com",
    receivedDateTime: "2026-09-02T08:14:00Z",
    sentDateTime: "2026-09-02T08:14:00Z",
    summary:
      "Could we increase the line of credit from 15Mio to 20Mio before quarter end? The Kokomo plant expansion is running ahead of plan and we would rather not draw the seasonal line to cover the steel order. Happy to send the updated inventory schedule if that helps the file.",
    webLink: "https://outlook.office.com/mail/AAMkADQ2-HARTWELL-LOC-0001",
    internetMessageId: "<AAMkADQ2-HARTWELL-LOC-0001@hartwellprecision.com>",
  };

  window.__DRIVE_OUT = { prompts: [], errors: [] };
  window.addEventListener("error", function (e) {
    window.__DRIVE_OUT.errors.push(String((e && e.message) || e));
  });
  window.addEventListener("unhandledrejection", function (e) {
    window.__DRIVE_OUT.errors.push("unhandled: " + String((e && e.reason && e.reason.message) || (e && e.reason)));
  });

  function answerFor(prompt) {
    var env = null;
    var i = prompt.lastIndexOf("\nCONTEXT:\n");
    if (i >= 0) {
      try {
        env = JSON.parse(prompt.slice(i + 10));
      } catch (e) {
        env = null;
      }
    }
    if (/The room has just OPENED/.test(prompt)) {
      var mail = env && env.mail;
      var reads = (env && env.reads) || {};
      var covs = (reads.covenants || []).slice(0, 2);
      var rows = covs.map(function (c) {
        return "- **" + (c.name || c.label || "Covenant") + "**: worth a look before anything moves.";
      });
      if (mail) {
        return [
          "Hartwell's package is clean and compliant; one client message is open.",
        ]
          .concat(rows)
          .concat([
            (mail.from || "The client") +
              " asked on " +
              (mail.received || "the date on the note") +
              " to take the line of credit to " +
              ((mail.asked && mail.asked.to) || "a larger commitment") +
              ". That reads as a modification. Open it, or renew or structure something new instead?",
          ])
          .join("\n");
      }
      return ["Hartwell's package sits clean across six facilities, nothing staged yet."]
        .concat(rows)
        .concat(["Modify, renew, or structure something new?"])
        .join("\n");
    }
    return "The pledged pool does not move with the commitment, so the cover behind this facility thins as it grows.";
  }

  window.claude = {
    mcp: {
      callTool: function (server, tool) {
        if (/^(stage_|execute_)/.test(tool || "")) throw new Error("the activity-mail drive never writes");
        if (tool === "outlook_email_search") return Promise.resolve({ payload: MAIL });
        return Promise.reject(new Error("no " + tool + " in this view"));
      },
      watchTool: function () {
        return function () {};
      },
      listTools: function () {
        return Promise.resolve([]);
      },
      invalidate: function () {},
    },
    use: function (name) {
      if (name !== "sample") return Promise.resolve(null);
      return Promise.resolve(function (input, options) {
        window.__DRIVE_OUT.prompts.push(input);
        var text = answerFor(input);
        var onText = options && options.onText;
        return new Promise(function (resolve) {
          if (onText) setTimeout(function () { onText({ text: text, delta: text }); }, 140);
          setTimeout(function () { resolve({ text: text, truncated: false, modelTierApplied: "quick" }); }, 260);
        });
      });
    },
  };
})();
