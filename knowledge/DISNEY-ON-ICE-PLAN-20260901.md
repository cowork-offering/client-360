# Disney on ice: the outstanding list and the parallel plan (2026-09-01, Monday night)

Founder target: feature-complete, tested and STABILIZED by **Thursday 2026-09-04**, handed back to the
Claude Shannon instance (GitHub org + plugin market). Booth (Dreamforce Demo 2) is **Sept 15-17**.
So Thursday = handover-for-testing milestone; Sept 4-15 = live testing, polish, rehearsal.

This file is the SINGLE PLAN every orchestrator session reads. If you are a parallel session: find
your stream below, work ONLY in its worktree and file fence, hand your branch back to the
integrator. Never touch main, the release chain or the pinned artifact yourself.

---

> **FOUNDER PIVOT (2026-09-01, late): ONE AT A TIME, not parallel streams.** "I don't even know if
> modification, renewal and everything is working - let's get this in the books first." Sequence
> is now: facility workroom fully PROVEN (the everything plan, new facility, renewal honesty -
> knowledge/EVERYTHING-PLAN-SCRIPT-20260901.md) -> create-grammar landed and re-driven -> then the
> next iteration is picked. Streams below remain the inventory; they are NOT running in parallel
> except G (probes, zero collision, already started) and the A fix agent (the facility room itself).

## 1. Running multiple orchestrator sessions: the three rules

Yes, multiple Fable sessions can run in parallel on this box and message each other (SendMessage
between local sessions; ccd_session_mgmt for cross-session). It works IF:

1. **One stream, one worktree, one file fence.** Each stream owns a named set of files. Two streams
   never edit the same file. Where two streams need the same file, they are SEQUENTIAL, not
   parallel (see the dependency column). This is already the working agreement; it is now the law
   across sessions, not just across agents inside one session.
2. **ONE integrator owns main, the release chain and the pinned artifact.** Every other session
   hands back a branch that is mechanically green (tests, tsc, build, fence SHA attested) plus a
   report. The integrator verifies the evidence itself, merges, runs the chain, republishes to
   artifact 91b5e835 (never a new URL), pushes. Two sessions publishing = version conflicts and a
   corrupted artifact. Two sessions merging = broken main.
3. **Size for the box.** The 2026-09-01 meltdown was 8+ unreaped sessions at 220-430MB each. Run at
   most 3-4 ACTIVE sessions, close them when their stream lands, and land the session-reaper task
   (chip already queued) before Tuesday. A stream that hangs the box helps nobody.

Cross-session protocol: a stream posts its state to `bash ~/brain/scripts/brain-write.sh context`
at start, at handback, and on any blocker, so the integrator and the founder see it in
shared-context without asking.

---

## 2. THE OUTSTANDING LIST, by stream

Priority: **M** = must for Disney on ice at the booth; **S** = should, strong demo moment;
**C** = could, after the booth is safe.

### Stream A - Create grammar (elicitation, amendment, steering, situational awareness)  [M]
Status: phase 1 recovered, fix agent RUNNING now on branch create-grammar.
Files: elicit.ts, steer.ts, dispatch.ts, brainRoute.ts, Workroom.tsx, RelationshipRoom.tsx,
brainLane.ts (prompt composition), workroom.css.
- [ ] F-CG1: a complete covenant line stages (or one-tap confirms), never re-elicits; an
      out-of-catalog test is NAMED, not silently re-asked.
- [ ] F-CG2: amendment-in-place proven with tests ("actually make it 1.30x", "no, quarterly", "on
      the construction loan instead").
- [ ] Collateral elicitation end to end (asset, value, lien; never ask advance rate / lendable).
- [ ] Plan-level dedupe: a line touching something already STAGED amends that entry.
- [ ] Channel-none parity for all of it.
- [ ] Renew + new-facility routes + relationship room: same grammar, honest per-route handoff.
- [ ] Phase 2: fees, borrowers/involvements, policy exceptions on the same engine.
- [x] Addendum written, MERGED f3da638, published label create-grammar. Founder re-drive pending.
- [ ] Plan-fixes batch (E1/E4/E5/E7/E8/E3 from the everything-plan drive) - RUNNING.
- MOVED TO B: inline the doctrine. It was briefed here, slipped when the agent was killed, and
  by founder decision lands with the transport switch as one build, never as a standalone
  Bedrock step.
Depends on: nothing. Blocks: B (same files).

### Stream B - The sample channel + latency ladder  [S, becomes M if latency proves out]
Status: SPEC ONLY (design/SAMPLE-CHANNEL-SPEC-20260901.md). Not started.
Files: brainLane.ts (transport), a new tools module (channel/brainTools.ts), the router tiering in
dispatch.ts, capabilities declaration at publish.
- [ ] Move the brain lane transport from gateway Bedrock to `sample` (viewer's own Claude).
- [ ] Router picks the rung: 0 parse / 1 local read / 2 model envelope-only / 3 model + tool.
- [ ] Two narrow read-only tools: current Boom ratios, covenant-type catalog. Live Salesforce read
      only on evidence a line needs it. READS ONLY, the write fence is absolute.
- [ ] `quick` tier for restatement, `default` for judgment. Thinking pulse + Stop.
- [ ] Degrade parity: declined consent / null / rate-limit / timeout = today's behavior.
- [ ] Capabilities declaration: restate the FULL mcp manifest (servers + tools) alongside sample,
      or connector access is revoked at publish. Reconstruct from SERVERS/TOOLS in mcp.ts.
- [ ] **THE GATE, founder in the panel:** measure quick first-token and full time (10 lines,
      median + worst), default same, one rung-3 end to end, consent cost, and the OVER-CALL RATE.
      Numbers decide. If quick is slow or over-call is high, the booth stays on the gateway.
Depends on: A merged (shares brainLane.ts + dispatch.ts). Sequential after A.

### Stream C - Relationship room live verification + fixes  [M]
Status: NEVER TESTED live (founder said so). Five routes exist, re-clothed over staged flows.
Files: RelationshipRoom.tsx, relBrain.ts, reviewFlows.ts (fixes only AFTER A merges).
- [ ] Drive all five routes joint with the founder: annual review, covenant review, collateral
      valuation, risk-rating review, service request. Stage + execute each against the org,
      SOQL verify, revert to Hartwell baseline. Tools in knowledge/sf-build-v2/tools/, NEW_PKG env.
- [ ] The design call from the drive: "override the risk grade to a 4" now asks the desk instead
      of refusing OVERRIDE_NOT_FILEABLE locally. Decide: keep the deterministic refusal local.
- [ ] Case.Type / Case.Origin picklists never read off the org (backlog B.10): probe, decide chips.
- [ ] The two open founder calls: "Latest package" = primary not max-by-date (multi-package books);
      tier folds when a door is taken.
- [ ] Multi-package relationship (backlog E.18): seed a second package, review the combined beat.
Depends on: testing can start NOW (org-side, joint); code fixes after A merges.

### Stream D - Dynamic book: open ad hoc clients  [S]
Status: idea recorded in the handoff (2026-09-01 founder ask). Not started.
Files: channel/sync.ts (extend load-not-just-refresh), a new hydrate module, App-level loading
choreography, name flight. LOW collision with A (does not touch the workroom shell).
- [ ] "open relationship XYZ" for any org account: Customer360SearchAccounts -> Snapshot + pane
      reads -> hydrate a NEW client into the running cockpit through the channel.
- [ ] Loading choreography + name flight; the in-book deep-link path stays as is.
- [ ] Verify the chat-initiated variant (the session says "open Brightwater" and the panel loads it).
- [ ] Honest degrade: not found / not authorized / channel-none.
Depends on: nothing structurally; verify against A's shell after A merges. Can run in parallel
with A in its own worktree.

### Stream E - Live artifact: auto-sync layer 2  [S]
Status: layer 1 exists (mcp capability + Sync on demand). Layer 2 not started.
Files: channel/sync.ts, a poller, TopBar freshness stamp, odometer roll on changed figures.
COLLIDES with D on sync.ts -> D and E are ONE stream or sequential.
- [ ] Channel-gated poll interval while connected, last-refreshed stamp, changed figures roll,
      silent on channel-none, static host stays snapshot-honest.
- [ ] Booth moment: change the org, watch the cockpit tick over itself. Rehearse it.
Depends on: D (same file). Sequential after D, or fold into D's worktree.

### Stream F - Collateral origination + the remaining org arms  [S for collateral, C for the rest]
Status: backlog B.5-B.9. Each = Apex + BOTH guards + deploy with 3 test classes + live probe + revert.
Files: Apex (StageExecuteLoanModification + C360WriteGuard.cls) AND transitionAllowlist.ts
(BOTH-GUARDS rule, one commit), plus the shell wiring in the workroom (after A).
- [ ] B.8 Collateral asset UNPLEDGED create (the chain today always terminates in a pledge).
      Founder said "collateral origination" - this is it. Proposal-only today.
- [ ] B.7 Covenant-on-account create (relationship-level covenant, no loan junction).
- [ ] B.9 Risk-rating grade override wired end to end (the input carries
      LLC_BI__Overridden_Risk_Grade_Value__c).
- [ ] B.5 Withdraw modification (governed invocable over the proven revert logic).
- [ ] B.6 Amend v1 = withdraw + re-stage pre-loaded.
- [ ] The everything-plan org probe (all seven wire families, one token, one execute) - the
      headline regression proof, never yet attempted. Joint with founder.
Depends on: Apex + guards can be built in PARALLEL now (separate files from A). Shell wiring
after A merges. Org deploys and probes are joint with the founder (never autonomous).

### Stream G - Test infrastructure + the consolidated report  [M]
Status: probe suite exists; ritual module cannot answer the new route question (14 leaves missing).
Files: design/probes/** only. ZERO collision with anything.
- [ ] Teach the ritual probe the route question + the entry choreography (3 proposed leaves:
      entryTierOnStage, entryTierFadedCount, entrySummonPresent) so the gate is a real gate again
      instead of "no NEW fails".
- [ ] Reconcile the baseline story: compare.mjs reports 98 pre-existing dummy-vs-live FAILs on every
      build; the handoff's "9 directed leaves" accounting is stale. Decide the honest gate and
      write it down.
- [ ] Playwright client sweep on the final assembled artifact: every mechanism through the UI, both
      rooms, KEYBOARD-DRIVEN nav retest (focus rings exist now).
- [ ] The headless drive harness (stubbed gateway door, parses envelope after CONTEXT:) promoted
      from *.tmp.mjs to a committed, reusable acceptance runner with the founder's line set.
- [ ] Safari / real-device pass (booth = MacBooks; -webkit-backdrop-filter pin unverified).
- [ ] One consolidated test report into knowledge/ -> all-green or named exceptions.
Depends on: nothing. Runs in parallel with everything. Re-runs after every merge.

### Stream H - Handover to the Claude Shannon instance (GitHub + plugin market)  [M]
Status: not started. Must be LAST to finalize but can start the skeleton now.
Files: README, docs/, client-360/ (plugin assets), knowledge/ handoff docs. Low collision.
- [ ] Repo hygiene: remove the 20+ merged worktrees, delete merged branches, no stray files,
      artifact template committed at the seal.
- [ ] Plugin assets synced (scripts/sync-plugin-assets.mjs guards it) and the plugin manifest
      current; WORKROOM-BRAIN.md pack current; skill definitions current.
- [ ] A fresh SESSION-HANDOFF written for the receiving instance: state, release chain, the
      traps (release-chain trap, both-guards, engine fence, pkill self-match, hook metachars,
      artifact publish guard, Chrome-extension-cannot-test-artifacts), backlog, testing script.
- [ ] Demo-day runbook: fresh claude.ai session per drive, connectors attached, demo org tab
      pre-authed, the exact lines that work, the recovery moves if something stalls.
- [ ] Ownership boundary doc per 2026-07-25 (credit memo = Noland's MCP through whichever door;
      cockpit never rebuilds it; cmdk rows as the cheap home for spreading + credit memo entries).
- [ ] GitHub org transfer + plugin market listing (founder-driven; ownership, listing copy,
      versioning).
Depends on: everything else landed. Skeleton now, finalize Thursday.

### Stream I - Live plugin latency + real-model proof  [M]
Status: the live-model contract has NEVER been driven in a real panel. All verification so far
used a scripted stand-in for the model.
Founder-driven in the panel (only the founder's session has the connectors).
- [ ] The four-line live proof on the CURRENT build (fresh session, IDB Gateway attached):
      "bump the big revolver by five million" / rate+index honesty / three-clause line / "which
      covenant has the least cushion". Degrade count, hallucinated figures (must be zero).
- [ ] After B: the latency measurement gate (see B).
- [ ] After A: re-drive the founder's create-grammar lines in the panel.
Depends on: A for the grammar lines, B for the ladder numbers. The four-line proof can run NOW.

### Parked (not before the booth unless the above is safe)  [C]
- Addendum 2 port: the self-demoing director (~70s) from the dummy into React. Booth-worthy but
  a mint-scale port; founder decision pending.
- Design round 2: collateral sections (compact facility-row pattern), financials diagrams (Boom
  revenue/EBITDA/IS - verify line items exist), extra actions placement (cmdk rows).
- Cleanup: actions SHEET variant UI, C360WriteGuard.CREATE_ONLY dead constant, doc-lag fixes.
- The 10 artifact comments from 2026-08-27 (pre-mint): several answered by today's work, the
  rest fold into the polish brief.

---

## 3. THE SCHEDULE (honest)

**Mon night (now):** A fix agent running. G can start (probes, zero collision). H skeleton.
**Tue:** A verified + merged + published by the integrator. Then B starts (sample channel).
D (dynamic book) and F-Apex (collateral origination arm) start in parallel worktrees. C testing
joint with the founder in the morning (org-side, no code collision). I: the four-line live proof.
**Wed:** B built -> the latency gate in the founder's panel; the numbers decide gateway vs sample
for the booth. C fixes land. D lands. E if D is clean. F shell wiring after A.
**Thu:** FREEZE new features by noon. Full re-drive (G's sweep + the founder's line sets in both
rooms + the everything-plan org probe), consolidated report, handover docs finalized, repo clean,
artifact republished at a sealed label, pushed, handed over.
**Sept 4-15:** live testing in the panel, polish, Safari pass, rehearsal, the demo-day runbook.

**What is at risk for Thursday:** B (sample channel) is the biggest unknown - it may not prove out,
and that is fine: the gateway + inlined doctrine is a legitimate booth path. D+E (dynamic book +
auto-sync) are the best demo moments but the most new surface; they land Thursday only if A is
merged Tuesday. F beyond the collateral arm is post-booth. If Thursday slips, it slips on B/D/E,
never on A/C/G/H/I - those are the floor.

---

## 4. What "Disney on ice" means as acceptance

- Both rooms, every route: the founder's line sets produce the right card first time, no hollow
  creates, no silent drops, no contradictions between narrative and chip.
- Zero hallucinated figures in the live-model proof. Zero unwanted org writes.
- Latency: rungs 0-1 instant; a fuzzy line a short pause with a visible pulse; a call-out an
  honest wait with a reason and a Stop. No frozen cards, ever.
- The everything-plan probe passes once, verified by SOQL, reverted clean.
- Entry choreography and the empty lane hold; census 0 violations; the probe gate is a real gate.
- Handover: a stranger with the handoff doc can run the release chain and the demo-day runbook
  without asking a question.
