# An execute whose answer is lost, and a room that reads instead of guessing

Written 2026-09-03 against branch `execute-async`, cut from main at `27a465d`.
The engine fence holds: `git rev-parse HEAD:app/src/workroom` =
`91c751e427232bf2b62c14b9cf92921e497496c9`, byte-identical to main. Nothing in
this change touches `C360WriteGuard.cls` or `app/src/actions/transitionAllowlist.ts`,
so the BOTH-GUARDS rule is not engaged. No Apex was deployed.

---

## What happened, 12:15 today

The founder approved a modification from the room: the $15M Line of Credit to
$20M at 7.25 over 240 months amortised with a first payment date, plus a net-new
$3M Equipment facility carrying a guarantor, a DSC covenant and a 1% origination
fee.

The room said:

> Timeout while invoking the tool ExecuteLoanModification. The filing may have
> completed despite the error. Do not approve again; check the staging record.

The filing had completed. All of it.

## The measurement

Reconstructed from the org's own record timestamps on staging row
`a8abb00001O2gwGAAR` (bankinggpt-at), so it is the founder's exact payload rather
than a reproduction of it.

| moment | clock | from token |
|---|---|---|
| staging row created | 12:14:53 | |
| **decision token consumed — engine hop starts** | 12:15:10 | +0s |
| new package version `a5Fbb000000J61hEAC` created | 12:15:22 | +12s |
| six clones | 12:15:26 | +16s |
| twelve `LLC_BI__LoanRenewal__c` chain rows | 12:15:31 | +21s |
| *(engine hop verifies, repairs the package name, commits `recordProgress`)* | ~12:15:33 | ~+23s |
| **arm hop starts** | ~12:15:34 | ~+24s |
| net-new facility `a4Zbb000002ICRNEA4` filed | 12:15:39 | +29s |
| its borrower involvement | 12:15:42 | +32s |
| carried covenant junctions | 12:15:57 | +47s |
| seven collateral pledges | 12:16:02 | +52s |
| twenty carried involvements | 12:16:03 | +53s |
| five fees, including the net-new 1% | 12:16:04 | +54s |
| **`cm_Executed_At__c` — arm hop done** | 12:16:05 | **+55s** |
| the guarantor row and the covenant junction on the new facility | 12:16:05 | +55s |
| nCino's own after-commit Loan Detail | 12:16:06 | +56s |

**Per hop: engine ≈ 23s, arm ≈ 31s, total 55s** from token consumption, plus the
outer relay leg's preflight (2 SOQL, sub-second). Call it **56s at the connector**.

### The connector's timeout

**Not published, and the runtime does not report a figure** — the rejection
carries the sentence and nothing else. What the org's own durations bound it to,
across every modification this cockpit has ever executed through the connector
(UUID idempotency keys; the named keys are REST-driven probes):

| run | wall | what the room saw |
|---|---|---|
| 2026-08-30 17:37 | 4s | returned |
| 2026-08-30 20:51 | 9s | returned |
| 2026-08-31 11:51 | 17s | returned |
| 2026-09-01 01:40 | 21s | returned |
| 2026-09-02 15:52 | 22s | returned |
| 2026-09-02 12:55 | 27s | returned |
| 2026-08-31 06:57 | 42s | a transport rejection the room printed as `[object Object]` (the run recorded in `app/src/workroom/engine.ts`'s readable-error note) |
| **2026-09-03 12:15** | **55s** | **"Timeout while invoking the tool ExecuteLoanModification"** |

**The ceiling sits between 27s and 42s.** Everything at or below 27s has come
back; nothing at 42s or above has. Treat it as ~30s until someone publishes a
number.

### What that rules out

The measurement kills the Apex split before it is written.

`ExecuteLoanModification` is **already two transactions** — that is the
2026-08-31 governor fix. The outer leg writes nothing and makes two sequential
HTTP callouts back into the org, `phase=engine` then `phase=arm`, because nCino's
own per-namespace SOQL budget cannot hold both (the failing run issued 161
queries of which 12 were ours; it died at LLC_BI's 101). The engine hop spends 46
of nCino's 100 and the arm 52.

So a shell-driven split would call `phase=engine` and then `phase=arm` as two
connector invocations. **The engine hop alone was 23s.** Against a ~30s ceiling
that is not a fix, it is the same coin flip with a shorter stake — and it would
put `inlineExecution` and `phase`, documented in the class as INTERNAL PLUMBING,
on the public wire, bypassing the relay's two-door fallback.

**No Apex shipped.** The right fix makes the timeout irrelevant instead of
racing it, and it is entirely in the shell.

---

## What the room does now

The org holds the answer on `cm_Action_Staging__c` for the whole run, and
`Customer360ActionHistory` reads it. So the room stops guessing.

On any execute failure that does not PROVE nothing was written:

1. One quiet line: **"Filing in progress, nCino is still writing."** Nothing is
   asked of the banker. The approve control is untouched and the status rotation
   under it keeps running.
2. **Poll `Customer360ActionHistory` for this staging row every 3s, up to 90s.**
   Measured at 0.35s–0.98s per read.
3. On a **terminal** status — `Completed`, `Partial` or `Failed` — the run is
   over.
   - `Failed`: the org's own fact, said as its own fact. No card.
   - otherwise: call `execute_loan_modification` once more with the **same
     idempotency key**. That is not a retry. `findCompleted` runs before every
     check in the Apex, so the call is answered off the staging record: one
     SOQL, no callout, no DML. **The executed card then lands through exactly
     the same code as a filing that answered the first time** — the ids, the
     nCino links, the token note, and the purpose hop the room still runs.
4. On **`Staged` twice running**, nothing ran: `claimForExecute` stamps the token
   and moves the row to `Executing` in one breath, so a run that started can
   never read Staged. The refusal the room already holds is the whole truth and
   it says it. Two reads rather than one because `Staged` is also where a real
   dispatch sits between the outer leg's callout and the inner leg's claim.
5. After 90s with the org still writing: one honest line that claims nothing and
   **a "Check the filing" chip**. The chip re-enters the wait. It is the only
   chip in this room that is not a sentence through the parser, and it exists
   because the alternative offer — approve again — is the one gesture that must
   never be made twice. The approval stays sealed throughout.

### Why the wait may not settle on `Executing`

`cm_Status__c` reads `Executing` from the moment the token is consumed, and the
engine hop's `recordProgress` **leaves it there** while the arm hop is still
writing. A poller that settled on `Executing` would land the executed card over a
run half done — on the founder's payload, that is a card claiming a $3M facility
about twenty seconds before the facility exists.

The same interim write is why the *replay* alone is not a settle signal:
`findCompleted` keys on `cm_Result_Record_Id__c != null`, which the engine hop
writes deliberately so the replay fence goes live the moment the version exists.
A replay fired mid-arm answers `ok:true` with a half-filled tracker. The status
gate is what makes the replay safe to use.

### Why 90s

The longest modification this org has recorded is 156s; the median is under 30.
Ninety covers the demo's shape with room to spare and still ends rather than
spinning. Past it the banker is told the truth and handed a read, not a write.

---

## Idempotency, proven live

Three consecutive `execute_loan_modification` calls against the founder's own
spent key `63587219-3ea7-4512-980d-d324dda67e59`, on bankinggpt-at:

```
REPLAY x3 wall: 0.27s, 0.29s, 0.27s
replayed=True  terminalState=partial  steps=22  clone=a4Zbb000002ICPoEAO
recordName="Hartwell Precision Manufacturing LLC - Line of Credit - $20,..."
DML DELTA after 3 replays: NONE — zero rows written
```

Row counts were taken before and after across `LLC_BI__Loan__c`,
`LLC_BI__Product_Package__c`, `LLC_BI__Legal_Entities__c`,
`LLC_BI__Loan_Covenant__c`, `LLC_BI__Fee__c`, `LLC_BI__Loan_Collateral2__c`,
`LLC_BI__LoanRenewal__c` and `LLC_BI__Covenant2__c`. Not one moved.

Worth stating because it is load-bearing: the replay is answered **before**
`preflight`, so it does not need a valid decision token. The retry can never
double-file, and it can never bounce on the burnt token either.

### What the replay does not carry

`replay()` reconstructs `stagingId`, `cloneLoanId`, `recordName`, `terminalState`
and the full 22-step tracker. It leaves `outputPackageId`, `newPackageName`,
`facilities[]`, `covenants[]` and the rest null. The room's `filed` map already
falls back to `result.cloneLoanId` and `result.outcome` for a facility the
response does not itemise, so a single-facility modification recovers a card
identical in every id it shows. A multi-facility plan recovers a card whose
per-facility verification sentence is the run's outcome rather than each clone's
own. That is honest and it is the smaller of the two costs; enriching `replay()`
is an Apex change and did not need to be tonight's.

### The end-to-end proof

The exact sequence the room now runs, driven against the founder's own record:

```
poll 1: status=Partial (0.84s)
replay: 0.34s  replayed=True  terminalState=partial  steps=22  clone=a4Zbb000002ICPoEAO
verified steps: 20 of 22
TOTAL settle wall: 1.18s
```

Twenty of twenty-two steps verified. The two that are not are
`carry_junctions` — which read every row it carried back but could not reconcile
its fee count against a plan that also minted a net-new fee — and
`observe_side_effects`, which is `filed_unverified` by construction. **That pair
is the whole reason the run ended `Partial` rather than `Completed`.** Nothing
failed. `C360Plan.terminalState` skips observed steps and returns partial when
any remaining step is unsettled, so `Partial` here means "everything landed, one
count could not be claimed" — which is why the wait treats it as terminal and
lands the card.

### The purpose hop, finished

The founder's timeout robbed the run of its second hop, so
`LLC_BI__Loan_Detail__c a4Wbb000001Laj3EAC` carried a null
`LLC_BI__Primary_Loan_Purpose__c`. The room still runs that hop on the recovered
path, so it was run:

```
hop 1: 0.79s  ok=True  "Purpose written on 1 new facility."   written=1 pending=0
hop 2: 0.94s  ok=True  "1 already carried it, so nothing was written for it."  written=0
AFTER: LLC_BI__Primary_Loan_Purpose__c = business_expansion
```

Idempotent, and the founder's filing is now complete. **`a5Fbb000000J61hEAC` was
not reverted** and nothing else on it was touched.

---

## A defect found on the way

`fetchActionHistory` has always sent its page size as `limit`. The org's Apex
names that variable `maxResults`, and answers `limit` with:

```
INVALID_INPUT: An invocable variable wasn't found for Apex action
Customer360ActionHistory: limit
```

The sync sweep drops a failing tool silently, so **the durable action trail has
never loaded in the cockpit** — every session has shown the sessionStorage echo
alone, which reads exactly like a tool that has not deployed yet. It had. The
test asserted the wrong key too, having been written from the declared shape
rather than from a wire, so it agreed with the client all the way through.

Fixed, and the poll depends on it.

---

## Files

| file | what |
|---|---|
| `app/src/components/workroom/settleExecution.ts` | new. `awaitFiling`, the copy, the budget, `LIVE_SETTLE`. |
| `app/src/components/workroom/settleExecution.test.ts` | new. 11 tests. |
| `app/src/components/workroom/Workroom.tsx` | the wait, the recovery, the status chip, the `settleDeps` seam. The "may have completed" copy is gone. |
| `app/src/channel/cockpitTools.ts` | `limit` → `maxResults`; `readActionState`, uncached, for the poll. |
| `app/src/channel/actionHistory.test.ts` | the input-shape test, corrected. |
| `app/src/workroom.render.test.tsx` | 5 new room tests; the stale "may have completed" assertion replaced. |

**`app/src/workroom/**` is untouched.** The recovery lives in the room rather than
in the engine, and that turned out to be the better shape anyway: the thing the
room does after the wait is call the same public `execute` the approval called,
so the seam stays one method wide and the scripted engine needs no new contract.

## Tests

- `settleExecution.test.ts` — terminal settles; `Partial` counts as landed;
  never settles on `Executing`; `Staged` twice means never-ran, once does not;
  the budget is spent exactly (30 reads); the wait comes before the first read;
  an unreadable trail and an absent row are both silence rather than evidence.
- `workroom.render.test.tsx` — the quiet line lands and the ordinary card follows
  with exactly one filing call and one replay; the budget running out closes the
  approval, says the honest line and files nothing; the chip lands the card and
  still only one filing call; a terminal `Failed` is the org's own fact; a plan
  that never reached an org is not polled at all; and the room no longer says
  "may have completed" anywhere.
- `actionHistory.test.ts` — the input key.

## Gate

```
tsc --noEmit          clean
vitest run            124 files, 3563 tests, 0 failures
npm run build         dist/cockpit.html — 1,509,915 bytes
git rev-parse HEAD:app/src/workroom
                      91c751e427232bf2b62c14b9cf92921e497496c9
```

Not published, not merged.

## Left open

- **`RelationshipRoom.tsx:1791` carries the same "may have completed despite the
  error. Do not approve again" copy.** Its execute runs in ~17s so it is not
  hitting the ceiling today, and it was out of scope for tonight. Same defect,
  same fix shape.
- **The connector timeout is still a guess bounded by observation.** If the
  runtime ever reports the figure, pin it here.
- **`replay()` could carry `facilities[]` and `outputPackageId`** off the tracker
  it already deserialises, which would make a recovered multi-facility card
  identical to a first-answer one. Apex, not tonight.
