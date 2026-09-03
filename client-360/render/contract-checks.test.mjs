#!/usr/bin/env node
// Minimal unit tests for contract-checks.mjs (A7). Run with: node --test render/contract-checks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ContractError,
  assertBorrowersStructure,
  assertGeneratedAt,
  assertUserId,
  assertWorklistReasons,
  PERMITTED_REASON_CODES,
  assertActivity,
  assertRequests,
  PERMITTED_ACTIVITY_KINDS,
  PERMITTED_ACTION_IDS,
  computeCoverage,
  deriveAnchorBorrower,
  assertValidationSurfaces,
} from "./contract-checks.mjs";
import { validateC360 } from "./validate-c360.mjs";

const bundle = (id, extra) => ({ snapshot: { accountId: id }, ...extra });

// ---------------------------------------------------------------- assertBorrowersStructure (A6)
test("assertBorrowersStructure passes on a valid map", () => {
  const data = { meta: { anchorAccountId: "A1" }, borrowers: { A1: bundle("A1") } };
  assert.doesNotThrow(() => assertBorrowersStructure(data));
});

test("assertBorrowersStructure rejects an array", () => {
  const data = { meta: { anchorAccountId: "A1" }, borrowers: [bundle("A1")] };
  assert.throws(() => assertBorrowersStructure(data), ContractError);
});

test("assertBorrowersStructure rejects null/missing borrowers", () => {
  const data = { meta: { anchorAccountId: "A1" } };
  assert.throws(() => assertBorrowersStructure(data), ContractError);
});

test("assertBorrowersStructure requires an own anchor entry (not just any entry)", () => {
  const data = { meta: { anchorAccountId: "A1" }, borrowers: { A2: bundle("A2") } };
  assert.throws(() => assertBorrowersStructure(data), /anchor/i);
});

test("assertBorrowersStructure requires snapshot.accountId to match its own map key", () => {
  const data = { meta: { anchorAccountId: "A1" }, borrowers: { A1: bundle("WRONG_ID") } };
  assert.throws(() => assertBorrowersStructure(data), /does not match/);
});

// ---------------------------------------------------------------- assertGeneratedAt (A10 / Codex R2 #3)
test("assertGeneratedAt accepts a valid ISO instant", () => {
  assert.doesNotThrow(() => assertGeneratedAt({ meta: { generatedAt: "2026-07-02T09:15:00Z" } }));
  assert.doesNotThrow(() => assertGeneratedAt({ meta: { generatedAt: "2026-07-02T09:15:00.123+02:00" } }));
});

test("assertGeneratedAt rejects a missing meta.generatedAt", () => {
  assert.throws(() => assertGeneratedAt({ meta: {} }), /required/);
  assert.throws(() => assertGeneratedAt({}), /required/);
});

test("assertGeneratedAt rejects a date-only or otherwise non-instant string", () => {
  assert.throws(() => assertGeneratedAt({ meta: { generatedAt: "2026-07-02" } }), ContractError);
  assert.throws(() => assertGeneratedAt({ meta: { generatedAt: "not a date" } }), ContractError);
  assert.throws(() => assertGeneratedAt({ meta: { generatedAt: 1751443200000 } }), ContractError);
});

// Codex round 3 finding 3: Date.parse alone silently NORMALIZES an invalid calendar date
// ("2026-02-30" -> 2026-03-02) instead of rejecting it. Must be caught by the round-trip check.
test("assertGeneratedAt rejects a calendar date that JS Date would silently normalize (Feb 30)", () => {
  assert.throws(() => assertGeneratedAt({ meta: { generatedAt: "2026-02-30T10:00:00Z" } }), ContractError);
});

test("assertGeneratedAt round-trip check: rejects other out-of-range calendar dates, accepts real leap days", () => {
  assert.throws(() => assertGeneratedAt({ meta: { generatedAt: "2026-04-31T00:00:00Z" } }), ContractError); // April has 30 days
  assert.throws(() => assertGeneratedAt({ meta: { generatedAt: "2026-02-29T00:00:00Z" } }), ContractError); // 2026 is not a leap year
  assert.doesNotThrow(() => assertGeneratedAt({ meta: { generatedAt: "2028-02-29T00:00:00Z" } })); // 2028 IS a leap year
});

// ---------------------------------------------------------------- computeCoverage (A6 / Codex R2 #2, #4)
test("computeCoverage falls back to full portfolio coverage when worklist.accountIds is empty (no bypass)", () => {
  const data = {
    portfolio: { accounts: [{ accountId: "A1" }, { accountId: "A2" }] },
    worklist: { accountIds: [] },
    borrowers: { A1: bundle("A1") },
  };
  const { requiredIds, missing, source } = computeCoverage(data);
  assert.deepEqual([...requiredIds].sort(), ["A1", "A2"]);
  assert.deepEqual(missing, ["A2"]);
  assert.match(source, /portfolio\.accounts/);
});

test("computeCoverage falls back to full portfolio coverage when worklist is absent entirely", () => {
  const data = {
    portfolio: { accounts: [{ accountId: "A1" }] },
    borrowers: {},
  };
  const { requiredIds, missing, source } = computeCoverage(data);
  assert.deepEqual(requiredIds, ["A1"]);
  assert.deepEqual(missing, ["A1"]);
  assert.match(source, /portfolio\.accounts/);
});

test("computeCoverage uses worklist.accountIds when non-empty, and reports zero missing when covered", () => {
  const data = {
    portfolio: { accounts: [{ accountId: "A1" }, { accountId: "A2" }] },
    worklist: { accountIds: ["A1"] },
    borrowers: { A1: bundle("A1"), A2: bundle("A2") },
  };
  const { requiredIds, missing, source } = computeCoverage(data);
  assert.deepEqual(requiredIds, ["A1"]);
  assert.deepEqual(missing, []);
  assert.equal(source, "worklist.accountIds");
});

// Codex R2 finding 2: a worklist id with no borrowers bundle is now a COVERAGE GAP (downgradable
// by --allow-partial at the assembler layer), NOT a structural throw. This is what makes the A17
// "unstaged worklist row, no-channel mode" scenario reachable at all.
test("computeCoverage: a worklist id with no borrowers bundle is a coverage gap, not a structural error", () => {
  const data = {
    portfolio: { accounts: [{ accountId: "A1" }] },
    worklist: { accountIds: ["A1", "GHOST"] },
    borrowers: { A1: bundle("A1") },
  };
  const { requiredIds, missing, source } = computeCoverage(data);
  assert.doesNotThrow(() => computeCoverage(data));
  assert.deepEqual(requiredIds.sort(), ["A1", "GHOST"]);
  assert.deepEqual(missing, ["GHOST"]);
  assert.equal(source, "worklist.accountIds");
});

// Structural (unconditional) well-formedness: malformed / duplicate ids in the LIST ITSELF.
test("computeCoverage rejects a malformed worklist id (structural, unconditional)", () => {
  const data = {
    portfolio: { accounts: [{ accountId: "A1" }] },
    worklist: { accountIds: ["A1", "", null] },
    borrowers: { A1: bundle("A1") },
  };
  assert.throws(() => computeCoverage(data), /malformed/);
});

test("computeCoverage rejects a duplicate worklist id (structural, unconditional)", () => {
  const data = {
    portfolio: { accounts: [{ accountId: "A1" }] },
    worklist: { accountIds: ["A1", "A1"] },
    borrowers: { A1: bundle("A1") },
  };
  assert.throws(() => computeCoverage(data), /duplicate/);
});

// Codex round 3 finding 4: with no server worklist, ids surfaced by portfolio.signals
// (covenantsDueSoon / maturitiesSoon) join portfolio.accounts in the required set — but ONLY when
// the signal's date would actually fire under the CLIENT's exact predicate (app/src/data/
// worklist.ts): covenant d <= 45 (any value below that, including deeply overdue/negative);
// maturity 0 <= d <= 270. GENERATED_AT below is fixed so day-math is exact and non-flaky.
const GENERATED_AT = "2026-07-02T09:15:00Z"; // matches meta.dateISO in the real sample data

test("computeCoverage (no worklist) requires client-derived signal ids that fire under the client's exact date predicates", () => {
  const data = {
    meta: { generatedAt: GENERATED_AT },
    portfolio: {
      accounts: [{ accountId: "A1" }],
      signals: {
        covenantsDueSoon: [
          { accountId: "A1", nextEvaluationDate: "2026-06-30" }, // overdue, still <=45 -> fires
          { accountId: "SIGNAL_ONLY_COVENANT", nextEvaluationDate: "2026-07-20" }, // 18d out -> fires
        ],
        maturitiesSoon: [
          { accountId: "SIGNAL_ONLY_MATURITY", maturityDate: "2026-09-01" }, // 61d out -> fires
        ],
      },
    },
    borrowers: { A1: bundle("A1") },
  };
  const { requiredIds, missing, source } = computeCoverage(data);
  assert.deepEqual(
    [...requiredIds].sort(),
    ["A1", "SIGNAL_ONLY_COVENANT", "SIGNAL_ONLY_MATURITY"].sort(),
  );
  assert.deepEqual(missing.sort(), ["SIGNAL_ONLY_COVENANT", "SIGNAL_ONLY_MATURITY"].sort());
  assert.match(source, /client-derived/);
});

// The explicit round-3 test: a maturity signal 400 days in the PAST for an otherwise-unstaged id
// must NOT be treated as a coverage requirement — the client's `d >= 0` lower bound means a
// matured facility never fires MATURITY_NEAR, so the assembler must not fail assembly over it.
test("computeCoverage: a stale (400-day-past) maturity signal for an unstaged id does NOT fail assembly", () => {
  const data = {
    meta: { generatedAt: GENERATED_AT },
    portfolio: {
      accounts: [{ accountId: "A1" }],
      signals: {
        maturitiesSoon: [{ accountId: "LONG_CLOSED_ACCOUNT", maturityDate: "2025-05-28" }], // ~400d before GENERATED_AT
      },
    },
    borrowers: { A1: bundle("A1") },
  };
  const { requiredIds, missing } = computeCoverage(data);
  assert.deepEqual(requiredIds, ["A1"]);
  assert.deepEqual(missing, []); // LONG_CLOSED_ACCOUNT never enters requiredIds at all
});

// A covenant signal far enough in the FUTURE (beyond the 45-day window) also must not require
// staging — mirrors the client's single "d <= 45" comparison exactly (no separate unbounded case).
test("computeCoverage: a covenant signal beyond the 45-day window for an unstaged id does NOT fail assembly", () => {
  const data = {
    meta: { generatedAt: GENERATED_AT },
    portfolio: {
      accounts: [{ accountId: "A1" }],
      signals: {
        covenantsDueSoon: [{ accountId: "FAR_FUTURE_TEST", nextEvaluationDate: "2027-01-01" }], // ~183d out
      },
    },
    borrowers: { A1: bundle("A1") },
  };
  const { requiredIds, missing } = computeCoverage(data);
  assert.deepEqual(requiredIds, ["A1"]);
  assert.deepEqual(missing, []);
});

// ---------------------------------------------------------------- deriveAnchorBorrower (A8 / Codex R2 #5)
test("deriveAnchorBorrower returns borrowers[anchorId] when top-level borrower is absent", () => {
  const data = { meta: { anchorAccountId: "A1" }, borrowers: { A1: bundle("A1") } };
  assert.equal(deriveAnchorBorrower(data), data.borrowers.A1);
});

test("deriveAnchorBorrower ignores an authored top-level borrower entirely — always derives from borrowers[anchorId], never throws on divergence", () => {
  const data = { meta: { anchorAccountId: "A1" }, borrower: bundle("SOMETHING_ELSE_ENTIRELY"), borrowers: { A1: bundle("A1") } };
  let result;
  assert.doesNotThrow(() => { result = deriveAnchorBorrower(data); });
  assert.equal(result, data.borrowers.A1);
});

// ---------------------------------------------------------------- assertWorklistReasons (Codex round 3 #2)
test("assertWorklistReasons accepts a well-formed reasons map, and permits all six documented codes", () => {
  assert.equal(PERMITTED_REASON_CODES.length, 6);
  const data = {
    worklist: {
      accountIds: ["A1"],
      reasons: { A1: [...PERMITTED_REASON_CODES] },
    },
  };
  assert.doesNotThrow(() => assertWorklistReasons(data));
});

test("assertWorklistReasons is a no-op when worklist or worklist.reasons is absent", () => {
  assert.doesNotThrow(() => assertWorklistReasons({}));
  assert.doesNotThrow(() => assertWorklistReasons({ worklist: null }));
  assert.doesNotThrow(() => assertWorklistReasons({ worklist: { accountIds: ["A1"] } }));
});

test("assertWorklistReasons rejects reasons as an array (must be a plain object)", () => {
  const data = { worklist: { reasons: [["COVENANT_DUE"]] } };
  assert.throws(() => assertWorklistReasons(data), ContractError);
});

// Explicit round-3 fixture: reasons: { id: null }
test("assertWorklistReasons rejects a null value for an id (must be an array)", () => {
  const data = { worklist: { reasons: { A1: null } } };
  assert.throws(() => assertWorklistReasons(data), /A1/);
});

// Explicit round-3 fixture: unknown reason code string
test("assertWorklistReasons rejects an unknown reason code string", () => {
  const data = { worklist: { reasons: { A1: ["COVENANT_DUE", "TOTALLY_MADE_UP_CODE"] } } };
  assert.throws(() => assertWorklistReasons(data), /TOTALLY_MADE_UP_CODE/);
});

// ---------------------------------------------------------------- assertActivity (SPEC A30, round 4)
const GENERATED_AT_R4 = "2026-07-02T09:15:00Z";

function activityFixture(overrides = {}) {
  return {
    meta: { generatedAt: GENERATED_AT_R4 },
    borrowers: {
      A1: {
        snapshot: { accountId: "A1" },
        activity: [
          {
            id: "act-1",
            ts: "2026-06-28T14:32:00Z",
            kind: "REQUEST_RECEIVED",
            title: "Request received",
            summary: "A thing happened.",
            reference: { kind: "m365-message", id: "SAMPLE-1" },
          },
          {
            id: "act-2",
            ts: "2026-07-01T16:45:00Z",
            kind: "ANALYSIS_CONCLUDED",
            title: "Analysis concluded",
            summary: "The analysis concluded.",
            detail: {
              verdict: "All good.",
              nextSteps: [{ actionId: "loan-modification", note: "Do the thing." }],
            },
          },
        ],
        ...overrides,
      },
    },
  };
}

test("assertActivity accepts a well-formed activity[] (valid fixture) and permits every kind the page renders", () => {
  // The permitted list mirrors the app's ActivityKind union (2026-09-03): a kind the page can
  // render is a kind the assembler accepts, executed and staged trail rows included.
  for (const k of ["ACTION_TRIGGERED", "ACTION_EXECUTED", "ACTION_EXECUTION_FAILED", "ACTION_STAGED", "REQUEST_RECEIVED", "ANALYSIS_CONCLUDED", "COVENANT_EVALUATED", "FACILITY_MODIFIED", "RENDER_AUDIT"]) {
    assert.ok(PERMITTED_ACTIVITY_KINDS.includes(k), k);
  }
  assert.equal(PERMITTED_ACTIVITY_KINDS.length, 9);
  assert.doesNotThrow(() => assertActivity(activityFixture()));
});

// A31.3: ACTION_TRIGGERED (user/banker-initiated action, session-local today, persisted via the
// v2 audit path later) — the assembler must accept the kind even though no sample data carries it.
test("assertActivity accepts ACTION_TRIGGERED as a valid kind (A31.3), still rejects unknown kinds", () => {
  assert.ok(PERMITTED_ACTIVITY_KINDS.includes("ACTION_TRIGGERED"));
  const data = activityFixture({ activity: [
    { id: "act-1", ts: GENERATED_AT_R4, kind: "ACTION_TRIGGERED", title: "Loan modification started", summary: "Banker triggered the loan-modification action." },
  ] });
  assert.doesNotThrow(() => assertActivity(data));

  const bad = activityFixture({ activity: [
    { id: "act-1", ts: GENERATED_AT_R4, kind: "STILL_NOT_A_REAL_KIND", title: "t", summary: "s" },
  ] });
  assert.throws(() => assertActivity(bad), /STILL_NOT_A_REAL_KIND/);
});

test("assertActivity is a no-op when activity is absent (honest empty state, A30.2)", () => {
  assert.doesNotThrow(() => assertActivity({ borrowers: { A1: { snapshot: { accountId: "A1" } } } }));
  assert.doesNotThrow(() => assertActivity({}));
});

test("assertActivity rejects duplicate ids within the same bundle's activity[]", () => {
  const data = activityFixture({ activity: [
    { id: "dup", ts: GENERATED_AT_R4, kind: "COVENANT_EVALUATED", title: "t", summary: "s" },
    { id: "dup", ts: GENERATED_AT_R4, kind: "COVENANT_EVALUATED", title: "t", summary: "s" },
  ] });
  assert.throws(() => assertActivity(data), /duplicate/);
});

test("assertActivity rejects an unknown kind", () => {
  const data = activityFixture({ activity: [
    { id: "act-1", ts: GENERATED_AT_R4, kind: "SOMETHING_MADE_UP", title: "t", summary: "s" },
  ] });
  assert.throws(() => assertActivity(data), /SOMETHING_MADE_UP/);
});

test("assertActivity rejects a ts that postdates meta.generatedAt", () => {
  const data = activityFixture({ activity: [
    { id: "act-1", ts: "2026-07-03T00:00:00Z", kind: "COVENANT_EVALUATED", title: "t", summary: "s" }, // 1 day AFTER generatedAt
  ] });
  assert.throws(() => assertActivity(data), /after meta\.generatedAt/);
});

test("assertActivity rejects an invalid ts (same round-trip rule as meta.generatedAt)", () => {
  const data = activityFixture({ activity: [
    { id: "act-1", ts: "2026-02-30T10:00:00Z", kind: "COVENANT_EVALUATED", title: "t", summary: "s" },
  ] });
  assert.throws(() => assertActivity(data), ContractError);
});

test("assertActivity rejects a missing/empty title or summary", () => {
  const noTitle = activityFixture({ activity: [
    { id: "act-1", ts: GENERATED_AT_R4, kind: "COVENANT_EVALUATED", title: "", summary: "s" },
  ] });
  assert.throws(() => assertActivity(noTitle), /title/);

  const noSummary = activityFixture({ activity: [
    { id: "act-1", ts: GENERATED_AT_R4, kind: "COVENANT_EVALUATED", title: "t" },
  ] });
  assert.throws(() => assertActivity(noSummary), /summary/);
});

// Explicit round-4 fixture: an UNKNOWN registry actionId in detail.nextSteps must name the offender.
test("assertActivity rejects an unknown detail.nextSteps[].actionId, naming it", () => {
  assert.ok(PERMITTED_ACTION_IDS.includes("loan-modification"));
  assert.ok(!PERMITTED_ACTION_IDS.includes("definitely-not-a-real-action"));
  const data = activityFixture({ activity: [
    {
      id: "act-1",
      ts: GENERATED_AT_R4,
      kind: "ANALYSIS_CONCLUDED",
      title: "t",
      summary: "s",
      detail: { nextSteps: [{ actionId: "definitely-not-a-real-action", note: "n" }] },
    },
  ] });
  assert.throws(() => assertActivity(data), /definitely-not-a-real-action/);
});

test("assertActivity rejects an empty-string nextSteps[].actionId", () => {
  const data = activityFixture({ activity: [
    {
      id: "act-1",
      ts: GENERATED_AT_R4,
      kind: "ANALYSIS_CONCLUDED",
      title: "t",
      summary: "s",
      detail: { nextSteps: [{ actionId: "", note: "n" }] },
    },
  ] });
  assert.throws(() => assertActivity(data), ContractError);
});

// ---------------------------------------------------------------- assertRequests (SPEC A29 seam, round 4)
function requestsFixture(overrides = {}) {
  return {
    meta: { generatedAt: GENERATED_AT_R4 },
    borrowers: {
      A1: {
        snapshot: { accountId: "A1" },
        requests: [
          {
            id: "req-1",
            channel: "email",
            receivedAt: "2026-06-28T14:32:00Z",
            summary: "Client asked for an increase.",
            ask: { type: "facility_increase", from: 10000000, to: 13000000 },
            reference: { kind: "m365-message", id: "SAMPLE-1" },
            status: "under_review",
          },
        ],
        ...overrides,
      },
    },
  };
}

test("assertRequests accepts a well-formed requests[] (valid fixture) with no webLink (honest gap)", () => {
  const data = requestsFixture();
  assert.equal(data.borrowers.A1.requests[0].reference.webLink, undefined);
  assert.doesNotThrow(() => assertRequests(data));
});

test("assertRequests is a no-op when requests is absent", () => {
  assert.doesNotThrow(() => assertRequests({ borrowers: { A1: { snapshot: { accountId: "A1" } } } }));
});

test("assertRequests requires channel to be exactly \"email\"", () => {
  const data = requestsFixture({ requests: [
    { id: "req-1", channel: "sms", receivedAt: GENERATED_AT_R4, summary: "s", ask: { type: "t", from: 1, to: 2 }, reference: { kind: "m365-message", id: "X" }, status: "new" },
  ] });
  assert.throws(() => assertRequests(data), /channel/);
});

test("assertRequests requires a reference (email is the source of truth, A29)", () => {
  const data = requestsFixture({ requests: [
    { id: "req-1", channel: "email", receivedAt: GENERATED_AT_R4, summary: "s", ask: { type: "t", from: 1, to: 2 }, status: "new" },
  ] });
  assert.throws(() => assertRequests(data), /reference/);
});

test("assertRequests requires reference.kind to be exactly \"m365-message\"", () => {
  const data = requestsFixture({ requests: [
    { id: "req-1", channel: "email", receivedAt: GENERATED_AT_R4, summary: "s", ask: { type: "t", from: 1, to: 2 }, reference: { kind: "outlook-email", id: "X" }, status: "new" },
  ] });
  assert.throws(() => assertRequests(data), /reference\.kind/);
});

test("assertRequests rejects duplicate ids within the same bundle's requests[]", () => {
  const one = { id: "dup", channel: "email", receivedAt: GENERATED_AT_R4, summary: "s", ask: { type: "t", from: 1, to: 2 }, reference: { kind: "m365-message", id: "X" }, status: "new" };
  const data = requestsFixture({ requests: [one, { ...one }] });
  assert.throws(() => assertRequests(data), /duplicate/);
});

test("assertRequests rejects a receivedAt that postdates meta.generatedAt", () => {
  const data = requestsFixture({ requests: [
    { id: "req-1", channel: "email", receivedAt: "2026-07-03T00:00:00Z", summary: "s", ask: { type: "t", from: 1, to: 2 }, reference: { kind: "m365-message", id: "X" }, status: "new" },
  ] });
  assert.throws(() => assertRequests(data), /after meta\.generatedAt/);
});

// ---------------------------------------------------------------- assertValidationSurfaces (A5)
test("assertValidationSurfaces requires dataQuality + per-bundle covenantChallenge", () => {
  const good = { dataQuality: [], borrowers: { A1: { covenantChallenge: [] } } };
  assert.doesNotThrow(() => assertValidationSurfaces(good));

  const badTop = { borrowers: { A1: { covenantChallenge: [] } } };
  assert.throws(() => assertValidationSurfaces(badTop), /dataQuality/);

  const badBundle = { dataQuality: [], borrowers: { A1: {} } };
  assert.throws(() => assertValidationSurfaces(badBundle), /covenantChallenge/);
});

// ---------------------------------------------------------------- A5 regression fixture:
// validateC360 must actually populate both surfaces across ALL staged bundles, not just the anchor.
test("regression fixture: validateC360 populates covenantChallenge + dataQuality across every staged bundle", () => {
  const data = {
    meta: { anchorAccountId: "A1", dateISO: "2026-07-02" },
    portfolio: { accounts: [{ accountId: "A1" }, { accountId: "A2" }], signals: { covenantsDueSoon: [] } },
    borrowers: {
      A1: bundle("A1", {
        covenants: { covenants: [{ covenantId: "c1", covenantType: "Minimum Liquidity", thresholdValue: 1000, actualValue: 2000, breached: false, covenantStatus: "Active" }] },
        exposure: { totalCommitted: 1000000, facilities: [] },
      }),
      A2: bundle("A2", {
        covenants: { covenants: [{ covenantId: "c2", covenantType: "Debt-to-Worth", thresholdValue: 3, actualValue: 2, breached: false, covenantStatus: "Active" }] },
        exposure: { totalCommitted: 500000, facilities: [] },
      }),
    },
  };
  validateC360(data);
  assert.doesNotThrow(() => assertValidationSurfaces(data));
  assert.equal(data.borrowers.A1.covenantChallenge.length, 1);
  assert.equal(data.borrowers.A2.covenantChallenge.length, 1);
  assert.ok(Array.isArray(data.dataQuality));
});

// ---------------------------------------------------------------- assertUserId
test("assertUserId accepts the 15 and the 18 character form", () => {
  assert.doesNotThrow(() => assertUserId({ meta: { userId: "005bb00000ftouD" } }));
  assert.doesNotThrow(() => assertUserId({ meta: { userId: "005bb00000ftouDAAQ" } }));
});

test("assertUserId rejects a missing, empty or non-string id", () => {
  for (const meta of [undefined, {}, { userId: "" }, { userId: "   " }, { userId: 5 }, { userId: null }]) {
    assert.throws(() => assertUserId({ meta }), ContractError);
  }
  assert.throws(() => assertUserId({}), ContractError);
});

test("assertUserId rejects the display name, which is the defect it exists for", () => {
  // meta.user is "Fabian Goetzens"; the Apex compares approverUserId to the running identity
  // BEFORE redeeming the token, so a name dies at confirm time with a generic tool failure.
  assert.throws(() => assertUserId({ meta: { userId: "Fabian Goetzens" } }), ContractError);
  assert.throws(() => assertUserId({ meta: { userId: "fabian.goetzens@connectry.io" } }), ContractError);
});

test("assertUserId rejects an id of the wrong prefix or length", () => {
  for (const userId of ["001bb00001DLtRMAA1", "005bb00000ftou", "005bb00000ftouDA", "005bb00000ftouDAAQXX"]) {
    assert.throws(() => assertUserId({ meta: { userId } }), ContractError);
  }
});

test("assertUserId names meta.userId, so the failure is actionable", () => {
  assert.throws(() => assertUserId({ meta: {} }), (e) => e instanceof ContractError && /meta\.userId/.test(e.message));
});

// ---------------------------------------------------------------- fixture against the real sample data
test("real sample-data.json satisfies the full contract end to end", () => {
  // The plugin's own copy, kept byte-identical to the repo's artifact/ publish staging by
  // scripts/sync-plugin-assets.mjs. (Was ../artifact/, which stopped resolving when the plugin was
  // isolated into client-360/ and silently took this assertion out of the release gate.)
  const path = new URL("../assets/sample-data.json", import.meta.url);
  const data = JSON.parse(readFileSync(path, "utf8"));
  assert.doesNotThrow(() => assertGeneratedAt(data));
  assert.doesNotThrow(() => assertUserId(data));
  assert.doesNotThrow(() => assertBorrowersStructure(data));
  assert.doesNotThrow(() => assertWorklistReasons(data));
  assert.doesNotThrow(() => assertActivity(data));
  assert.doesNotThrow(() => assertRequests(data));
  assert.ok(data.borrowers["001SAMPLE0000STRL"].requests?.length === 1, "Sterling must carry the sample client request");
  assert.ok(data.borrowers["001bb00001DLtRMAA1"].activity?.length >= 1, "Piedmont must carry at least one activity entry");
  const { missing } = computeCoverage(data);
  assert.deepEqual(missing, [], "sample-data.json must stage every worklist/portfolio/signal-derived account");
  assert.doesNotThrow(() => deriveAnchorBorrower(data));
  validateC360(data);
  assert.doesNotThrow(() => assertValidationSurfaces(data));
});
