# Joint session tweak list (2026-09-01, founder live run)
1. ASSIST CHAT THINKING STATE: chat panel (landing + client) is silent between send and answer.
   Dummy contract: breathing > goo mark as the thinking indicator (rule 46 sanctions the mark for
   chat FAB + send + THINKING; rule 65.4 breath recipe). Wire it to the chat store's pending
   state in ChatPanel.tsx. Word-by-word arrival for the ANSWER too if the dummy's chat does it.
2. ARC TOO FAR FROM THE MARK (4 satellites): the four kept the 5-arc's first offsets on r=118,
   which reads distant and lopsided. Fix: tighten the 4-satellite arc radius to ~96-100px
   (rule 49's original radius), respread evenly across the quarter keeping the ~46px
   neighbor rhythm feel, recompute offsets, update probe targets + INTENT-OVERRIDES
   post-mint section. Seed-circle origin follows the moved button.
3. ARC SCRIM: on FAB open, fade in a subtle dark backdrop so satellites read over busy
   content pages. Use the cmdk dim family for coherence: radial gradient anchored
   bottom-right, rgba(16,4,30,.12) center fading to transparent, ~.3s ease both ways,
   pointer-events none except closing on click (outside-click already closes). Elegant,
   barely-there; dies under reduced motion (instant, no fade).
4. IDENTITY CHIP CLIPPED (bug): hovering the first chip/bubble at the top of the thread cuts
   off the AGENT identity chip (-21px above the bubble hits the thread's top edge/fade mask).
   Fix: guarantee headroom for the first thread item (top padding when it is first, or
   overflow-safe zone above item 0) so the -21px chip always renders whole.
5. ROUTING CHIPS DECLUTTER (founder taste): the question's chips read busy. (a) Option chips
   in ONE row, tighter, more elegant. (b) The why/explainer affordance leaves the chip row
   entirely: becomes a small quiet "?" icon button, top-right of the question bubble,
   PERFECTLY aligned (same corner geometry as the bubble radius), ink-3 hover wash, opens
   the explanation. Less going on in the row.
6. SUGGESTION SOURCES WIDEN: founder expected overdue items etc. as opening suggestions.
   (a) NOW, from data we already carry: OVERDUE covenant tests (currently deliberately
   excluded by nextMove) become a suggestion tier - phrasing like "The DSC test is N days
   overdue." with an appropriate action chip; check what else the bundle honestly carries
   (EWS/breach signals on distressed clients). Engine fence: nextMove.ts is engine territory -
   this extension goes through the normal stop-and-ask if it needs nextMove changes, else a
   router-side derivation from the same payload. NO fabrication.
   (b) LATER (agent layer, round 2+): emails/outstanding correspondence - data does not exist
   in the bundle today; needs the org/MS365-grounded agent. Do not fake it now.
6b. CORRECTION (founder): emails ARE wired - the artifact declares the Microsoft 365 connector,
    reachable through the page's MCP channel in a live panel session. Implement email-grounded
    suggestions NOW, elegant + same style as the routing suggestion:
    - On room open (or client entry), the room asks the channel for recent client correspondence
      (sender domain / known contact match, unanswered threads, age). Async: the suggestion
      arrives as a quiet second line + chip when signal exists, e.g. "2 emails from Hartwell
      await a reply, oldest 6 days." [Open the thread] - same pill language, one line, never
      a list, never blocking the routing question.
    - Honest states: no m365 channel or no signal = NOTHING renders (no placeholder, no
      spinner); errors are silent to the banker. Never fabricate correspondence.
    - Discipline: max ONE email suggestion; the deal-derived (maturity/overdue) suggestion
      stays the lead; email is the quiet second voice.
7. INELIGIBLE FACILITY MUST BE DISABLED (bug + rule 30 principle): the Proposal-stage loan
   (Hartwell's $3M Equipment, non-roll-eligible 7th member) is currently selectable in the
   facility rows. Fix: facility rows for non-eligible members render VISIBLE BUT DISABLED -
   greyed (ink-3, no hover lift, cursor default), small quiet reason on hover/title
   ("Proposal stage - not modifiable"), never selectable. Drive the disabled state from the
   SAME eligibility the engine computes (roll-eligible set), not a parallel rule. Also check
   the row spacing to the composer while in there (founder: "stays pretty close to chat bar").
8. THREAD COMPACTNESS NOT PRESENTING (fidelity gap, rules 29+31): founder sees the FULL chat
   accumulate; dummy contract = ONE live exchange, prior steps collapse behind "(n) earlier
   steps" chip, top fade mask, past dims to 45%, no visible scrollbar. The mint implemented
   this (threadFit deleted, step model built) but in the live run the collapse/fade is not
   kicking in - likely every interaction is landing in one ever-growing step (collapse
   triggers on SEND starting a NEW step; the router question flow may be accumulating into
   step 0, and 'a step holding an open card is never collapsed' may be pinning it). Verify
   against the dummy beat-for-beat: send -> prior collapses -> fade -> compact. Fix the step
   boundary logic in the router-fronted flow.
9. ADVISORY/WARNING CHIP COLOR "TRASHY" (founder taste, strong): in the multi-loan flow the
   coverage-thins advisory renders chips whose color the founder hates. Re-cut per the
   system's own non-negotiable "status as typography, never pill soup": chip surface goes
   NEUTRAL (white/surface-2, standard hairline, no colored fill, no tinted background),
   the warning lives ONLY in the text ink (the amber ink on the label/figure) plus at most
   a quiet leading icon. Sweep the WHOLE room for colored-fill chips while in there - any
   tinted-fill status chip gets the same treatment. Elegance = ink carries the meaning,
   the surface stays calm.
9b. Confirmed by founder: the TERM CHANGE chips carry the same offending treatment - included
    in the tweak-9 sweep (all delta/advisory chip types: coverage, term, rate, maturity,
    whatever else wears a tinted fill -> neutral surface, ink-only status).
10. READ QUESTIONS GET REAL ANSWERS (founder catch, canonical demo-loop failure):
    "which borrowers have we already in the package?" got the parser's refusal boilerplate
    despite the bundle holding all 21 involvements. Fix, two layers:
    NOW (deterministic): (a) recognize common READ intents in the room (which/who/what/list/
    show + borrowers|guarantors|entities|members|structure|covenants|fees|collateral) and
    answer from the BUNDLE: compact card of the borrowing structure (role-grouped involvements
    per facility, type-icon language), then a guided follow-up ("Who should be added, and on
    which facility?") that flows into the EXISTING involvement-add op. (b) Rewrite the clarify
    copy in banker language - "no member I hold and no field I file" is parser-speak; refusals
    name what the room CAN do in plain words with examples.
    EVIDENCE: this is the flagship justification for the workroom agent layer (indexed agent
    reads any question, grounded in the package) - founder predicted exactly this loop.
11. QUESTION MISPARSED INTO A STAGED DELTA (worse than 10 - confidently wrong):
    "what covenants are against this Product Package" -> the free-field wave matched
    field="Product", value="Package" on the LoC and staged a Term change delta card
    ("today's value is not staged in this read" jargon included). Fixes:
    (a) QUESTION GUARD: interrogative shapes (what/which/who/how/is/are/do we/have we...,
        or trailing '?') NEVER produce deltas - they route to the read-intent path (tweak 10)
        or an honest can't-answer with the structure offered. Hard rule, before any matcher.
    (b) FIELD-WAVE TIGHTENING: a field change requires an assignment shape (field + explicit
        new value with a verb like set/change/make/to), never two colocated nouns.
    (c) Covenants read-intent: answer from the bundle (covenant junctions + account covenants,
        thresholds, status) as a compact card - same treatment as borrowers in tweak 10.
    (d) Jargon sweep: "recorded rather than filed", "rides the plan as a handoff",
        "not staged in this read" - all banker-unreadable; rewrite.
    NOTE: the human confirm gate held (no write possible without Confirm) - the safety story
    worked; the intelligence story is what needs the agent layer + these guards.
11b. Second founder repro, worse: the longer covenant question got field="Product" with the
     VALUE being the entire 15-word tail of the sentence including the question mark
     ("package with information and what exisiting covenants do i have against this
     relationship i can use ?"). Confirms the field-wave takes everything after the matched
     label as the value with no shape validation. Add to 11(b): VALUE BOUNDS - a staged value
     must look like a value (number, date, short picklist-ish phrase, <=5 words, no
     interrogatives, no '?'), else refuse to the honest path. Both founder transcripts saved
     as regression fixtures for route/parse tests.
12. VIEW-IN-NCINO LINKS (founder, post-execute): (a) the result dossier's "Written to nCino"
    line links to the new package record (lightning/r/LLC_BI__Product_Package__c/<id>/view);
    (b) quiet "Open in nCino" affordance on the client hero (the account) and possibly facility
    detail. Instance URL resolved at runtime from the session/bundle meta, NEVER hardcoded
    (standing My Domain rule). Batch 2 - the dossier already carries the package id.
13. WITHDRAW MODIFICATION (founder backlog, medium): governed org-side action to withdraw an
    un-booked version - Apex arm wrapping the proven revert logic (delete version + graph,
    orphan-aggregate sweep), guard: only staging-created versions, only pre-approval,
    audit-logged, its own confirm ceremony in the room/activity.
14. AMEND BEFORE APPROVAL: v1 = withdraw + re-stage with the prior plan PRE-LOADED in the
    composer (compose from 13 + existing staging). True in-place amend = later design.
15. MODIFICATIONS IN THE ACTIVITY TRAIL (founder catch, batch 2): workroom executions must
    land in the client's Activity timeline like panel actions do (A30) - sourced from the
    cm_Action_Staging__c records (plan summary, approver, timestamp, outcome, link to the
    version). The audit data exists; the surfacing is missing.
