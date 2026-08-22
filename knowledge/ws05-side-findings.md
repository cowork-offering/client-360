# WS0.5 side findings (Archy, 2026-08-22) — fold into EVIDENCE-SEPT4 after the execute branch merges

## Item 4 — demo identity preconditions (DONE, additive user assignments only)
| User | UserRole | C360 Action Staging Access | Credit Actions and Reviews - User | Credit Actions Delete |
|---|---|---|---|---|
| fabian.goetzens@…bankinggpt (005bb00000ftouDAAQ) | Commercial Banking Manager (set 08-20) | had | ASSIGNED 08-22 (0Pabb00000YSvSnCAL) | ASSIGNED 08-22 (0Pabb00000YSvRBCA1) |
| noland.smith@…bankinggpt (005Dz00000AgCQBIA3) | nCino Administrator (had) | **ASSIGNED 08-22 (0Pabb00000YSvNxCAL)** — without it he could not run a single stage/execute tool | had | ASSIGNED 08-22 (0Pabb00000YSvPZCA1) |
Any further booth identity: repeat the same three checks before Sep 4.

## Item 6 — renewal stage predicate re-check (post Aug-14 upgrade)
nFORCE__System_Properties__c: `RenewalsStageStatusBookedLoansPSC = true` (CFG_TO_PSC, active).
No "Stages_Renewal_Allowed" system property exists in this org (research claim refers to a
config surface not yet located: see custom-metadata check). Renewal stays stage-only; re-probe
the clone field set before any execute_renewal work, as before.

## Plugin packaging (DONE 08-22): client-360/ subdir, 0.4.3, marketplace path updated, assets
parity guard `scripts/sync-plugin-assets.mjs --check`.

## D3 closed (2026-08-22): artifact capabilities manifest now explicit and source-derived
Both artifact URLs republished at repo 4411583 with `capabilities.mcp` = knowledge/artifact-capabilities-manifest.json
(Customer 360: 22 tools incl. execute_loan_modification; execute_covenant_review excluded by founder decision,
Customer360SearchAccounts excluded as no call path; IDB Gateway 3; Microsoft 365 1). Shapes come from the archived
observed envelopes (stage/execute/replay), not guessed; no live connector call was made from this session at publish time.
