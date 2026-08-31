# Session Handoff — Customer 360 mechanics, 2026-08-31

The full-context handoff from the e2e-drive + wave-1-fixes session. A fresh session reads THIS
file first, then acts. Everything here is verified, not aspirational. Repo:
`/opt/connectry/projects/commercial-credit-reinvented/customer-360-reinvented`, branch `main`
(HEAD `fe65b84` at handoff time). Demo: Dreamforce Demo 2, booth Sept 15-17. Founder: Fabian
(style: SHORT answers, no em dashes in comms, surgical precision, evidence before claims).

## 1. Where the system stands (all verified today)

**Client (the artifact)** — live at
https://claude.ai/code/artifact/91b5e835-5536-4f23-950e-4cde7941cf7f (label `per-target-scalars`).
1826 vitest green, `tsc --noEmit` clean. Publish chain:
```
cd app && npm run build && cp dist/cockpit.html ../artifact/customer-360-template.html && cd .. \
  && node app/scripts/assemble-artifact.mjs artifact/live-data.json /tmp/c360-publish.html
```
then Artifact tool on `/tmp/c360-publish.html` WITH `url:` pinned to the id above (publishing
without `url` forks a stray artifact — happened once, a stray "Customer 360 · Relationship
Cockpit" from ~11:53 may still sit in the gallery; ignorable). Also
`cp /tmp/c360-publish.html /opt/connectry/brain/preview-site/builds/c360-cockpit-workroom/index.html`.
The artifact carries capability `{mcp}` (carried forward automatically; do not clear it).

**Org (bankinggpt-at)** — running the two-hop execute WITH per-target scalars (deployed ==
committed `1bb0491`, merged in `fe65b84`). 84/84 org tests. Access: `read TOK INST <<< "$(~/.local/bin/bankinggpt-rest)"`
(SECRET-BEARING, never commit). Deploy via mdapi dir `/tmp/deploy-pkgver` +
`sf project deploy start --metadata-dir /tmp/deploy-pkgver -o bankinggpt-at --test-level
RunSpecifiedTests --tests StageExecuteLoanModificationTest --tests C360WriteGuardTest --tests
StageHeldCreditActionsTest`.

**Baseline (Hartwell, restore to this after every test filing):** account `001bb00001I7FPNAA3`,
anchor package `a5Fbb000000IHFJEA4`, 7 members (6 roll-eligible), 0 chain rows, graph
2 cov junctions / 7 pledges / 21 involvements / 4 fees / 2 streams, LoC parent
`a4Zbb0000027MaYEAU` $15M Booked, Equipment `a4Zbb0000027MnREAU` $8M. Fee IDs (re-seeded today):
`a45bb000001mODx/OFZ/OHB/OIn`. Approver user `005bb00000ftouDAAQ`.

**Reports.** E2e drive report (both sides, findings, governor hunt):
https://claude.ai/code/artifact/583b29d3-5792-404c-9556-c5fd2f721ea1 (label
`wave1-fixes-landed`). UI-revamp brief for the parallel design session:
`knowledge/UI-REVAMP-HANDOVER.md`. Object coverage tracker: `knowledge/sf-build-v2/OBJECT-COVERAGE.md`.

## 2. What wave 1 fixed today (merged, live)

| Finding | Fix | Where |
|---|---|---|
| A-1 scalar leakage | membership guard in `wirePayload`: a scalar staged on one member refuses to file when the selection contains members that did not stage it | `app/src/workroom/modifyEngine.ts` |
| A-2 governor wall | (i) staged changes applied BEFORE the carry (nCino automation 30→11 queries); (ii) execute split into TWO relay hops `phase=engine` / `phase=arm`, each inside the LLC_BI 100-SOQL budget (46 and ~55). Token single-use, hop 2 re-derives targets from org chain rows. Queueable is IMPOSSIBLE in this org (CDC triggers allow one enqueue). | `ExecuteLoanModification.cls`, `C360ActionStaging.cls` (`assertArmable`, `recordProgress`) |
| B-1 involvement remove | `readParty` walks verb→article→role→name, strips trailing facility clause; party clarify now has awaiting + `parseAnswer` path; limited-guarantor/co-borrower/related-entity remove synonyms added (were entirely missing — Elena Hartwell is a Limited Guarantor) | `parseModify.ts`, `fieldCatalog.ts` |
| B-2 product chips | options ride deltas replies AND `acknowledge()` follow-ups (`WorkroomAcknowledgement.options`) | `createEngine.ts`, `types.ts`, `Workroom.tsx` |
| B-3 unit inference | "(Months)" in a label + bare number = no unit question; `matchCatalog` claims the unit parenthetical so no double-chip | `parseModify.ts`, `fieldCatalog.ts` |
| B-4 chip label | removals no longer titled "Add a legal entity" (`deltaTitle`) | `modifyEngine.ts` |

## 3. The deep knowledge (cost hours to learn; do not relearn)

- **Namespace budgets:** Apex counts a SOQL against the namespace of the code that ISSUES it. The
  101 failures were nCino's own budget, spent by ITS automation (Fee_Loan_Aggregate, financed-fee
  calc, collateral aggregate, exposure rollup) reacting to OUR writes. Our code peaked at 12/100.
  A commitment change on a clone already carrying fees/pledges wakes far more automation than the
  same change on a bare clone — hence "changes before carry".
- **Failed executes are NOT clean.** The engine (nFORCE ACrossPackageService) commits async work
  that survives the caller's rollback: partial versions with clones + chain rows appear. Before
  ANY re-stage: delete every package on the account except the anchor (pledges → junctions →
  fees/streams via clone list, aggregates, chain rows via `LLC_BI__ParentLoanId__c` /
  `LLC_BI__RenewalLoanId__c`, clones, package), plus `LLC_BI__Covenant2__c` created today, plus
  test `cm_Action_Staging__c` rows. Else staging refuses "invalid facilities".
- **`LLC_BI__Loan_Collateral_Aggregate__c` has NO loan back-reference.** Deleting clones strands
  aggregate shells (ours AND ones nCino mints per clone); the orphan sweep must LOOP because
  deleting pledges mints more. 120 orphans were cleared today.
- **Decision token is minted once.** An idempotent stage replay returns the plan WITHOUT the
  token. Always stage fresh per probe.
- **Invocable REST**: POST `/services/data/v61.0/actions/custom/apex/<Class>`; response
  `outputValues = {ok, result, error}`; an element can be null on some failures — guard it.
  executeAnonymous via tooling GET mangles custom-type generics (`List<LLC_BI__X__c>` fails to
  compile) — use for-loops into `List<SObject>`; `ALL ROWS` goes after `LIMIT`.
- **Streams are the engine's own carry** (Context_Id re-pointed correctly); fees/covenant
  junctions/pledges/involvements are OURS. Guard doorway for streams deliberately closed.
- **Client e2e harness:** serve the built file (`python3 -m http.server` on the preview-site copy,
  md5-identical to the artifact) and drive with Playwright MCP. The Chrome-extension click relay
  into the claude.ai artifact iframe is unreliable (0/9 on the worst run); typed input always
  lands; the app has no visible focus rings (backlog item) so keyboard nav is blind. claude.ai
  panel drives = human at the mouse, agent verifies org-side (works well; the sealed-approve UX
  was verified exactly this way).
- **The channel-none doctrine works:** on a static host the room says "not connected... nothing
  here is ever simulated" and never burns the token.

## 4. Outstanding work, in order

**Wave-1 remainder — CLOSED 2026-08-31 pm:**
1. DONE. Founder's live connector click verified in full: version a5Fbb000000IzwHEAS, LoC clone
   $20M + Monthly, covenant COV-000668 on account + clone, James Hartwell excluded, 4/4 fees
   carried, reverted. The two-hop execute is founder-proven through the real MCP relay.
2. DONE (upgraded beyond the guard): PER-TARGET SCALARS shipped and merged (fe65b84). New
   `scalarChangesJson` wire — each of the four scalars aims at its own member; mixed plans file
   (live probe a5Fbb000000IzzVEAS: LoC $20M + Equipment 240mo, four untouched members kept their
   amounts, reverted). Client routes targeted whenever scalar targets don't cover the selection OR
   one key carries two values; flat keys remain for single-facility; both-channels refused
   org-side. Guard kept as unreachable backstop. 1826 client / 84 org tests. FOUNDER-VERIFIED LIVE 12:45Z: his own panel click filed the mixed plan (version a5Fbb000000J04LEAS: LoC clone $20M, Equipment clone amort 84->240 with amount kept $8M, other clones inherited parent values untouched, full carry), verified and reverted. NOTE: Equipment parent's own baseline amort is 84, Purchase 240, Equip-3.5M 60 - clones inheriting these is NORMAL, do not misread as leakage. THE ONLY REMAINING
   LEAK PATTERN: `renewEngine.ts` / `StageRenewal.cls` still broadcast their two scalars — fix
   with the same per-target pattern (flagged in the merge commit Directive trailer).

**Wave 2 (the report's item 5, build order):**
3. Fee ADD arm: "add a 1% origination fee to the LoC" — shapes proven (Record_Type picklist,
   percentage fees need Basis_Source + Percentage, org computes Amount; recon:
   `knowledge/sf-build-v2/recon-20260831.md`). Server arm on Stage/Execute + client verbs.
4. Collateral chain: pledge-EXISTING collateral to a loan, and create-then-pledge (create
   `LLC_BI__Collateral__c` — NO Account lookup on it — then `LLC_BI__Account_Collateral__c`
   ownership junction, then the pledge). Collateral_Type VR demands Advance_Rate.
5. Policy-exception arm (probed safe: no approval/email; PolicyExceptionCDC egress is org-local).
6. Proactive opener: the room opens with the deal's next move (maturity in quarter, covenant due,
   utilization trend) instead of the static paragraph.
7. `:focus-visible` rings on all c360 buttons (accessibility + enables keyboard-driven automation).

**The post-wave-2 headline (founder direction, 2026-08-31): THE WORKROOM AGENT.** Fabian's words:
the room today "seems like a static demo workflow which should not be the case." Target
architecture, two layers: (1) an AGENT BRAIN that knows the org inside out (live describe,
catalog, covenant types, doctrine) AND reads whatever the banker actually says, combining deal
state + user intent + policy into composed plans and intelligent follow-ups — replacing the
deterministic parser as the primary understanding; (2) the DETERMINISTIC SPINE exactly as proven
today (describe validation, plan hash, single-use token, one human approval, re-query verify) as
the only thing that ever writes. Agent proposes, machinery validates, human approves. The parser
stays as fast path + safety floor. RESOLVED with the founder (2026-08-31): the agent runs as an MCP TOOL the page calls via
window.claude.mcp — the same mechanism the relationship chat already uses against the IDB Gateway
(which carries a generic get_llm_response tool). NOT the surrounding conversation (no channel back
into the room, 10-40s latency), NOT direct API from the page (CSP blocks external hosts; no
in-page completion capability in this runtime). Fast path: prototype on IDB Gateway
get_llm_response with our system prompt (state machine + catalog + doctrine) and a STRICT JSON
schema the client validates (reject malformed = treat as unparsed); then graduate to a dedicated
workroom_reason tool on a server we control. The model only ever PROPOSES amendments in the
parser's own schema; the deterministic spine (validation, hash, token, approval, re-query) stays
the only writer. Parser remains fast path + fallback.

**Then:** final full re-drive (Playwright client sweep + org replays + founder connector click),
report to all-green, then the UI-revamp port-back (the founder's parallel design session owns the
static design artifact; hard rules in the standing directives: ONE unified design system,
Accenture styling, the real `>` SVG from `knowledge/design/accenture-design-system`, no
sparklines on the landing, no decorative gradient hairlines).

## 5. Working agreements that held today

- Fix work runs as parallel agents in worktrees under `.claude/worktrees/` (NEVER `git add -A` in
  this repo — it swept worktree gitlinks and the design session's files once; `.gitignore` now
  guards). Merge order: client branches together, Apex separate.
- spawn_task chips WITHOUT an explicit cwd land sessions in `/opt/connectry/brain` and idle —
  don't use chips for repo work; use in-session Agents with explicit worktree paths.
- Every org filing gets verified by SOQL re-read and REVERTED to baseline. Evidence before
  claims, always. Commit trailers on non-trivial commits.
- The founder tests through the artifact panel; give him exact click scripts; watch the org in a
  background loop while he clicks.
