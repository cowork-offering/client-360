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

## Demo-beat rehearsal on Hartwell THROUGH OUR TOOLS (2026-08-22, REST = exactly what the cockpit calls)
stage_loan_modification (REHEARSAL-HARTWELL-MOD-20260822-01, facilityIds [revolver a4Zbb0000027MaYEAU], 20,000,000)
→ staging a8abb00001NAYAlAAP, executionHeld false, 5 steps, covenantCarryover 1
→ execute_loan_modification (token, approver 005bb00000ftouDAAQ) → terminalState success, replayed false
→ clone a4Zbb000002BsK5EAK (Qualification, HW1001_M1, Amount reads back 20,000,000), junction RL-00000200 rev 1,
  parentUnchanged true. Standing for Fabian's review; rollback = delete junctions (2), clone, staging row; re-verify
  revolver Booked/Open/15,000,000/hasRenewal false, package 6 loans, staging 11.
