# Session Handoff — Customer 360, 2026-09-01 morning

The full-context handoff from the wave-2 + Electric-Glass-mint + unified-rooms + brain session
(2026-08-31 14:00 through 2026-09-01 ~06:00). A fresh session reads THIS file first, then acts.
Everything here is verified, not aspirational. Supersedes SESSION-HANDOFF-20260831.md.
Repo: /opt/connectry/projects/commercial-credit-reinvented/customer-360-reinvented, branch main
(HEAD 3ae9819 at handoff; this file lands on top). Demo: Dreamforce Demo 2, booth Sept 15-17.
Founder: Fabian (SHORT answers, no em dashes in comms, evidence before claims, founder calls via
AskUserQuestion, taste = Electric Glass hard rules in the standing directives).

## 1. Where the system stands (all verified)

**Client (the artifact)** — live at
https://claude.ai/code/artifact/91b5e835-5536-4f23-950e-4cde7941cf7f (label `wake-up-build`).
2249 vitest green / 78 files, tsc clean. RELEASE CHAIN (the trap bit 3x, never hand-cp):
```
cd app && npm run build && node scripts/release-artifact.mjs   # promote, marker-verified
node scripts/sync-plugin-assets.mjs                            # guards client-360/ copies
cd .. && node app/scripts/assemble-artifact.mjs artifact/live-data.json /tmp/c360-publish.html
# Artifact tool on /tmp/c360-publish.html WITH url: pinned to the id above
# + cp to /opt/connectry/brain/preview-site/builds/c360-cockpit-workroom/index.html
```
Artifact carries capability {mcp} (carried forward automatically; do not clear).

**Org (bankinggpt-at)** — deploy = the wave-2 arms, 102/102 org tests (fee + collateral +
policy-exception arms in Stage/ExecuteLoanModification + C360WriteGuard). NOTHING deployed since;
no Apex changes pending. Access: `read TOK INST <<< "$(~/.local/bin/bankinggpt-rest)"`
(SECRET-BEARING). Deploy recipe unchanged: mdapi dir /tmp/deploy-pkgver +
`sf project deploy start --metadata-dir /tmp/deploy-pkgver -o bankinggpt-at --test-level
RunSpecifiedTests --tests StageExecuteLoanModificationTest --tests C360WriteGuardTest --tests
StageHeldCreditActionsTest`.

**Baseline (Hartwell, restore after every test filing):** account 001bb00001I7FPNAA3, anchor
package a5Fbb000000IHFJEA4, 7 loans (6 roll-eligible; the $3M Equipment is Proposal stage,
now correctly DISABLED in the room), 0 chain rows, fees a45bb000001mODx/OFZ/OHB/OIn, approver
005bb00000ftouDAAQ. Baseline counts 7 pledges / 2 cov junctions / 21 involvements describe the
SIX roll-eligible members; querying all 7 loans reads 8/3/22 (the Proposal loan's own graph,
created Aug 25 - NOT debris). Revert: knowledge/sf-build-v2/tools/revert-hartwell.py then
revert-finish.py, NEW_PKG via env; collateral probes additionally delete the created
LLC_BI__Collateral__c + LLC_BI__Account_Collateral__c by COL number.

**Design contract** — IN GIT since this session: design/HANDOVER.md, DIRECTION-LOCKED.json
(66 rules + Addendum 2), dummy template + built copy. Probe suite design/probes/ with locked
dummy baseline (365 leaves) + reference/INTENT-OVERRIDES.md (3 sanctioned intent deviations +
post-mint founder directives incl. the arc changes + 3 probe-module artifacts).

## 2. What this session shipped (all merged to main, all live in the artifact)

1. **Wave 2, live-proven on the org then reverted:** fee ADD arm (percentage basis reads the
   MOVED commitment in-transaction: 200k on 20M verified; carried % fees reprice - realism),
   collateral chain (pledge-existing + create-then-pledge; org resolves advance rate + lendable
   in-transaction), policy-exception arm (supplied Name survives; verify reports the
   change-stream transmission), proactive opener (nextMove.ts), focus rings.
2. **The Electric Glass mint, complete:** foundation (tokens, one-sheet lens glass w/ triple
   rims by construction, Graphik, ink rings), landing + weave (byte-identical generator), hero/
   nav capsule/name flight, seven panes, FAB/arc/chat, workroom ritual (odometer, dossier +
   rotating-angle halo, write-back through the glass, seed entrance), cmdk lens. Founder signed
   off the landing; per-surface gates then dropped by founder call - probes+census carry fidelity.
3. **Unified Facility room:** one room, three routes (modify/renew/create), smart nextMove
   opening w/ chips, free text binds implicitly, route locks once staged. FOUNDER RELAY PROOF:
   Fabian drove a multi-loan plan (LoC 15->20M + Equipment 84->240mo + 1% fee) through the panel
   and the real two-hop relay - version a5Fbb000000J121EAC verified per-clone then reverted.
4. **Founders-eleven tweak pass** (from his live drive): thinking pulse, arc r=96 + scrim,
   identity-chip headroom, one-row chips + ? button, neutral chip surfaces (status as typography),
   thread collapse root-caused (a refusal counted as an open gate AND opened a step), disabled
   ineligible facilities, overdue-covenant + M365-mail suggestion tiers, read cards
   (borrowers/covenants from the bundle), banker-language refusals, QUESTION GUARD + value
   bounds (both founder misparse transcripts are regression fixtures).
5. **Relationship room:** 5 routes (annual review, covenant review, collateral valuation,
   risk-rating review, service request) re-clothed as the ritual over the EXISTING staged flows.
   Arc = 3 satellites: Assist / Facility Actions / Relationship Actions (45deg spread on r=96).
   Legacy sheets retired as entries (machinery kept). Professional register.
6. **The brain:** grounding pack brain/WORKROOM-BRAIN.md (27pp: nCino doctrine, banking doctrine,
   First Midwest demo policy - proven-standard only, tools/doors, 17 worked pairs led by the
   founder's two live failures; synced copy in client-360/skills/workroom-brain/). Two-lane
   composer: parser fast lane + bridge to the SESSION Claude (channel = askCopilot's mcp
   completion door; sendPrompt is fire-and-forget, unusable). Strict 3-shape validator
   (read-card | delta-proposal | clarify) in app/src/channel/brainLane.ts; malformed replies
   degrade to clarify, NEVER render broken or stage. Delta proposals are RESTATED through the
   parser's own proven phrasings (unproven shapes dropped and said out loud). Courtesy-prefixed
   imperatives ("can you increase...") stage via the fast lane. Skill ships in the plugin
   (client-360/skills/workroom-brain/SKILL.md, pack bundled beside it, sync guarded).
7. **Batch 2:** dossier "Written to nCino" links the package record (instanceUrl resolved at
   runtime, never hardcoded); "Open in nCino" on the hero; executed modifications land in the
   Activity trail (from the execution result the room holds; historical read from staging
   records = follow-up).
8. **Client guard mirror fix (found live by founder):** transitionAllowlist.ts learned the five
   wave-2 objects as CREATE-ONLY. DIRECTIVE: any future write arm touches BOTH guards
   (C360WriteGuard.cls AND transitionAllowlist.ts) in the same commit.
9. **The vector mark everywhere** (2026-08-31 directive supersedes the 08-27 typographic note;
   law-7 tests rewritten). Warning ink DUMMY-EXACT #b15c00 by founder call, 4 contrast checks
   founder-waived in contrast-check.mjs.
10. Decision ledger notes: workroom-brain channel locked = the user's session Claude (identity,
    connectors, zero infra); IDB Gateway = Boom's door (fleet spine per 2026-07-25 direction);
    doors-not-connectors (bind tool NAMES). Loan pricing org facts: InterestRate populated on all
    booked Hartwell loans, Spread on the three floating ones, INDEX NAME NOT STORED - the brain
    may state rate/spread, must never say "SOFR+".

## 3. Deep knowledge earned (cost hours; do not relearn)

- RELEASE CHAIN TRAP (bit 3x): assemble reads artifact/customer-360-template.html; skipping
  release-artifact.mjs silently ships the previous build (same-size output is the tell).
- BOTH-GUARDS RULE: Apex guard + client allowlist mirror move together, one commit.
- relSession store is MODULE-GLOBAL: any test that opens the Relationship room must close it
  (closeRelationshipRoom) or it bleeds into every later test in the file.
- Probe suite: run against the ASSEMBLED live-data artifact (bare dist fails the first worklist
  click); haloBoxSizeStablePx is genuinely non-deterministic (sampling during construction);
  three probe-module artifacts documented in INTENT-OVERRIDES (lensFab reads the wrapper,
  meter path assumes dummy tab order, glassSurfaceCount lower because React mounts lazily -
  the gating number is glassRimViolationCount = 0).
- Pledge object = LLC_BI__Loan_Collateral2__c (Loan child relationship name lies). SOQL refuses
  OR beside a semi-join (split the query). pkill -f self-matches the invoking shell if the
  pattern appears in the command line (use fuser -k port/tcp).
- The brain-repo bash hook blocks shell metacharacters near the literal word "brain" - write
  commit messages via a file (Write tool + git commit -F), avoid heredocs containing parens
  for those commits.
- Engines: app/src/workroom/ stayed byte-identical through EVERY pass (SHA-attested repeatedly).
  This is the 1000% guarantee; keep attesting it per merge.
- The staging-on-card-open change (workroom mint): opening Review mints the REAL org token
  (rule 38 honest); abandoned cards leave benign staging rows (idempotent).

## 4. THE BACKLOG (specific, in priority order)

**A. LIVE VERIFICATION (founder + agent joint session, first thing):**
   1. The brain round trip in a REAL panel: skill discovery (does the session load
      workroom-brain + read the bundled pack), contract adherence under a live model (validator
      degrade frequency), restate fidelity (a proposal naming a facility label the parser
      resolves differently), the tool doors present under expected names (Customer 360 reads,
      sObject soqlQuery, boom_get_ratios/spread via IDB Gateway, M365 outlook_*, recall_decisions).
   2. nCino links resolve for the viewer's session (accenture-d8--bankinggpt lightning domain).
   3. The Relationship room's five routes driven live (stage+execute each against the org,
      verify + revert - the room re-clothes EXISTING staged flows, so this is regression not
      new-arm testing).
   4. Brain review flags: (a) questions currently go to the brain WHEN CONNECTED, local read
      cards are the channel-none path - one-line flip in Workroom.tsx's question branch if
      local-first preferred; (b) a read question while a delta card is open still gets "one
      decision at a time" - design call.

**B. ORG-SIDE ARMS (daylight work; each = Apex + BOTH guards + deploy w/ 3 test classes +
   live probe + revert; every filing verified by SOQL re-read):**
   5. WITHDRAW MODIFICATION: governed invocable wrapping the proven revert logic (delete
      un-booked version + graph + orphan-aggregate LOOP sweep). Guards: only staging-created
      versions, only pre-approval (Qualification, no Submit), audit-logged, own confirm ceremony.
      UI: action on the room result / activity entry.
   6. AMEND v1 = withdraw + re-stage with the prior plan PRE-LOADED in the composer (composes
      from 5 + existing staging; true in-place amend is a later design).
   7. COVENANT-ON-ACCOUNT CREATE: stage_covenant_review has NO create key; only
      covenantAddsJson on loan-modification exists (attaches to a clone). Needs a create input
      authoring LLC_BI__Covenant2__c against LLC_BI__Relationship__c with no loan junction.
      The Relationship room ships this proposal-only today (CREATE_GAPS in reviewFlows.ts).
   8. COLLATERAL ASSET UNPLEDGED CREATE: the asset->Account_Collateral chain exists only inside
      pledgeAddsJson.newCollateral and always terminates in a pledge. Needs a create that stops
      after the ownership junction. Proposal-only today (CREATE_GAPS).
   9. RISK-RATING GRADE OVERRIDE: the staged plan writes
      LLC_BI__Overridden_Risk_Grade_Value__c but no request input carries it; the room refuses
      by name (OVERRIDE_NOT_FILEABLE). Wire the input end to end.
  10. Case.Type / Case.Origin have never been read off this org - service request takes free
      text + re-offers legalValues from refusals. Probe the picklists, decide chips.

**C. ADDENDUM 2 PORT (founder decision pending):** the design session added the SELF-DEMOING
   DIRECTOR to the dummy (~70s: CFO email card -> tabs -> chat -> full ritual -> write-back ->
   hand-back toast; element-readiness-driven via polling, any trusted click stops it, beat trail
   on window.__demoBeat; plus maturity-profile bars, deposit signal, rate-hedge opportunity data,
   chat conversational engine, parseLine precedence fix). Contract: HANDOVER Addendum 2 +
   rule 67. PORT NOTE in the contract: the readiness-driven director supersedes the parked
   walkthrough draft. This is the booth's self-running demo - port into the React build on
   founder go (the beats map to awaitable states far better in React than the dummy).

**D. DESIGN ROUND 2 (founder specs against real screens, then mint-style agents):**
  11. COLLATERAL SECTIONS: taste contract in standing directives - same Electric Glass, SUPER
      compact (facility-row pattern: icon + name left, figure right bold), perfectly aligned
      shared column grid, tabular-nums. Content: pledges w/ advance rates + lendable, ownership
      chain, the wave-2 mechanisms surfaced.
  12. FINANCIALS: keep current + ADD Revenue diagram, EBITDA diagram, income statement.
      Chart language per the system (draw-in w/ glow, single gradient stroke = functional
      purple). Data: Boom block in live-data.json - VERIFY income-statement line items exist at
      spec time, else refresh from Boom. Org pricing facts available (rate/spread) - index name
      must never be invented.
  13. EXTRA ACTIONS PLACEMENT: generate-spreading + draft-credit-memo have NO UI entry (panel
      machinery intact, cmdk rows are the cheap home; credit memo = Noland's MCP through
      whichever door - ownership boundary per 2026-07-25). Founder decides placement.
  14. Cleanup (not booth-critical): delete the actions SHEET variant UI (founder: keep as
      machinery for now, revisit); C360WriteGuard.CREATE_ONLY dead constant (background chip
      exists); doc-lag fixes - OBJECT-COVERAGE "ten tools" (8 declared/9 bound), stale
      Customer360Covenants root copy + header, recon fee ids superseded by re-seed.

**E. THE FULL RE-DRIVE (after A, before booth) -> report to all-green:**
  15. Playwright client sweep on the assembled artifact: every mechanism through the UI incl.
      both rooms; RETEST KEYBOARD-DRIVEN NAV (focus rings exist now - was blind before).
  16. Org replays of every arm (fee, collateral, policy exception, per-target scalars, the five
      relationship flows), verify + revert each.
  17. Founder connector click on the FINAL build (the only leg a human must drive).
  18. Multi-package relationship: seed one (a second package on some account) - the unbound
      room's package-cards + routing-question combined beat is coherent but UNREVIEWED.

**F. PRE-BOOTH CHECKLIST:**
  19. Refresh artifact/live-data.json close to Sept 15 (the opener + suggestions compute against
      the real clock; stale book -> odd lines). Also add staleness signals the reads lack today:
      collateral valuation dates + last-annual-review date (assembler + bundle shape) so the
      Relationship room's smart opening gets its two missing tiers.
  20. Safari/real-device pass (probes are Chromium-only; -webkit-backdrop-filter pin is in, but
      un-verified on hardware). Booth = MacBooks.
  21. Demo-day notes: FRESH claude.ai session per drive (tool schema cache), demo org tab
      pre-authed for the write-back reveal, the m365 + customer360 + gateway connectors attached.
  22. Taste follow-ups from the night: borrowers read-card repeats on single-borrower books
      (roll-up would read better - founder call), collateral read card is tall (org descriptions
      are 3 lines), step counter grows as the machine learns its total (stable estimate?).

## 5. Working agreements (held all session; keep)

- Fix work = parallel agents in worktrees under .claude/worktrees/ with STRICT file-ownership
  fences; merge on mechanical green (tests + tsc + build + probes + census); NEVER git add -A.
- Engine fence: app/src/workroom/ byte-untouchable, SHA-attest per merge. Agent proposes,
  machinery validates, human approves - the brain never writes.
- Every org filing: SOQL re-read verify + revert to baseline. Evidence before claims.
- Founder calls via AskUserQuestion; overnight = conservative default + wake-up note.
- Commit trailers on non-trivial commits. No em dashes anywhere in UI copy or comms.
- The design contract (dummy + 66 rules + addenda) wins every visual disagreement; new ideas =
  design round, never into a mint.

## 6. Handy paths

- Tweak ledger (all 15 items + dispositions): /tmp/joint-session-tweaks.md (copy in worktree
  tweaks-round1/TWEAKS.md) - fold into repo knowledge if /tmp rotates.
- Brain: brain/WORKROOM-BRAIN.md (+ client-360/skills/workroom-brain/), contract in
  app/src/channel/brainLane.ts, router in components/workroom/brainRoute.ts.
- Probe suite: design/probes/ (README; baseline reference/dummy-baseline.json; compare.mjs;
  targets.port.json = the contract keys, values only).
- Revert: knowledge/sf-build-v2/tools/ (env NEW_PKG; part 1 then part 2).
- Screenshot evidence: /tmp/{mint-*,tweaks-round1,relationship-room,brain-wiring}-compare/.
- Relationship Lens handoff for Noland (separate track, delivered):
  bot.connectry.io/s/4fc7fdc5572c/HANDOFF.md.

---
# MORNING DELTA (2026-09-01, appended at handover to the next session)

## Shipped this morning (merged, live at label clean-lane, main @ 86f0c35)
- THE LANE OPENS EMPTY (founder call, second reading - his first phrasing was misread once,
  reverted, then done right): both rooms drop ALL at-rest lane furniture - the figures strip
  (Members/Committed/Covenants resp. Committed/Covenants/Grade), the manifest header, the
  "Nothing staged yet" placeholder. Content is EARNED: detail card on focus, ledger summoned
  by the first confirm (with walked figures + count), retiring again at zero. Six presentation
  tests now assert ABSENCE (the stronger law-8 reading). Confirmed-change cards/chips that
  appear on action are UNTOUCHED - only default furniture died.
- The Relationship arc satellite icon = a person glyph (new "person" in the icon union).
- 2249 tests green; released via the full chain.

## IN FLIGHT AT HANDOVER: the Salesforce bubble (branch sf-bubble, worktree
.claude/worktrees/sf-bubble, agent may or may not have committed before this session ended -
CHECK `git log sf-bubble` first; if commits exist with green gates, merge; else rebuild from
this spec):
- Founder spec verbatim intent: a Salesforce-cloud bubble in the client arc; clicking it fans
  a SECOND TIER of two smaller glass bubbles: "Account page" and "Latest package", each opening
  the Salesforce record in a new tab.
- Build spec: arc back to 4 satellites (30deg steps r=96: (0,-96)(-48,-83)(-83,-48)(-96,0));
  new "cloud" glyph in ActionIcon (generic cloud, 1.3 stroke, NOT the trademark logo); narrator
  chip labels "Salesforce" / "Account page" / "Latest package" (rule 54: one chip, never
  floating labels); second tier ~34px bubbles, lens glass w/ triple rims (census!), 28ms spring,
  outside-click/Escape collapses; links = <instanceUrl>/lightning/r/Account/<accountId>/view and
  /LLC_BI__Product_Package__c/<packageId>/view via the EXISTING runtime instanceUrl resolution
  (brain-wiring pass built it; never hardcode); unresolvable -> disabled bubble (ink-3, title
  "Not connected to the org"), never a wrong link; trap 5 shared handler; client view only.
- ALSO in that pass: REMOVE the hero's "Open in nCino" text affordance (founder: never say
  "open in nCino" - the cloud is the door); the dossier keeps linking the written package via
  its reference chip without that wording.
- Arc changes ripple into actionPanel/chatParity entry helpers + probe targets + the
  INTENT-OVERRIDES post-mint section - the tweaks and arc-integration commits show the pattern.

## THE IN-DEPTH TESTING (NOT executed - the founder wants to DRIVE it with the next session):
The founder explicitly stopped the autonomous sweep: testing is a JOINT activity, him at the
panel, the session verifying org-side. The next session's testing script:
1. ORG REPLAY SWEEP (session-driven, founder watching): every write arm re-proven - the
   headline probe is THE EVERYTHING PLAN, never yet attempted: one plan carrying all seven
   wire families at once (two scalar targets + two fees + pledge-existing + create-then-pledge
   + policy exception), one token, one execute. If it trips a governor, fall back to wave-2
   groupings and record the boundary. Then the five Relationship staged flows individually.
   Every filing: SOQL verify + revert (tools in knowledge/sf-build-v2/tools/, NEW_PKG env;
   collateral runs also delete created Collateral + Account_Collateral by COL number).
2. FOUNDER PANEL DRIVE (fresh claude.ai session for schema): the brain's LIVE proofs - skill
   discovery (does the session load workroom-brain + read the pack), the covenant/borrowers
   questions answered as read-cards, a brain-composed delta proposal restated + staged, contract
   adherence (degrade frequency), the doors present (C360 reads, soqlQuery, boom_*, outlook_*,
   recall_decisions); the nCino/Salesforce links resolving; the two rooms end-to-end incl. his
   multi-loan through the relay on the FINAL build; keyboard-nav retest (rings exist now).
3. PLAYWRIGHT CLIENT SWEEP on the final assembled artifact + probe suite + census -> one
   consolidated test report into knowledge/.
4. Then the remaining backlog per sections B-D above (org arms, Addendum 2 port decision,
   design round 2).

## Session hygiene at handover
- Worktrees present under .claude/worktrees/: many from this session (wave2-*, mint-*,
  tweaks-round1, unify-router, relationship-room, brain-wiring, sf-bubble). Safe to
  `git worktree remove` the merged ones after confirming their branches are in main.
- The design session (parallel) is ACTIVE: it edited design/dummy/* on disk this morning
  (Addendum 2 build). Do not clobber; coordinate through the contract docs.
- Org watcher may still run (/tmp/org-watch.sh); kill via `fuser -k` style, never
  `pkill -f` with the pattern in your own command line (self-match kills your shell).

## Two founder questions answered at handover (2026-09-01, add to backlog D/F)
- SPREADING + CREDIT MEMO INTEGRATION: hand-off pattern per the 2026-07-25 ownership boundary -
  cockpit entries (cmdk rows first) ask the SESSION to run Noland's tools/skills (Credit Memo
  MCP, boom_show_spread) through whichever door serves them; the cockpit never rebuilds them.
  In-cockpit spreading DATA = the round-2 Financials amendment (Boom via the gateway).
- LIVE AUTO-UPDATING ARTIFACT: layer 1 exists (mcp capability + Sync = live on demand in a
  panel). Layer 2 = channel-gated AUTO-SYNC backlog item: poll interval while connected,
  last-refreshed stamp, changed figures odometer-roll, silent on channel-none, static host
  stays snapshot-honest. Booth moment: change the org, watch the cockpit tick over itself.
- DYNAMIC BOOK ("open relationship XYZ" for ANY org client, founder ask 2026-09-01): in-book
  clients already open via the deep-link path (verify chat-initiated variant in the testing
  session). For arbitrary org accounts: session searches via Customer360SearchAccounts ->
  Snapshot + pane reads -> hydrates a NEW client into the running cockpit through the channel
  (extend the Sync path to load-not-just-refresh), loading choreography + name flight included.
  Pairs with the auto-sync item; together they end the snapshot era.
