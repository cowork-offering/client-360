# WS3: the founder's UAT of the ticket flow (2026-08-25, branch `ws3-ticket-ux-pass`)

Seven findings from a live drive of the Client Actions ticket flow, five in the first pass (F1-F5)
and two added mid-wave (F6, and a concrete regression case behind F3/F4). All seven are UX and
honesty findings on the cockpit's own surface except one, which is a real defect in what the
effective challenge computes.

Nothing was deployed, no Apex was touched, no org was contacted, nothing was published. Every shape
below is read out of `artifact/live-data.json`, `artifact/sample-data.json` and the archived
envelopes.

## The findings, and what each one turned out to be

| # | The founder's reading | What it actually was |
|---|---|---|
| F1 | "the package header and facility list read dense and weird" | The deal had no name, so it was named by concatenating its members — on Hartwell that is three loan names, each beginning with the borrower's own name, followed by "and 3 more". The member rows below repeated the same prefix six times, ended in an ISO timestamp, and carried the stage as a fourth clause in a sentence of figures. The raw package record id sat in the middle of the metadata line. |
| F2 | "what should i do with this information?" | The card led with the FIGURE NAME ("pro-forma collateral coverage"), then the arithmetic, then one affordance: Decline. There was no verdict, no severity, no accept, and no statement of what the panel was for. |
| F3 | "it still shows the old timestamp after a Sync" | Real defect. The engine ran on the LIVE-MERGED bundle and stamped every card with `data.meta.generatedAt`, the instant the BAKED bundle was assembled. Two different facts travelling together as if they were one. |
| F4 | "raw contract paths render to the banker" | `borrower.covenants.covenants[].actualValue is present but null · Customer360Covenants`, verbatim, on Hartwell. Plus `productPackageId is required` on the covenant ticket, the package record id in the deal header, and a rule-id slug on every declined check. |
| F5 | "the amount should prefill and read from X to Y" | The previous wave had deliberately left the amount EMPTY, because a prefill equal to the current figure satisfies the org's at-least-one-change rule while asking for nothing. The founder wants the prefill; the hazard is now caught by name instead of avoided. |
| F6 | "show the selected members' collateral context too" | The ticket showed the covenant position and never the collateral position, though the read stages every pledge with its share, advance rate and lien. |
| F3/F4 case | "the revolver HAS a borrowing base covenant and the card denies it" | Real defect, and a second one. Two reads carry the junction — `Customer360Exposure.facilities[].loanCovenants[]` and `Customer360Covenants.covenants[].attachedLoans[]` — and the rule consulted only the first, which the live read leaves null on every facility. It then reported an ABSENT list as an EMPTY one and stated, as a fact, that no covenant attaches to a facility that plainly has two. |

## What changed, per finding

### F1 — the ticket leads with the deal, and its members read as rows

| File | Change |
|---|---|
| `app/src/actions/schemas.ts` | `packageRecords` returns a NAMED deal (`<relationship> credit package`) instead of a member concatenation; the metadata line is members, committed and drawn and nothing else; the record id is off it. New `packageLabel` distinguishes two packages on one relationship by the products booked on each. The facility field's labels are shortened, its stage moves to `optionChips`, its maturity is formatted, and `optionAmounts` carries each member's committed figure. |
| `app/src/data/facilityStage.ts` | New `shortFacilityLabel` / `shortFacilityName`: drop a leading relationship-name prefix, but ONLY where an explicit separator follows it. |
| `app/src/actions/panelSchema.ts` | `PanelField` gains `optionChips` and `optionAmounts`. |
| `app/src/components/DealTicket.tsx` | `DealHeader` renders the name as an `h4` headline, one metadata line, and the record id behind a toggle. `MultiSelectRows` renders checkbox, member name, stage chip, one figures line. |
| `app/src/actions/dealTicket.ts` | The N=1 commitment delta names the member by its short label rather than its full nCino name. |

The naming is a DERIVATION and is documented as one: no `Product_Package__c` name is staged anywhere
in the read. The header's provenance chip and its record-reference toggle both point at the id.

### F2 — the effective challenge asks for a decision

| File | Change |
|---|---|
| `app/src/actions/suggestionEngine.ts` | `Suggestion` gains `verdict` and `severity`. Verdicts are derived from the same arithmetic as the trigger: a breached covenant is `critical`, a cushion or coverage shortfall is `warning`, the junction carryover is `info` because nothing about it is wrong. |
| `app/src/components/ActionPanel.tsx` | The panel is headed "Effective challenge" with a one-line intro (`CHALLENGE_PANEL_INTRO`). Each card leads with a severity chip and the verdict, then the detail sentence, then two affordances: **Acknowledge and continue** (primary) and **Decline with reason** (secondary). Acknowledging records the instant into ticket state and collapses the card to its verdict plus "acknowledged". A declined check is named by its verdict, never by its rule id. |

Acknowledging is ACCEPTING: an acknowledged finding still contributes to the plan's stated rationale.
Only a decline removes it, and a decline still requires a reason.

### F3 — the challenge quotes the read the ticket is using

| File | Change |
|---|---|
| `app/src/actions/suggestionEngine.ts` | New `DataFreshness` on every suggestion: the instant, whether a live sync supplied it, and which of the rule's own sections that sync did NOT refresh. `EngineContext` takes `liveStoredAt` and `liveSections`; `RULE_SECTIONS` declares what each rule reads. New `freshnessSentence` renders it in banker language, and `bundleAsOf` gives the panel one instant on the same rule. |
| `app/src/data/format.ts` | New `fmtInstant`, pinned to UTC and stating so: a freshness claim must not read differently in London and Atlanta. |
| `app/src/components/ActionPanel.tsx` | Computes `liveStoredAt` / `liveSections` from the same overlay the merged bundle comes from, and passes the SAME values to the confirm-gate recompute — otherwise the drift check would report "data replaced" on every synced ticket. |

Three sentences for three different facts: never synced, synced, and synced but not in every section
the rule reads. The third is the "only available baked" case the brief asked for.

### F4 — nothing on the ticket speaks in contract paths

| File | Change |
|---|---|
| `app/src/actions/suggestionEngine.ts` | `NamedGap` gains `note`, the only part that renders inline. Every gap the engine can emit carries one, written by the rule that raised it because only that rule knows what the missing figure meant. `path`, `sourceSystem` and `detail` are unchanged and are now explicitly technical. |
| `app/src/actions/schemas.ts` | `PACKAGE_ANCHOR_REQUIRED` rewritten in banker language; the wire field name moves to the new `PACKAGE_ANCHOR_TECHNICAL`. |
| `app/src/actions/panelSchema.ts` | `PanelField.gap` gains `technical`. |
| `app/src/components/ui.tsx` | New `TechnicalToggle`: a small labelled affordance carrying the detail on its `title` and on expand. |
| `app/src/components/DealTicket.tsx`, `ActionPanel.tsx` | The gap note, the ticket's blocking-gap banner and the deal header's record id all render through it. |

The Hartwell sentence the founder read is now: *"The last test of Term Covenants carries no measured
value, so its cushion could not be computed."* The path is one click away and unchanged.

### F5 — the amount reads from -> to, and the deal is selectable

| File | Change |
|---|---|
| `app/src/actions/schemas.ts` | `newCommitment` prefills from the client's ask, else from the CURRENT commitment of the member the ticket opened on, with `NCINO_RECORD` provenance citing that member. New `MODIFICATION_NO_MOVEMENT` refuses a plan whose only change is the amount it already carries — and only when every selected member's commitment is known and equal to it, so an unknown figure is silence rather than a refusal. |
| `app/src/components/DealTicket.tsx` | New `FromToRows`: one row per selected member, `from -> to`, appearing once an amount is entered. A member with no commitment on file is listed with that said plainly and no arrow. `DealHeader` renders a real package selector (a `role="group"` of buttons) when the relationship carries more than one package, and the headline alone when it carries one. |
| `app/src/policy/policyPack.ts` | The demo pack's label is now "Demo policy pack (WS2 policy layer pending)". `version` stays `demo-2026-07` for the ledger and the drift check; `Suggestion.policyLabel` is what renders. |

### F6 — the security behind the selected members

| File | Change |
|---|---|
| `app/src/actions/dealTicket.ts` | New `securityContext(bundle, selection)`: per selected facility, its pledges as name, description, facts (type, lien, primary) and figures (share pledged here, advance rate, lendable in total), plus the facility's own pledged share. `coverageBasis` carries the relationship's lendable collateral — the SAME numerator the coverage check divides by the commitment. |
| `app/src/components/DealTicket.tsx` | New `SecurityRows`, rendered for the modification and renewal tickets under the from -> to reading. Its footer states the coverage numerator, so the ratio on the challenge card above and these rows are visibly one calculation. |

Honest gaps, three of them and three sentences: an EMPTY pledge list says the facility carries no
collateral; an ABSENT one says the read does not carry its security; and where the org supplies its
own `coverageNote` that reason is rendered rather than paraphrased.

### F3/F4 concrete case — the junction carryover

`ruleJunctionCarryover` now takes the UNION of `facilities[].loanCovenants[]` and
`covenants[].attachedLoans[]`, deduplicated, scoped to facilities this read actually stages, and
named rather than only counted. Where NEITHER read carries the field it emits a named gap — "this
read does not say which covenants are attached to the individual facilities" — instead of an
all-clear the data does not support.

On the live Hartwell bundle the card now reads: *"2 loan-level covenant attachments carry onto the
new facility. 2 loan-level covenant junctions clone onto the new facility: Accounts Receivable on
Line of Credit - $15,000,000.00; Term Covenants on Construction - $12,000,000.00."* It previously
read "No loan-level covenants are attached to this facility", which was false.

**No fixture extension was needed.** `artifact/live-data.json` already carries
`attachedLoans: [{ loanId: "a4Zbb0000027MaYEAU", ... }]` on the Accounts Receivable covenant, and
`loanCovenants: null` on every facility. The new test file asserts both shapes off the published
file before it asserts anything about the render, so the regression cannot be masked by a fixture
drifting away from the data.

## Two corrections this wave makes to earlier decisions

1. **The amount prefill.** `ws3-side-findings-modticket.md` §2 recorded that `newCommitment` "no
   longer prefills from a facility's own commitment", with the reason: it satisfies the org's
   at-least-one-change rule while asking for nothing. The founder has now asked for the prefill and
   the from -> to reading. The reason was correct and is not discarded — it is enforced by
   `MODIFICATION_NO_MOVEMENT` instead of by an empty field.
2. **The coverage figure's name.** With no proposal on the table the denominator is the committed
   exposure on file, not a proposed commitment, so the card no longer calls that figure "pro-forma"
   and no longer says coverage "would" fall. Both wordings exist and each is used on its own basis.

## UNVERIFIED

1. **No live call was made, and no browser was driven.** Every assertion here is against the
   published data files, archived envelopes and the deployed Apex source, exercised through jsdom.
   The founder's own reading of the rebuilt ticket has not happened yet.
2. **The multi-package path is untested against real data.** No borrower in either data file stages
   more than one product package, so the package selector, the disambiguating label and the
   selection-clearing behaviour are covered by constructed bundles only.
3. **`freshnessSentence` on a partially-synced read is covered by unit and UI tests, not by a real
   sync.** The overlay the F3 UI test restores is the same shape `syncSweep` writes, but a real
   sweep was not run: there is no org contact on this branch.
4. **The junction union is a CLIENT-SIDE reconciliation of two reads.** The org resolves the real
   junction set itself. Where both reads are silent the ticket now says so; where they disagree, the
   union is deliberately generous, on the same reasoning the covenant scoping already documents.
5. **`securityContext` reads the pledge rows the exposure read stages.** It does not re-derive
   lendable value and does not sum `currentLendableValue` across pledges — that is the double count
   NCINO-FUNCTIONAL-VALIDATION §2.6 names. The footer quotes the org's own
   `totalUniqueCollateralLendableValue` where the read carries it.
6. **The deal name is a derivation, not an org field.** `<relationship> credit package` is composed
   by the cockpit. If a package name is ever staged, this is the one place to change.
7. **The acknowledgement is session state.** It is recorded in the ticket and collapses the card; it
   does not travel to the decision ledger, and nothing on the wire carries it.

## Evidence

| Gate | Before | After |
|---|---|---|
| `npm ci` (clean room, `node_modules` deleted) | ok | ok |
| `npm run typecheck` | clean | clean |
| `npm test` | 55 files, 1521 tests, all pass | 56 files, 1584 tests, all pass |
| `npm run contrast` | all pass (33 checks) | all pass (54 checks) |
| `npm run build` | ok | ok, `dist/cockpit.html` 678,454 bytes |
| `node app/scripts/release-artifact.mjs` | not run | promoted, marker verified |
| `node app/scripts/assemble-artifact.mjs` | not run | `/tmp/c360-publish.html`, 807,367 bytes, 5 borrowers, slot verified |
| `node scripts/sync-plugin-assets.mjs` | not run | template + both data files synced |

Nothing was published.

Test movement, +63 across five files plus one new file:

| File | Before | After | What the new ones prove |
|---|---|---|---|
| `actionPanel.ui.test.tsx` | 117 | 136 | headline size and the single metadata line; the record id behind its toggle; every member row's checkbox, name and stage chip; the panel intro; verdict-then-detail-then-decisions order; the acknowledge flow collapsing one card and not the other; a declined check named by verdict; the baked freshness line, the synced one, and the partially-synced one restored through the real overlay path; a five-ticket leak sweep over six leak families, with the completeness view open; the from -> to rows at N=1 and N=2; no selector on a single-package relationship; the prefill and the standstill refusal |
| `modTicket.render.test.tsx` | 26 | 35 | the deal named rather than concatenated; the metadata line without the id; two packages told apart by product; the banker sentence and the technical string on the package gap; the shortened member labels and the near-miss that must NOT be shortened; the stage chip; the prefill from the implied member, its absence when no figure is staged, the no-movement refusal, its silence on an unknown figure, and `optionAmounts` |
| `actions/suggestionEngine.test.ts` | 36 | 52 | verdicts and severities for all four cases; the proposed-versus-current basis wording; the policy label beside the policy id; freshness baked, live, partially live, and no false drift across one read; a banker `note` on EVERY gap the engine can emit, asserted against a path/tool/wire regex; the junction union from either side, deduplicated, scoped, named, and the absent-is-not-empty gap |
| `actions/dealTicket.test.ts` | 45 | 52 | the security rows' name, facts and figures; the coverage numerator; empty versus absent versus the org's own reason; silence with no selection; unresolvable ids dropped |
| `uxPassLive.render.test.tsx` | — | 12 | NEW. The whole pass against the live-shaped Hartwell bundle: the data's own shape first, then the junction card naming both attachments, the null-covenant sentence, zero leaks, the freshness line, the six-member layout, and the security rows including the coverage connection |
| `actions/selectionSteps.test.ts` | 13 | 13 | assertion updated: the stage is a chip, not a clause |
| `actions/ws05Envelopes.test.ts` | 47 | 47 | assertion updated: the deal is named as a deal |

Three contrast failures were found by the new checks and fixed rather than waived: the technical
toggle at `--ink-faint` fails 3:1 on the warning banner (2.97) and on the deal header's accent wash
(2.76), and the header's metadata line at `--ink-muted` fails 4.5:1 on that wash (4.35). The toggle
now carries `--ink-muted` and the metadata line `--ink-body`. Twenty-one new checks pin every new
pairing, including all three of those.
