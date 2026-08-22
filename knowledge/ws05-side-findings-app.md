# WS0.5 side findings: cockpit app (Archy, 2026-08-22)

Branch `ws05-exception-display`. App only. No org calls, no Apex edits, no publish.

## The defect

`Exception` in nCino is mostly ADMINISTRATIVE. The Servicing engine's exception batch forces
`Exception` onto a compliance row the moment its Due Date passes, whether or not anything was
measured, so 101 of 140 compliance rows in `bankinggpt` sit at `Exception` with no measured value
at all (`knowledge/NCINO-PROCESS-ALIGNMENT-DRAFT.md`, D15 and the schema table). The cockpit had no
single place where a covenant status was interpreted: four surfaces each carried their own substring
test, none of them knew the word `Exception`, and the covenant table showed the arithmetic while
hiding nCino's own verdict entirely. That is two failures in one. An `Exception` row rendered as if
it were clean, and any status the org invents renders on a guess.

## What changed

One classifier, `app/src/domain/covenantStatus.ts`, is now the only thing in the app that decides
what a covenant status means. `classifyCovenant(cov)` returns
`{ kind, label, severity, explanation, financialBreach, measured }` with
`kind ∈ compliant | breach | exception | waived | pending | unknown`.

The rule it holds:

- A FINANCIAL breach is the org's `Breached` flag, OR a status that says non-compliant in the org's
  own words, OR a measured value that misses its threshold with both numbers present.
- `Exception` is administrative by default: its own chip, tooltip
  "Administrative exception recorded in nCino; not a measured breach". It becomes
  "Exception, threshold not met" with breach severity ONLY when a measured value misses.
- `Waived` is its own neutral chip and is never a breach, not even past its threshold, and not even
  with the `Breached` flag set. A waiver is a decision not to enforce; it outranks the arithmetic.
- A status string the cockpit does not map renders VERBATIM. It is never mapped onto a breach. The
  only thing that can still make it a breach is a measured value that misses.
- `overdue` / `past due` are treated as the same administrative family as `Exception`, with their
  own note ("Test overdue in nCino; not a measured breach").

Threshold violation is direction-aware for both operators (floor tests and cap tests) via the
existing `covenantCushion`, and returns "cannot say" rather than false when either number is absent.
A gap is never a breach.

Wired through the classifier:

| Surface | File | Before | After |
|---|---|---|---|
| Worklist reason codes | `app/src/data/worklist.ts` | one `isBreached()` substring test | `COVENANT_BREACH` only for a financial breach; new `COVENANT_EXCEPTION` code, ranked below breach and above `COVENANT_DUE` |
| Reason chip | `app/src/components/reasons.ts`, `app/src/styles/tokens.css` | (none) | chip "Exception", label "Exception recorded", warning tint (not the breach red) |
| Covenant table | `app/src/components/tabs/CovenantsTab.tsx` | six columns, no status at all | seventh STATUS column, chip + tooltip per row; the breach callout now counts financial breaches only, and a separate Exception callout counts the administrative ones |
| Structural signals | `app/src/components/tabs/SignalsTab.tsx` | `breached \|\| cushion unsafe` ⇒ Critical | Critical for a financial breach, Watch for "Covenant exception · …" carrying the administrative note |
| Grounded prose | `app/src/data/grounding.ts` | "breached by X" from arithmetic alone; unmeasured covenants dropped silently | breach wording is the classifier's; a waived miss reads "past the threshold, recorded in nCino as Waived"; the Covenants sentence now counts covenants sitting at Exception with no measured breach, which the tightest-first filter used to drop |
| Suggestion engine | `app/src/actions/suggestionEngine.ts`, `app/src/actions/suggest.ts` | cushion rule fired on waived covenants; "breach" from `pct < 0` | waived covenants skipped; breach wording from the classifier; `COVENANT_EXCEPTION` routes to `covenant-review` |
| Provenance | `app/src/data/contract.ts` | `display.covenantTone` pointed at `data/finance.ts` | points at `domain/covenantStatus.ts` and names the inputs |

`covTone` was removed from `app/src/data/finance.ts`. Status interpretation does not live in the
formatting module any more.

## Status strings this org actually emits

Read from the Apex source and the staged data, not assumed.

`Customer360Covenants.cls` returns `LLC_BI__Last_Evaluation_Status__c` as `lastEvaluationStatus`,
`LLC_BI__Covenant_Status__c` as `covenantStatus`, and `LLC_BI__Breached__c` as `breached`.

- `lastEvaluationStatus` in the staged reads: `Compliant` (21 rows), `Non-Compliant` (1), null (1).
- `covenantStatus` in the staged reads: `Active` (13), `Compliant` (9), `In Progress` (1).
- `LLC_BI__Covenant_Status__c` is `restricted = false`, and the live org holds more than the
  documented picklist: `Pending, In Progress, Compliant, Waived, Exception, breached, overdue,
  <10% headroom, >10% headroom, Active, Pass, Fail` (`knowledge/ACTIONS-DESIGN.md` §5.4). This is why
  the classifier renders an unmapped string verbatim instead of bucketing it.
- Compliance-row `LLC_BI__Status__c` (a different object, not read by this tool):
  `Exception 101 · Pending 31 · Compliant 2 · null 6`.

## Test counts

Clean room: `npm ci`, then `npm run typecheck`, `npx vitest run`, `npm run contrast`.

| | Files | Tests |
|---|---|---|
| Before | 51 | 1344 |
| After | 52 | 1399 |

All green. Typecheck clean. All contrast checks pass (the exception chip reuses the already-checked
warning tint, so the gate needed no new entry). The four `covTone` tests in `finance.test.ts` were
replaced by 36 classifier tests in `app/src/domain/covenantStatus.test.ts`; the rest is new coverage
in `covenantsTab.render.test.tsx` (35 → 49: one status-chip assertion per borrower, plus five Exception cases), `worklist.test.ts` (+4), `grounding.test.ts` (+3) and
`suggestionEngine.test.ts` (+2).

Build: `npm run build` → `scripts/release-artifact.mjs` → `app/scripts/assemble-artifact.mjs`
(assembled to `/tmp/c360-publish.html`, 5 borrowers, slot verified) → `scripts/sync-plugin-assets.mjs`
(client-360/assets back in parity). Nothing was published.

## Apex follow-up for the Apex wave

**`breachedCount` is CORRECT as it stands. Do not "fix" it.** `Customer360Portfolio.cls` counts
`LLC_BI__Breached__c == true` and nothing else. It does not read any status string, so it never
counts an Exception as a breach. `KpiBand`'s "N breached" therefore stays as written.

One real gap, and it is a read gap rather than a defect:

- `Customer360Covenants.cls` reads `LLC_BI__Covenant2__c` only. It never reads the compliance record,
  so it cannot return `LLC_BI__Reason_for_Exception__c`, the field whose only two values are
  `Overdue` and `Breached`, and the one thing in this org that separates an administrative miss from
  a real failed test. Today the cockpit infers that separation from whether a value was measured.
  That inference is honest and it is the best available, but it is an inference. Surfacing the latest
  compliance row's `LLC_BI__Status__c` + `LLC_BI__Reason_for_Exception__c` per covenant would let the
  classifier read the answer instead of deriving it. Additive field, no behaviour change to existing
  callers.
- Second, smaller: 0 of 140 compliance rows in this org carry an actual value, so any covenant whose
  `Last_Evaluation_Value__c` is null will classify on status alone. That is the correct outcome, but
  it means the "measured" half of the rule is currently exercised only by Hartwell's and Piedmont's
  covenant-level figures.

## For WS3 plugin prose: five lines it must carry

1. `Exception` on a covenant in nCino is usually administrative, not financial: the exception batch
   forces it when a Due Date passes, measured or not.
2. In this org 101 of 140 compliance rows sit at `Exception` with no measured value at all, so
   "Exception" must never be read aloud as "breached".
3. Call a breach a breach only when the `Breached` flag is set, the status says non-compliant, or a
   measured value misses its threshold.
4. `Waived` is a decision not to enforce; it is neutral, never a breach, even past the threshold.
5. `LLC_BI__Covenant_Status__c` is unrestricted and holds values outside the documented picklist, so
   quote an unrecognised status verbatim rather than translating it.
