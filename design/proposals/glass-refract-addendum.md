# Refractive glass: the addendum

Branch `glass-refract`, cut from `main` at b116cf9. Built, gated, shot and filmed; NOT merged, NOT
released, NOT published as an artifact. The compare page is the decision.

Three modes, after three rounds of founder feedback on 2026-09-03:

- `?refract=1` (or `#refract`): **ON**. The bend on every glass surface, the workroom pane
  included, plus the pane's depth pass and the ground band.
- `?refract=2` (or `#refract2`) is kept as an alias of 1, so every link already written still lands.
- `?refract=3` (or `#refract3`): **LIQUID**. Clearer glass, an edge lens, chromatic fringe at the
  rim, a ground that drifts, a specular sweep.

`window.c360Refract(on, liquid)` flips the same classes live for an A/B in one tab.

## The two links

- Compare page, OFF vs ON vs LIQUID, motion first: <https://bot.connectry.io/s/a78773385799/>
- Live build: <https://bot.connectry.io/s/2127d57e4bbb/?refract=1> (also `=2`, `=3`).
  Without the query the page is today's cockpit plus the ground band, and nothing else.

## Round 1's finding, which drove everything after it

The first pass measured a mean pixel difference of **0.5/255 on the two surfaces that worked and
0.0 to 0.07 on the other four**, and the founder could not see the glass on the compare page. Two
reasons, and only one of them was a tuning problem:

1. **A still cannot show a bend.** The bend is the relative motion between the backdrop and the
   glass. Frozen, it is a texture; moving, it is a thickness. The compare page now leads with nine
   four-second clips, three scenes across three modes, and the stills come after them.
2. **The cockpit ground is flat by design,** so on four of six surfaces there was nothing behind the
   glass to bend. Fixed by the ground band below.

## The ground, and the lines that are not on it

The round-two build put four coarse violet strands behind both views. The founder killed them on
sight:

> "I love the overlay of the workrooms, but I do not like the background we have for the main
> pages. I hate those thick lines. I like the lines in the header as we have right now, but not
> everywhere."

**They are gone. Not thinned, not faded: removed.** `buildBand()` is deleted from
`app/src/data/weave.ts`, the strands are out of the component, and the rule that replaces them is
worth writing where the next person will find it: **the header weave is the one sanctioned place
for ambient linework, and the page ground gets none, at any alpha.** `buildThreads` and the landing
weave are byte-for-byte what they were before any of this started.

What is left is `components/GroundSheet.tsx`: a fixed, inert mount point that in liquid mode holds
two drifting blooms, and in every other mode holds nothing.

### The blooms, tuned

| | round 2 | now |
|---|---|---|
| teal | 620x420 at 22% / 30%, alpha **.13** | same geometry, alpha **.06** |
| violet | 700x460 at 78% / 68%, alpha **.11** | same geometry, alpha **.05** |
| drift | 78s, transform only | unchanged, plus a 30s idle park |

**How much colour they put on the page.** Same frame, blooms shown against blooms hidden: **0.63 of
255 across the whole client viewport**, and **1.18 over the bare left margin** where no content
covers them. The same strip measured 2.43 at .13/.11. They now sit within half a step of the
canvas's own sanctioned teal at .04.

**Large and soft, not small and tight.** Four tighter arrangements were measured. Tighter blooms
give more bend per unit of colour on paper (a 6-bloom set at .05 returned 2.27 on the satellites for
0.39 of canvas colour, against 5.08 for 1.18), but a 300px blob reads as a graphic on the page and a
620px wash reads as light in the room. The canvas already carries two large soft radials; these are
two more.

**The hero did not make it, and no lines went back in to fix it.** The brief set the bar at roughly
1.5 of 255. The satellites clear it at 4.78 and the rail chips at 4.18. **The client hero comes in
at 0.56.** Three other bloom placements were measured against exactly that problem, including
lifting a bloom to sit behind the hero and adding a third one there: they returned 0.28, 0.53 and
0.40, all worse. The hero is a 1128px pane and a 620px soft bloom has a shallow gradient across it;
its crop is also mostly its own opaque content. That is the number, and it stands.

## ON, as it now ships

Unchanged from round 1 except for three things.

1. **The workroom pane is on the bend by default** (founder, after seeing it: "for the workroom I
   really liked it so far"). `eg-refract-pane` survives as the selector and is now set by every
   refract mode, so an old `?refract=2` link and the live helper both keep working with no second
   code path.
2. **`#eg-refract-soft` scale 14 -> 22.** At 14 the chips measured 0.02/255 against the ground,
   which is not a bend, it is a rounding error. 22 is the most a 34px pill takes before its corners
   start to travel.
3. **The pane's depth pass**, below.

The filters are otherwise the round 1 sheet:

```
#eg-refract        panes, bar, rail, hero, chat, cmdk
  feTurbulence      fractalNoise  baseFrequency 0.006  numOctaves 2  seed 7
  feGaussianBlur    stdDeviation 3
  feDisplacementMap scale 36  xChannelSelector R  yChannelSelector G  in SourceGraphic
  feComposite       displaced OVER SourceGraphic          <- the fringe fix

#eg-refract-soft   chips, satellites, pills
  feTurbulence      fractalNoise  baseFrequency 0.01   numOctaves 2  seed 7
  feGaussianBlur    stdDeviation 2
  feDisplacementMap scale 22  xChannelSelector R  yChannelSelector G  in SourceGraphic
  feComposite       displaced OVER SourceGraphic
```

CSS recipe, unchanged and still the one place it is written:

```css
backdrop-filter: blur(B) saturate(S);                    /* Safari keeps this  */
backdrop-filter: url(#eg-refract) blur(B) saturate(S);   /* Chromium takes this */
```

`B` is half the surface's own `--eg-blur`. The halving is not a taste call: a 30px to 38px frost
averages the backdrop flat before the eye can read structure in it, and a bent flat field is still a
flat field.

## The pane's depth (founder: "a bit more depth would be appreciated")

In ON and in LIQUID both. **Every piece of it is outside the inset list**, so the census still counts
three.

| | what | why |
|---|---|---|
| a | `--eg-drop: 0 40px 120px -30px rgba(16,4,30,.45), 0 2px 6px rgba(0,0,0,.12)` | one shadow can be the distance from the page or the contact, never both; a slab with only the wide one looks pasted on |
| b | `.wk-room::after`, 2px gradient border, white .60 top-left to ink .12 bottom-right, masked with `mask-composite: exclude` | CSS has no gradient border-color; a pseudo-element carries no box-shadow, so the census never sees it |
| c | pane-scoped `--glass-rim` with the bottom inset at `rgba(0,0,0,.16)` | still exactly three lines; the thickest glass in the cockpit gets the deepest edge |
| d | `.wk-scrim` 16% -> 10%, `body.wk-open #root` pre-blur 3px -> 1px, opacity .85 -> .92 | the pre-blur was flattening the backdrop before the pane ever saw it, so the bend had nothing to act on |
| e | 1 to 2 degree parallax of the pane's inner content | **NOT built.** It was flagged optional-if-cheap and it is not cheap: it needs a scroll listener and a transform inside the room's own components, which is new machinery on the most expensive surface in the app for the least legible of the five effects. Say the word and it goes in. |

## LIQUID, as built

`html.eg-refract.eg-liquid`. All five, together.

**1. Clearer glass.**

| | ON | LIQUID |
|---|---|---|
| sheet tint | .55 to .66 white | **.30** |
| chip tint | .66 to .70 | **.35** |
| pane tint | .56 | **.34**, plus a top-to-bottom gradient white .34 -> .06 -> 0 |
| message column | none | left-to-right gradient white .34 -> .30 -> .10 |
| sheet frost | 15 to 19px | **9px** |
| chip frost | 14 to 15px | **7px** |
| pane frost | 15px | **10px** |

**2. The edge lens.** Real glass does almost nothing in the middle of a pane and everything at the
rim. A uniform turbulence field is the opposite of that, which is why ON reads as a texture rather
than as a thickness. The rim mask is built INSIDE the filter, so it stretches to whatever element
takes it and nothing has to know its own shape.

**It was an `feMorphology` erode until round three and that cost half the frame.** A naive erode
samples radius-squared pixels each, so radius 18 is about 1300 samples per pixel over a filter
region 120 percent of a full-viewport pane. Measured on the client page: **315 ms/frame with the
erode, 190 with a Gaussian blur of the source alpha in its place, and the two rings are not tellable
apart.** Blur the alpha, subtract the blurred copy from the sharp one, and what is left is the same
soft ring, zero in the interior, about a half at the border, zero outside.

```
                                                  #eg-liquid      #eg-liquid-soft
life pass    feTurbulence bf / blur / scale        0.006 / 3 / 10  0.010 / 2 / 6
rim field    feTurbulence bf / blur                0.004 / 4       0.008 / 2.5
rim mask     feGaussianBlur SourceAlpha sd         10              3.5
             feComposite SourceAlpha OUT blurred  -> the soft ring
```

The heavy throw is composited THROUGH that ring and dropped over the lightly bent centre, which is
how the scale gets to be 66 at the edge and 10 in the middle without `feDisplacementMap` ever having
to take a per-pixel scale, which it cannot.

**3. Chromatic aberration.** `feColorMatrix` isolates channels, each set is displaced at its own
scale against the same rim field, `feBlend screen` recombines them. Where they land on top of each
other the colour reconstructs exactly; where the throw is large they separate, so the fringe appears
only at the rim.

**The big filter splits two ways, not three.** The third channel is one more full-region
displacement pass and it measured **190 ms/frame against 141** on the same page, for a fringe
nobody reported being able to tell apart. `#eg-liquid-soft` still splits three ways, because its
region is a 34px pill and the pass it adds is free.

```
scales R / GB                                      66 / 52
scales R / G / B, chips                            26 / 22 / 18
close        feComposite heavy IN rim -> OVER life -> OVER SourceGraphic
```

**Two composites close it, not one.** The life pass can smear its own 10px of transparent edge
before the ring is ever applied, so the result goes over the lightly bent image AND then over the
untouched source.

**4. A ground that moves, and nothing else.** Two blooms, teal .06 and violet .05, on a 78s
`eg-drift` loop. Transform only, because a moving background-position repaints the layer every frame
and a transform does not. No linework, at any alpha; see the ground section above.

**5. The specular sweep.** A 104 degree white streak, 16 percent at its peak, 900ms ease, once on
mount and once per hover. Never loops: a looping highlight is a screensaver, not a material. It
lives on `::before` of six named surfaces (`.wk-room`, `.hero`, `.topbar`, `.arcbtn`, `.wk-ent`,
`.whisper`), each checked for a free pseudo-element first, rather than on the surfaces' own
`background`, which on the hero already carries two radials the sweep would have erased. Hover
replays it as a transition rather than a second animation, because an animation cannot be restarted
from CSS without taking the element out of the flow.

Both the drift and the sweep are killed under `prefers-reduced-motion`, and both park under
`html.eg-idle`: thirty seconds with no pointer, key, wheel, scroll or touch, or a hidden tab, and
`GroundSheet.tsx` sets the class. **Be honest about what that buys:** liquid measured 141 ms/frame
with the drift running and 139 with it stopped dead. The frame cost is the lens, not the animation.
The park stops a real GPU recompositing twelve backdrop-filtered surfaces forever while nobody is
looking, which is a battery argument rather than a frame-rate one, and it is still right.

## The numbers

Mean absolute pixel difference against the OFF frame, over R, G and B, out of 255. The "with lines"
column is the build the founder rejected, kept so the cost of removing the strands is visible rather
than asserted.

| surface | ON | LIQUID, with lines | LIQUID now |
|---|---:|---:|---:|
| whole client page | 0.03 | n/a | **0.74** |
| whole landing | 0.02 | n/a | **0.66** |
| arc satellites | 0.05 | 8.08 | **4.78** |
| manifest rail chips | 4.00 | 4.19 | **4.18** |
| client hero | 0.05 | 1.37 | **0.56** |
| top bar, book scrolled under it | 0.44 | 3.87 | **2.70** |
| workroom pane | 5.52 | 5.05 | **4.84** |
| pane corner, 2x crop | 4.64 | 4.92 | **4.65** |
| greeting card (solid, rule 23) | 3.44 | 5.06 | **5.18** |

**The lens alone**, each mode measured against itself with the `url()` stripped out of every
`backdrop-filter`:

| surface | lens alone, ON | lens alone, LIQUID |
|---|---:|---:|
| top bar | 0.27 | 0.29 |
| workroom pane | 0.20 | 0.13 |
| manifest rail chips | 0.04 | 0.09 |
| arc satellites | 0.05 | 0.22 |
| client hero | 0.03 | 0.06 |
| pane corner | 0.31 | 0.36 |

The liquid lens is gentler than it was in round two (the bar read 0.63 there) because it now splits
two channels instead of three and rings with a blur instead of an erode. That is the trade the speed
pass bought, and it is priced on the page.

**Two findings that survive all of it.**

1. **ON is flat on the main pages and cannot be fixed from the ground.** 0.03 across the whole
   client page. Its 15 to 19px frost averages a 6-percent bloom away before the displacement runs.
   Nothing that is quiet enough to leave the canvas alone is loud enough to survive that frost.
   Small glass needs a thin frost, not a bigger displacement.
2. **The client hero is at 0.56, under the 1.5 bar**, and no linework went back in to close it.

## Speed

rAF counter, medians of three runs, headless Chromium on a 4 core box with no GPU. The absolute
numbers are pessimistic on that hardware; the ratios are the signal.

| ms / frame | landing idle | landing scrolling | client idle | client scrolling |
|---|---:|---:|---:|---:|
| OFF, frost | 16.6 | 18.1 | 55.4 | 48.2 |
| ON, bend | 19.2 | 76.4 | 60.9 | 49.1 |
| LIQUID, round two | 82.4 | 96.3 | 326.4 | 339.0 |
| **LIQUID now** | **56.9** | **75.0** | **149.4** | **146.8** |

### It was never the doors

The founder read the slowness as the runtime doors waiting on `claude.use()`. Measured before
anything was changed: the share build with no `window.claude` at all boots and answers in tens of
milliseconds. 313 ms to the load event over the wire, 97 ms to the worklist, 50 ms to the client
page, 9 ms to the arc, 90 ms to the workroom greeting. There was no ten second wait to remove,
because all three acquisitions already return the moment `window.claude` is missing:
`if (!root) return`.

**The boot change that was made, and what it is worth.** `main.tsx` now mounts FIRST when
`window.claude` is undefined and runs the three acquisitions behind the paint, instead of awaiting
three promises that cannot resolve to anything. It removes a microtask hop and a scheduler turn
before the first pixel; it is a few milliseconds, not a second. The watch is re-armed once the doors
settle, for the one case the branch cannot rule out, a runtime that injects itself after the
document has parsed, and `startIntentWatch` returns its existing unsubscribe when it holds one, so
the second call is free.

**When `window.claude` exists nothing changed.** The awaited path is character for character the one
it always was, deliberately: a runtime that IS there must settle before first render or
`mcpAvailable()` lies for a frame. The three `acquire*` functions were not touched at all.

### It was never the drift either

Stopping the bloom drift dead changed the frame cost by nothing: **141 ms/frame with it running, 139
with it stopped.** Stepping it (2/s, 1/s) made no difference either.

### It was the lens, and it was two primitives

On the client page, liquid measured **395 ms/frame with its own lens, 52 ms with the ON lens in its
place, and 36 ms with no `url()` at all.** The blur level barely mattered (338 ms at 15px against
395 at 9px). Inside the lens, one variant per row, same page, same counter:

| lens chain | ms / frame |
|---|---:|
| as it was: morphology erode 18, three channels | 315 |
| blur rim, three channels | 190 |
| morphology erode 18, one channel | 308 |
| **blur rim, two channels (shipped)** | **141** |
| blur rim, one channel | 105 |
| blur rim, one channel, no life pass | 61 |

A cheap fringe built from `feOffset` instead of a second displacement was measured too and came out
at 191: on a software rasteriser every extra full-region primitive costs 25 to 40 ms whether it
resamples or not, so there was nothing to win there.

## Legibility on liquid glass

Measured, not eyeballed: the glyphs are hidden, the backdrop that was under them is photographed,
and the contrast is taken against the **worst five percent** of that backdrop rather than its
average. A mean flatters glass; a reader meets the worst spot. State: the room mid-conversation over
the client page, which is the busiest backdrop the cockpit can produce.

| text | OFF | ON | LIQUID | AA needs |
|---|---:|---:|---:|---:|
| room body copy, 13px / 400, on the pane | 9.67 | 9.67 | **7.78** | 4.5 |
| room title | 15.26 | 15.89 | **15.82** | 4.5 |
| earlier-steps chip, 11px / 600 | 5.24 | 5.48 | **5.02** | 4.5 |
| field label inside a proposal card | 17.40 | 17.40 | **17.40** | 4.5 |

Everything clears AA. The narrowest margin is the earlier-steps chip at 5.02:1, the smallest type in
the room on the thinnest glass in the room; it clears AA and does not clear AAA, which was already
true before liquid (5.24:1). It came up from 4.86 when the blooms came down to .06/.05. The pane's gradient and the message column's gradient exist precisely so
the body copy never has to live on 34 percent white alone.

## The rim, and the census

Reworked in round 1 for thickness, still exactly three inset lines:

| | before | after | why |
|---|---|---|---|
| top | `0 1px 1px rgba(255,255,255,.95)` | `0 1px 0 rgba(255,255,255,.98)` | the lit edge, crisp rather than a 1px smudge |
| bottom | `0 -1px 1px rgba(255,255,255,.35)` | `0 -1px 0 rgba(0,0,0,.10)` | the shadow side of the slab, which did not exist before |
| ring | `0 0 0 1px rgba(255,255,255,.28)` | `0 0 0 1px rgba(255,255,255,.22)` | dropped so the new dark bottom is not washed out |

The pane scopes its own copy of the same three with the bottom at .16. The dark outer hairline is
untouched everywhere.

Census, live, all three modes: **13 backdrop-filter surfaces, 12 at three rims, `.arclbl` at one as
always, 12 dark hairlines, zero rim violations, zero white borders, 12 surfaces refracting** in ON
and in LIQUID.

## Edge artifacts

The fringe fix is the last primitive in every filter and it is the reason the corners are clean.
Displacement samples outside the backdrop image, and outside it there is transparent black, which
shows up as a see-through or smeared band along the edges and in the rounded corners. Compositing
the displaced result back OVER the undisplaced source fills exactly those pixels with the original
backdrop. It is geometry-independent, so a 999px pill and a 22px pane both get it without either one
knowing its own shape.

Liquid throws 52 to 66px at the rim, which is where a filter goes wrong, and it closes with **two**
composites for that reason. The rim mask changed from an erode to a blur in round three, so the
corner crop is also the proof that the ring is still a ring. The pane's top left corner was shot at 2x in all three modes and is on
the compare page: no fringe, no smear, radius intact, bevel and both shadows reading.

`.eg-glass-micro`, the 7px-radius narrator sliver, stays off the bend and off the lens in both modes.
At that radius a 10px rim mask has nowhere to land, which is the same geometry that already exempts
it from the triple rim.

## The motion clips

Twelve, four scenes across three modes, four seconds each, Playwright `recordVideo` at 1360x900 and
25 fps, converted to h264 mp4 with ffmpeg. **`deviceScaleFactor` does not raise the recording
resolution**, because Playwright captures at viewport size, so the clips are 1x while the stills are 2x.

- **a** the landing headline scrolling under the top bar
- **b** the client page itself, hero and bar and satellites in one scroll, which is the scene the
  ground question is actually about
- **c** the workroom pane with the client page scrolling behind it. The room locks the page scroller
  while it is open, so the probe unlocks it for the length of the clip; the clip is about what the
  glass does to moving content, not about what the room does to the scrollbar, and the compare page
  says so.
- **d** the rail, two committed cards deep, riding over the pane and the hero

The weave is pinned in all three modes for every shot and clip (a CSS rule beats an SVG presentation
attribute, so the rAF loop goes on writing into a void). Without that pin, two runs of the same mode
differed by more than the modes differ from each other. In the clips the ground drift and the sweep
are left running, because they are two of the five things liquid is.

## The performance gate

3 second rAF counter while text is appended to the room's last agent bubble every frame, medians of
three runs, headless Chromium, 4 core box, no GPU.

| workroom pane | fps | ms/frame |
|---|---:|---:|
| backdrop-filter removed entirely | 14.4 | 69 |
| today, frost 30px | 9.3 | 108 |
| bend + 15px | 6.3 | 159 |

The pane never reaches 50 fps on this box in ANY mode, the no-glass floor included, so the 50 fps
rule cannot be cleared on this evidence, which is what made the number unusable as a gate rather
than what made the bend expensive. The founder took the call on 2026-09-03 after seeing it and the
pane ships on the bend. Liquid runs three more displacement passes than ON on every surface and is
the most expensive of the three by some distance; it has not been re-measured, because the same box
would produce the same unusable answer.

## Chromium only

WebKit rejects `url()` inside `backdrop-filter` and drops that declaration, so Safari and every iOS
WebKit keeps a plain frost and never sees the bend or the lens. That is deliberate: it is the whole
reason the plain declaration sits directly above the `url()` one in every block, and the order
between them is load-bearing. In liquid the WebKit fallback is a clear 9px frost with the tint, the
ground band, the drift and the sweep, but no displacement, which is still a visible mode, not a
broken one. The `-webkit-` line stays plain for the same reason it exists at all: pre-18 WebKit reads
only that property and would reject the `url()` too. Firefox supports reference filters in
`backdrop-filter`; untested here.

## Gate

`npx tsc --noEmit` clean. `npx vitest run`: 108 files, 3165 tests, all passing. `npm run build`
green, 1,379,047 bytes, inside the 1.5 MiB budget. Release chain NOT run, artifact NOT published, NOT
merged to main.

## Open, for the founder

1. **The client hero sits at 0.56 of 255**, under the 1.5 bar, and the instruction was not to add
   lines back to close it. It is the one surface the blooms cannot reach: a 620px soft bloom has a
   shallow gradient across a 1128px pane, and the crop is mostly the hero's own opaque content. If
   it matters, the levers left are the hero's frost (10px would do it) or the hero's tint, not the
   ground.
2. **ON is flat on the main pages, 0.03 across the whole client page**, and cannot be rescued from
   the ground: its frost averages away anything quiet enough to leave the canvas alone. If liquid is
   the direction, ON is a step on the way rather than a mode anyone would choose.
3. **Liquid still costs about 2.7x frost per frame** on the client page (149 against 55 ms,
   headless, no GPU) after a 55 percent cut. The remaining lever is the life pass, which is worth
   another 44 ms and would make the middle of a pane a window rather than glass. It has not been
   taken.
4. **Liquid's ground blooms carry a violet radial at .05**, which is rule 21's subject. It is
   quieter than the round-two version by half and inside the canvas's own ambient budget, but it is
   still purple on the ground and it is still a call.
5. **Pane parallax** (depth item e) is still not built.
