# The everything-plan drive: findings (2026-09-01, founder at the panel, base build facility-not-product)

Result: EXECUTE REFUSED. Org clean afterwards (1 package, 7 loans, zero created today; verified by
SOQL). The fence held: nothing half-written. The drive surfaced eight findings, three critical.
Each is located as FENCED ENGINE (app/src/workroom/, byte-untouchable) or SHELL (fixable now).

| # | Line | What happened | Severity | Where | Fix path |
|---|---|---|---|---|---|
| E1 | `remove the Minimum Liquidity covenant from the 15M line of credit` | Read as "take the covenant entry out of the manifest": it UN-STAGED the banker's own step-5 covenant on Equipment ($8M) - a different covenant on a different facility. Destructive misparse. Expected: the covenant-detach fence refusal by name. | CRITICAL | SHELL - Workroom.tsx ~2050, the manifest-address remove handler runs before the parser and matches too loosely (matched "covenant" to any staged covenant entry) | The manifest-remove address must require the line to name a STAGED entry (title AND target match), and must never fire on a line that names a BOOK item. A remove naming a book covenant goes to the fence refusal. |
| E4a | `add Hartwell Industrial Holdings as guarantor on the construction loan` | Holdings IS already Guarantor on Construction (SOQL). Room staged a second row and said "not on the facility today" - FALSE. The trap the pack itself documents. | CRITICAL | SHELL - involvement adds have no book-level dedupe (create-grammar added it for covenants + collateral only) | Extend the book-dedupe to involvements: same party + same role + same facility = name it, offer role change, never stage a second row. |
| E4b | same line | Chip value = "on the construction loan" (sentence fragment as the value). | HIGH | SHELL - the D1 fragment class, on the involvement surface | Phase-2 surface: involvement elicitation (party by name, role from the five legal roles, add/remove). |
| E4c | same line | "That takes the package from $49M to $54M" - a legal-entity add moved the committed total by $5M. Reproduced twice now (also seen on a covenant add this morning). Figure-integrity bug. | CRITICAL (a demo shows a wrong number) | UNDER DIAGNOSIS - the phrase lives in createEngine.ts:662 (`committed + addedMM`); how a non-monetary add reaches it with addedMM=5 is not yet traced | Trace the summary path; a non-monetary change must never alter the committed sentence. Add a test asserting the total holds on covenant/involvement/pledge adds. |
| E8 | `take Elena Hartwell off the 15M line of credit` | Staged the exclusion with role Guarantor. Her actual role on that line is LIMITED Guarantor (SOQL). The org found no Guarantor row for her -> "nothing to remove" -> EXECUTE REFUSED. This is what blocked the whole plan. | CRITICAL (blocks execute) | SHELL post-parse (the role came from a default, not the book) | On a carry-exclusion remove, resolve the party's ACTUAL role(s) on that facility from the involvements read and stamp the wire with it; one role = use it, several = ask. Same pattern as the qualifier filter: correct the delta before the chip. |
| E5 | `take Elena Hartwell off the 15M line of credit add a 1% origination fee...` (two lines pasted as one) | "take X off" was read as a COLLATERAL pledge/unpledge, not an involvement exclusion. Also the split-offer copy used an em dash ("two changes—one I can file"). | HIGH | FENCED ENGINE - parseModify.ts:457 REMOVE_VERBS puts `take off` and `unpledge` in one verb class; PARTY_VERB (477) also has `take off`; collateral won the race | SHELL workaround (rung 0): if the object of "take X off Y" resolves to a PARTY in the book, rewrite to "remove X from Y" before the engine sees it. Deterministic, honest. Em dash: copy fix. |
| E2 | `pledge the Fort Wayne equipment on the 2.5M line of credit` | Resolved "Fort Wayne equipment" to the INVENTORY asset (both assets mention Fort Wayne + Kokomo), and ran the duplicate check against the $15M line when he named the $2.5M line. | HIGH | Partly the script's ambiguity; the wrong-facility dup check is SHELL (collateral dedupe compared the wrong member) | The merged create-grammar now ASKS "which asset" on ambiguity (verified in its drive) - re-test. Fix the dedupe to compare against the facility the line names. |
| E3 | `pledge new collateral on the construction loan: Kokomo plant expansion, real estate, valued at 6,500,000` | Asked "What kind of asset is it?" though the line said "real estate". Typed type not honoured. | MEDIUM | SHELL - collateral elicitation (merged) | Free text wins: read the typed type against the org's collateral-type catalog before asking. |
| E7 | `Any guarantors?` | Read card rendered title + "Guarantors" headings and NO rows. The book has 8 guarantor rows. This morning "who are the guarantors?" rendered 6 parties locally. | HIGH | UNDER DIAGNOSIS - either the phrasing missed the local read and went to Bedrock (which is blind and returned an empty card), or the local structure card's guarantor filter is wrong | Reproduce with both phrasings on the merged build; if it reached the brain, the local-first read regex needs "any X?"; if local, fix the filter. |
| E6 | "no i need to add a new loan as part of the new modification" | Route lock: "9 changes staged, starting a new facility means discarding the manifest." By design today. Founder: "this should be possible - allow a new loan to be added as part of the package." | DESIGN REQUEST | Not a bug. Two tools (stage_loan_modification, stage_new_facility), two tokens. | Founder decision + design: either (a) one plan that orchestrates two tokens in sequence (modification version first, then the new facility onto the new version), or (b) a new org arm. Backlog, high demo value. |

## What the merged create-grammar build (f3da638) already changes for the retry
- Covenant lines: complete lines stage; ambiguous DSCR asks which variant; out-of-catalog test is
  named honestly; duplicates against the book are caught (covenants + collateral).
- Collateral: ambiguous asset -> asks "which asset" instead of picking (E2 first half).
- The D1 fragment value is fixed for covenants (E4b remains on involvements: phase 2).
- Amendment in place proven ("actually make it 1.30", "no, quarterly", "on the construction loan
  instead").
NOT changed by the merge: E1, E4a, E4c, E5, E8, E7. These are the fix batch.

## The retry line set (to get the everything plan EXECUTED tonight, on f3da638)
Skip the two fence probes (6, 9) and the blocked exclusion (11) until the fix batch lands. Run the
NINE filing wires in one plan: 1, 2, 3, 4, 5, 7 (say "add a second" if it names the inventory; or
name the asset as "the blanket equipment lien"), 8 (answer Real estate if asked), 10 (Elena as
limited guarantor on the 8M equipment loan - a clean add), 12, 13. Then `what is on the plan` ->
nine items -> Review -> Execute. That proves the base machinery end to end; the removes come back
in the next drive once E1/E5/E8 are fixed.

## Org state
Clean. No revert needed. Baseline verified after the refused execute.

---

## Second drive, on the plan-fixes build (headless, integrator, 2026-09-01 late)

Confirmed FIXED on the published build: E1 (both removes refuse by name, nothing un-staged), E2 (ambiguous asset asks), E3 (typed type honoured), E4b (role is the value), E4c (the committed sentence held on non-monetary adds; a real commitment change correctly moves it to $51M and raises the COVERAGE THINS check). Four new findings:

| # | What | Severity | Where | Fix |
|---|---|---|---|---|
| N1 | The pledge-remove fence refusal says "covenant DETACH ... loan-covenant junction" - the wrong noun for a collateral pledge. Honest refusal, wrong words. | LOW | SHELL, fenceRefusal copy | Pledge removes quote the deletes fence, not the covenant one. |
| N2 | Create-then-pledge is REFUSED: "needs an advance rate recorded on the pledge, a credit decision ... rather than something I will set." Wave 2 proved the ORG resolves advance rate and lendable in-transaction, so the block is over-cautious. The plan-fixes agent kept it deliberately and flagged it. | HIGH for the demo | SHELL (elicit / pledge verify) | FOUNDER DECISION: lift the block and file without a rate, trusting the org (the wave-2 fact), or keep it and require a rate from the approved terms. |
| N3 | "the 15M line of credit" on a FEE line is read by the fenced engine as a $15,000,000 amount ("Is the fee 1% or $15,000,000?"), and the next line was consumed as the answer to that open question and staged a $15M FEE. The dollar-qualifier phrasing only works on commitment lines (post-parse filter). | MEDIUM | FENCED ENGINE money reader; shell can pre-empt | SHELL: where a line carries a dollar qualifier that resolves to exactly one member, set FOCUS to that member and STRIP the qualifier before the engine sees the line. Until then: focus by chip, no figure on fee/exception/party lines. |
| N4 | ROOT CAUSE of E4a, E8 and E7: Customer360RelationshipGraph.cls queries Legal_Entities WHERE LLC_BI__Account__c = anchor. It returns only rows where the anchor itself is the party (6 Borrower rows) and never the guarantors/owners on the anchor's loans (15 of 21 rows missing). Bundle refresh cannot fix it. | CRITICAL (borrowing structure is a headline feature) | APEX READ TOOL (knowledge/sf-build-v2/Customer360RelationshipGraph.cls:125) | Query by the anchor's loans/packages (the UNION the pack describes). Read tool only: no guard, no write arm. Deploy joint with the founder, then refresh live-data.json, then re-drive 10b, 11, and "any guarantors?". |

Also observed: the Customer 360 connector in the integrator's own session returns INVALID_JWT_FORMAT - re-authorise it in claude.ai connector settings before relying on live reads at the booth.

Drive script that matches the screen: knowledge/MODIFICATION-DRIVE-SCRIPT-20260901.md.

---

## Founder product directives from the plan-fixes drive (2026-09-02, 00:xx). He holds off testing until these land.

| # | His point | The correct nCino model | Where |
|---|---|---|---|
| P1 | "DSC of Borrower already runs at relationship level, nothing needs putting up twice" is WRONG: a relationship-level covenant has no loan junction, so it is NOT associated to the loan. The room must check the LOAN junction, and when the covenant is not on that loan offer: create a new one on the loan, ASSOCIATE the existing one to the loan, or a different one. | Dedupe is per loan-covenant junction, never "relationship-level covers the package". Associate-existing = create an LLC_BI__Loan_Covenant__c junction for an existing Covenant2 (a create, not a delete). | SHELL dedupe + chips now. ORG: verify the junction-only create for an existing covenant files through the deployed covenant path; if not, small arm. |
| P2 | "We should have the ability to remove covenants from the open loan when the modification happens." Same for the AR pledge on line 9. | On a modification nothing is deleted on the booked loan: the new VERSION simply does not CARRY that covenant / that pledge onto the clone. That is a CARRY-EXCLUSION, exactly the mechanism involvements already use, and the delete fence stays intact. | ORG ARM: covenant carry-exclusion + pledge carry-exclusion on stage_loan_modification, C360WriteGuard AND transitionAllowlist.ts together, tests, deploy (joint). SHELL: "remove X from the loan" on a modification stages the exclusion, says the booked loan is untouched and the clone will not carry it. |
| P3 | "Pledge something the deal already carries" as the fallback to creating a new asset makes no sense: the deal's collateral already carries onto the clone. Creating a collateral must be possible. | Wave 2 proved the org resolves advance rate and lendable in-transaction. Lift the block; the room creates the asset and pledges it. Where a rate is genuinely required by the tool, ask for it as a chip, never refuse. Pledge-existing stays only as its own action for a facility that does not hold the asset. | SHELL now. |
| P4 | Line 9's refusal says "covenant DETACH" for a collateral pledge. "Is this a collateral or a covenant?" | A pledge is collateral. The refusal must speak the collateral fence, and once P2 lands it is not a refusal at all but a carry-exclusion. | SHELL copy now; superseded by P2. |

Also standing: N3 (dollar qualifier on fee/exception/party lines) is fixed in the shell by resolving
the qualifier to FOCUS and stripping it before the engine, so "on the 15M line of credit" works on
every line. And N4 (graph read returns only the anchor's own rows) is Apex on the read tool.
