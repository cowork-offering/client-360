/* PROBE HARNESS ONLY — A STAND-IN CONNECTOR.

   THIS IS NOT A SIMULATION MODE. The app refuses to invent a plan: with no
   connector the workroom says so and burns nothing, which is the channel-none
   doctrine and is asserted in the unit suite. But the room's EXECUTE-SIDE
   CHOREOGRAPHY — the structured loader, the halo, the dossier constructing
   itself, and the write-back rolling the cockpit's figures behind the blur —
   only exists on the far side of a successful write, and those are acceptance
   numbers the mint is gated on.

   So the probe supplies an org-shaped `window.claude.mcp` of its own, OUTSIDE
   the app, and only when `--stub-connector` is passed. Nothing here ships: the
   artifact's own build fails closed on simulation markers, and this file is
   never bundled.

   Original note: A stand-in connector so the room's execute path can be
   MEASURED without a live org. It lives in the probe, never in the artifact:
   the app itself refuses to simulate, which is why nothing like this can be
   shipped inside it. */
(function () {
  var ok = function (result) {
    return { payload: { content: [{ isSuccess: true, outputValues: { ok: true, result: result } }] } };
  };
  var HASH = "9c41e08bf27a4d10";
  window.claude = window.claude || {};
  window.claude.mcp = {
    callTool: function (server, tool, input) {
      var one = (((input || {}).inputs || [])[0]) || {};
      if (/^stage_/.test(tool)) {
        return Promise.resolve(ok({
          stagingId: "a5Sbb0000001PROBE",
          planHash: HASH,
          decisionToken: "4f8ac21e-probe-token",
          summary: "Probe plan.",
          steps: [{ id: "w1", type: "write", label: "Apply the commitment", objectName: "LLC_BI__Loan__c" },
                  { id: "v1", type: "verification", label: "Re-query the clone", dependsOn: ["w1"] }],
          warnings: [],
          accountId: one.accountId,
          productPackageId: one.productPackageId,
          facilities: (one.facilities || []).map(function (f, i) {
            return { facilityId: f.facilityId || ("a4Zbb000002" + i), loanId: f.loanId || ("a4Zbb000002" + i), requestedAmount: f.requestedAmount };
          }),
          facilityCount: (one.facilities || []).length
        }));
      }
      if (/^execute_/.test(tool)) {
        /* A real org takes seconds; the loader is a thing the probe has to be
           able to SEE, so the stand-in takes a moment too. */
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(ok({
          stagingId: "a5Sbb0000001PROBE",
          terminalState: "completed",
          outcome: "completed",
          cloneLoanId: "a4Zbb0000027NpMEAU",
          bookingHandoff: "Booking runs through nCino's own Submit for Approval; this does not book the facility.",
          approvalChainStarted: true,
          facilities: (((input || {}).inputs || [])[0].facilities || []).map(function (f, i) {
            return { facilityId: f.facilityId || ("a4Zbb000002" + i), loanId: "a4Zbb0000027NpMEAU", cloneLoanId: "a4Zbb0000027NpMEAU", status: "Qualification" };
          }),
          facilityCount: 1
          })); }, 1800);
        });
      }
      /* THE BRAIN LANE'S OWN DOOR. The room routes a question it cannot answer
         over the artifact<->session bridge, which is the gateway completion
         tool, and hard-validates the reply against the three contract shapes.
         The stand-in answers IN CONTRACT so the lane's rendering can be shot;
         it invents nothing the pack does not already publish as its worked
         example. Same rule as everything else here: probe harness only, never
         bundled, and the app itself still refuses to simulate. */
      if (/get_llm_response/.test(tool)) {
        var prompt = String((input || {}).prompt || "");
        var line = "";
        try { line = (JSON.parse(prompt.slice(prompt.indexOf("{"))) || {}).line || ""; } catch (e) { line = prompt; }
        var reply = /borrower|who|structure|part(y|ies)|guarantor/i.test(line)
          ? {
              type: "read-card",
              topic: "involvements",
              title: "Borrowing structure on the Hartwell package",
              rows: [
                { icon: "borrower", label: "Hartwell Precision Manufacturing LLC", value: "Borrower", sub: "all 6 facilities . Operating Company . 100%" },
                { icon: "guarantor", label: "Hartwell Industrial Holdings LLC", value: "Guarantor", sub: "all 6 . unlimited . EPC" },
                { icon: "guarantor", label: "James Hartwell", value: "Guarantor", sub: "all 6 . unlimited . individual" },
                { icon: "warn", label: "Elena Hartwell", value: "Limited Guarantor", sub: "HW1001 capped $5.0MM . HW1003 capped $4.0MM" },
                { icon: "facility", label: "Hartwell Logistics LLC", value: "Related Entity", sub: "HW1003 construction only" }
              ],
              followUp: "Who should be added, and on which facility?"
            }
          : {
              type: "clarify",
              text: "Which line do you mean? The relationship carries two.",
              options: [
                { label: "Revolving line, $15.0MM", say: "the revolving line of credit" },
                { label: "Seasonal line, $2.5MM", say: "the seasonal line of credit" }
              ]
            };
        return Promise.resolve({ payload: { statusCode: 200, body: JSON.stringify({ response: JSON.stringify(reply) }) } });
      }
      return Promise.resolve(ok({}));
    },
    watchTool: function () { return function () {}; },
    listTools: function () { return Promise.resolve({ servers: [{ server: "Customer 360", authStatus: "connected", tools: [] }] }); },
    invalidate: function () { return Promise.resolve(); }
  };
})();
