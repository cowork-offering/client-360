# Proposed addendum: the entry choreography

**Status: PROPOSAL, not contract.** Built on branch `entry-choreo` from the founder's intent capture
(`design/ENTRY-CHOREOGRAPHY-INTENT-20260901.md`). Nothing in `design/HANDOVER.md`,
`design/DIRECTION-LOCKED.json` or `design/dummy/` was touched. The rule text below is the wording
proposed for the mint AFTER the founder confirms the built behaviour on screen.

Date: 2026-09-01 · Rooms: Facility Actions (`Workroom.tsx`) and Relationship Actions
(`RelationshipRoom.tsx`) · Engine fence untouched.

---

## 1. The complaint this answers

Entering an action put the routing question, the product package header and the whole facility list
on screen in one frame. The banker read three tiers at once and decided on none of them. This is the
morning's "content is earned" law (the empty lane) moved from the room's at-rest state to its ENTRY.

## 2. What was built

**Three tiers, one grammar, both rooms.**

| Tier | Facility room | Relationship room |
|---|---|---|
| `question` | the opening bubble: what are we doing | the opening bubble: which review is this |
| `identity` | the product package card, the anchor the action runs against | the review's scope brief (covers / produces) |
| `detail` | the facilities, as the strip of uniform rows | the first collected question |

**The sequence.** The room opens on the question and NOTHING under it. The tiers below are not
hidden at that point, they are unwritten: no node exists for them. Once the route is bound the
identity blends in; a beat later (620ms) the detail blends in, the facility rows staggered at the
same 45ms cadence the odometer's columns and the pane anchors already use.

**The exits.** As each tier arrives the tier above it LEAVES THE STAGE: `wk-tier-out`, 520ms, the
arrival run backwards with the word-speech's blur on it (opacity to 0, 6px rise, scale .985,
blur 4px). No hard cut, no instant unmount, no new motion vocabulary. When the exit completes the
tier collapses out of layout but stays MOUNTED.

**Nothing is lost.** A retired tier carries `data-tier-state="faded"` and `aria-hidden="true"`, and
one quiet control in the thread ("show what the room read (n)") brings every one of them back. The
same control, the same words, in both rooms. Opening the earlier steps brings them back too, so
there are never two competing gestures for the same intent.

**Reduced motion is an instant swap.** No leaving beat, no stagger, no animation: the tier above
goes straight to faded the moment the next one arrives.

## 3. Proposed rule text (for the mint, on founder confirm)

> **Rule 68 - the entry choreography.** Entering an action reveals its content in three tiers:
> the question, then the identity the action runs against, then the thing being decided on. A tier
> below the one on stage is never rendered before it is earned. As each tier arrives the tier above
> it leaves the stage in the Electric Glass exit (`wk-tier-out`, 520ms, fade + 6px rise + blur;
> never a hard cut, never an unmount). A tier that has left the stage stays mounted, carries
> `data-tier-state="faded"`, and is summonable by one quiet control. Under `prefers-reduced-motion`
> the swap is instant and nothing animates. Both rooms, one grammar.

## 4. Contract consequences to settle at mint

1. **An absence contract must read `data-tier-state`, never node count alone.** "Faded out" and
   "gone" are two different readings and the DOM now says which one it is: a tier that was never
   earned has no `[data-tier]` node at all; a tier that retired has one, hidden. Six presentation
   tests already assert absence for the empty lane; the entry tiers need the stronger predicate.
2. **New probe leaves.** The probe suite has nothing for the entry states. Proposed leaves:
   `entryTierOnStage` (which tier carries `data-tier-state="on"` at rest),
   `entryTierFadedCount`, `entrySummonPresent`. Not added here - the probe baseline is a contract
   file and this is a proposal.
3. **The census.** `.wk-tier` and `.wk-summon` carry no `backdrop-filter`, so neither enters the
   glass census and `glassRimViolationCount` is unchanged by construction. NOT re-measured on a
   browser in this pass - see "what was not done".
4. **Law 3 (the opening view under sixty words)** gets STRONGER, not weaker: retired tiers are
   `aria-hidden`, so the word walk skips them.

## 5. Judgement calls made, flagged for the founder

- **The opening bubble retires too.** The founder's spec names the question as tier one; a room
  opened with the route already bound (a cmdk row, a deep link) has no question, but its opening
  bubble carries the greeting and the position and is still the tier above the package. It retires
  on the same rule, so the grammar is one grammar rather than two. If the greeting should persist,
  that is a one-line change.
- **The relationship room's tier two is the scope brief, tier three the first question.** That room
  has no package header and no facility list. The mapping above is the honest reading of "the tier
  the banker is deciding on"; the founder may prefer the scope brief to stay on stage through the
  whole collection.
- **The summon is one control for all retired tiers, not one per tier.** Bringing back the package
  without the question, or the reverse, was more machinery than the gesture is worth.
- **The summon hides while the earlier-steps history is open**, because the history already shows
  everything and two controls saying the same thing is the busyness this change exists to remove.
- **A multi-package book stops at tier two.** The facilities belong to whichever package is taken,
  so the detail tier waits for the choice. Unreviewed on a real multi-package relationship (backlog
  item F.18 seeds one).

## 6. What was NOT done

- No probe leaves, no probe baseline change, no `INTENT-OVERRIDES` entry: those are contract files.
- No browser census run and no Playwright pass: the numbers in this document are from the code and
  the unit suite, not from a rendered page. The founder's confirm should be on screen.
- No release chain, no publish, no push.
