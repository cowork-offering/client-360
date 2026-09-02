# Proposed addendum: the manifest rail is a bounded ledger

**Status: PROPOSAL, not contract.** Built on branch `rail-scroll` from the founder's 2026-09-02
call. Nothing in `design/HANDOVER.md`, `design/DIRECTION-LOCKED.json` or `design/dummy/` was
touched, and the engine fence (`app/src/workroom/**`, tree
`91c751e427232bf2b62c14b9cf92921e497496c9`) is byte-identical. The rule text in section 6 is the
wording proposed for the mint AFTER the founder confirms the built behaviour on screen.

Date: 2026-09-02 · Rooms: Facility Actions (`Workroom.tsx`) today, Relationship Actions
(`RelationshipRoom.tsx`) on adoption.

---

## 1. The complaint this answers

> "When the committed cards on the manifest rail get many (13 to 15 entries), the rail is CUT OFF."

Two things were wrong, and they were the same thing twice.

**The lane grew with its content.** `.wk-col-r` is absolute at 74px from the room's top with no
bound, and `.wk-room` clips. Measured on the built artifact at `4bcb809`, 1280x640, seventeen
staged changes: the last chip's bottom edge sat at **666px** against a room bottom of **626px**.
Forty pixels of ledger behind the room's own edge, with nothing to say it was there.

**The fold was hiding the rest anyway.** `RAIL_VISIBLE = 6` folded the oldest entries into a peek,
so at seventeen changes the lane read six chips and "↑ 11 earlier in the manifest". Ten of every
fifteen were one click away rather than one glance away. The fold was the old answer to the same
overflow, and it answered it by removing the content.

## 2. What was built

**A shared primitive: `ManifestRail`** (`app/src/components/rail/ManifestRail.tsx`,
`app/src/styles/rail.css`).

| Part | What it does |
|---|---|
| the frame | `.wk-col-r:has(> .rail)` is capped at `calc(100% - 96px)` of the room, so the ledger stops 22px short of the room's bottom edge whatever the content does |
| the head | `.wk-man-h` stays OUTSIDE the scroller. "14 changes · 5 of 6 members" is the whole manifest, always, however far the chips have travelled |
| the viewport | `.rail-vp`, one bounded scroller, `overscroll-behavior: contain`, momentum on touch, `scrollbar-gutter: stable` so growing past the cap never shifts the stack sideways |
| the edges | a `mask-image` fade of 26px at the top and 30px at the bottom, on `@property`-registered lengths so it eases in and out; each edge appears ONLY when that direction is holding content back |
| the bar | thin, and transparent until a hand or a keyboard is on the rail, then a `rgba(20,19,24,.16)` thread on nothing. Never a grey gutter |
| the landing | the newest entry is scrolled into view as it lands, `smooth` normally and `auto` under `prefers-reduced-motion` |
| the keyboard | `role="region"`, `tabIndex=0`, arrows step one chip (58px), Page steps a viewport, Home and End go to the ends (WCAG 2.1.1: a scroller a mouse alone can move is a wall) |

**The fold is retired.** `RAIL_VISIBLE`, `railFolded`, the `.wk-railfold` control and the
`ManifestList` peek are gone. Every entry is on the rail; each chip keeps its own peek.

**No `scroll-behavior: smooth` on the viewport, deliberately.** It makes every `scrollTop` read
return the position mid-animation, so two arrow presses in a row both computed their step from ~0
and the second undid the first (measured: two ArrowDown presses moved 58px, not 116px). The one
moment that should glide asks for it explicitly, in `scrollTo({ behavior })`.

## 3. What it measures

Built artifact, `--disable-dev-shm-usage --disable-gpu --no-sandbox`, fourteen changes staged
through the room (commitment x4, term, maturity, rate, covenant, two carry exclusions, party add,
fee, policy exception, payment schedule).

| | main `4bcb809` | `rail-scroll` |
|---|---|---|
| chips in the lane at 14+ staged | 6, plus "↑ 11 earlier in the manifest" | 14 |
| 1280x800 rail scrollHeight / clientHeight | 494 / 494, `overflow: visible` | **1311 / 618, overflowing** |
| 1280x640 last chip bottom vs room bottom | 666 vs 626 (**clipped by 40px**) | 599 vs 626 (**27px of air**) |
| count line | "17 changes · 6 of 6 members" | "14 changes · 5 of 6 members", pinned |
| composer / Review & execute | visible | visible, unmoved |

## 4. How the relationship room adopts it

The relationship room already renders the same anatomy: `.wk-col-r` > `.wk-man-h` head +
`.rl-fold` hint + `.wk-ents` stack (`RelationshipRoom.tsx`, around line 1640). Adoption is one
wrap and one deletion, and it is deliberately NOT done on this branch: the room is being rebuilt on
`relationship-v2` and this branch does not touch `app/src/components/relationship/**`.

```tsx
import { ManifestRail } from "../rail/ManifestRail";

{laneRows.length > 0 && (
  <ManifestRail
    heading={laneHeading}
    count={`${laneRows.length} ${laneRows.length === 1 ? "answer" : "answers"}`}
    label={`${laneHeading} · ${laneRows.length} answers`}
    newest={laneRows[laneRows.length - 1]?.key ?? null}
    action={<button type="button" className="wk-dt" onClick={...}>Scope</button>}
  >
    {laneRows.map((row) => ( /* the existing .wk-ent chip, unchanged */ ))}
  </ManifestRail>
)}
```

Three notes for whoever does it.

1. **Drop `laneFolded` and the `.rl-fold` hint with the wrap.** The rail carries every row; a fold
   on top of a scroller is two answers to one question.
2. **Pass the whole set to `children`**, not `laneRows.slice(laneFolded)`.
3. **The head keeps its own classes.** The primitive owns the frame, not the typography: it renders
   `.wk-man-h` / `.wk-kicker` / `.wk-c`, which both rooms already dress from `workroom.css`. That is
   why `relationshipRoom.render.test.tsx`'s `.wk-man-h` assertions keep passing through adoption.

Until it adopts, the relationship lane is untouched: the cap is written as
`.wk-col-r:has(> .rail)`, so a lane without the primitive keeps its old unbounded behaviour rather
than silently gaining a clip with no way to reach past it.

## 5. What this does NOT fix

**The narrow pane still hides the lane entirely.** `@media (max-width: 1080px)` sets
`.wk-col-r { display: none }`, which predates this work. Measured at 900x700 with fourteen staged:
the room is intact, the composer and the "14 changes on the manifest · Review & execute" chip are
both visible and carry the count, and the manifest itself is reachable only through that chip. If
the artifact's demo pane is under 1080px wide, the banker never sees the rail at all. That is a
layout call for the founder, not a scroll bug, and it is left alone here.

## 6. Proposed rule text

> **THE MANIFEST RAIL IS A BOUNDED LEDGER (2026-09-02).** The lane's frame is the ROOM's, never the
> content's: capped at the room's height less 96px, so the ledger stops short of the room's edge and
> the thread, the composer and the Review & execute chip never move to make room for it. The head is
> pinned OUTSIDE the scroller and states the whole total ("14 changes · 5 of 6 members") however far
> the chips have travelled. The chips scroll under it: momentum on touch, a thin glass thread of a
> bar that is invisible until a hand or a keyboard is on the rail, a soft mask fade only on the edge
> actually holding content back, the newest entry brought into view as it lands, and arrows, pages
> and ends on a focusable region. Never a fold, never a hard cut, never a grey gutter. One primitive,
> both rooms.

**Relationship to law 5 ("nothing in the room scrolls").** The law's census reads `workroom.css` and
holds the THREAD to one scroller with no visible bar. That law is about the thread and it stands
unchanged. The rail is a bounded ledger, not a conversation, and the founder asked for it to scroll.
Its stylesheet lives with the primitive because the primitive is shared by two rooms, not to dodge
the census; if the mint takes this addendum, law 5's wording should be narrowed to say so out loud.
