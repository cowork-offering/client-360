# Refractive glass: the addendum

Branch `glass-refract`, cut from `main` at b116cf9. Built, gated, shot and filmed; NOT merged, NOT
released, NOT published as an artifact. The compare page is the decision.

Three modes now, after two rounds of founder feedback on 2026-09-03:

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

## The ground band (shipped)

`buildBand()` in `app/src/data/weave.ts`, rendered by `components/GroundBand.tsx`, mounted once in
`AppShell` as a fixed sheet behind both views.

| | |
|---|---|
| strands | 4 |
| stroke | 6 to 10px (`6 + rnd()*4`) |
| alpha | 0.03 to 0.05 |
| colour | `CORE` `#A100FF` |
| motion | none, on purpose |
| seed | 20260903, its **own** LCG |

**It is a separate function, not a branch inside `buildThreads`, and that is not a style
preference.** `buildThreads` is a transcription of the dummy's generator whose draw ORDER is the
picture; one extra `rnd()` inside it moves all twelve filaments and the port would render a
different landing while passing every count-shaped probe. The band runs its own generator and cannot
perturb the mint.

**It is a GROUND, not a band inside the landing weave, and that is the correction the proposal
needed.** The proposal in round 1 said "add a coarse band to `buildThreads`", on the assumption that
the weave is what sits behind the hero and the chips. It is not. The landing weave exists only on
the landing, and the hero's copy of it (`.hero-weave`) is drawn *inside* the hero's glass at z -1,
so the hero has never had a backdrop worth bending. A band added to `buildThreads` alone would have
changed nothing on the client page, where three of the four flat surfaces live.

**How visible is it on the open canvas?** Same page, band shown vs band hidden, refraction off:
**0.10 of 255 on the landing, 0.07 on the client page.** Below the threshold at arm's length, which
was the brief.

**It is present in every mode, not gated on `eg-refract`.** Both sides of every comparison on the
page therefore carry the same canvas and the only variable is the filter. Gating it would have
inflated every ON and LIQUID number with a canvas change.

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

```
                                                  #eg-liquid      #eg-liquid-soft
life pass    feTurbulence bf / blur / scale        0.006 / 3 / 10  0.010 / 2 / 6
rim field    feTurbulence bf / blur                0.004 / 4       0.008 / 2.5
rim mask     feMorphology erode radius             18              6
             feGaussianBlur stdDeviation            9              3
             feComposite SourceAlpha OUT eroded  -> a soft ring the erode radius wide
```

The heavy throw is composited THROUGH that ring and dropped over the lightly bent centre, which is
how the scale gets to be 56 at the edge and 10 in the middle without `feDisplacementMap` ever having
to take a per-pixel scale, which it cannot.

**3. Chromatic aberration.** `feColorMatrix` isolates R, G and B; each is displaced at its own
scale against the same rim field; `feBlend screen` recombines them. Where the three land on top of
each other the colour reconstructs exactly; where the throw is large they separate. The throw is
only large at the rim, so the fringe is only at the rim. That is the physics and it is also the
cheap way.

```
scales R / G / B                                   64 / 56 / 48    26 / 22 / 18
close        feComposite heavy IN rim -> OVER life -> OVER SourceGraphic
```

**Two composites close it, not one.** The life pass can smear its own 10px of transparent edge
before the ring is ever applied, so the result goes over the lightly bent image AND then over the
untouched source.

**4. A ground that moves.** The band above, plus `.ground-blooms`: teal at .13 and violet at .11,
on a 78s `eg-drift` loop. Transform only, because a moving background-position repaints the layer
every frame and a transform does not. It is the answer to the honest complaint about ON, which is
that the bend only announces itself while something is being scrolled.

**5. The specular sweep.** A 104 degree white streak, 16 percent at its peak, 900ms ease, once on
mount and once per hover. Never loops: a looping highlight is a screensaver, not a material. It
lives on `::before` of six named surfaces (`.wk-room`, `.hero`, `.topbar`, `.arcbtn`, `.wk-ent`,
`.whisper`), each checked for a free pseudo-element first, rather than on the surfaces' own
`background`, which on the hero already carries two radials the sweep would have erased. Hover
replays it as a transition rather than a second animation, because an animation cannot be restarted
from CSS without taking the element out of the flow.

Both the drift and the sweep are killed under `prefers-reduced-motion`.

## The numbers

Mean absolute pixel difference against the OFF frame, over R, G and B, out of 255. Same method as
round 1, so the columns are comparable to it.

| surface | ON, round 1 | ON now | LIQUID |
|---|---:|---:|---:|
| top bar, book scrolled under it | 0.55 | 0.44 | **3.87** |
| workroom pane over the client page | 0.53 (only at `?refract=2`) | **5.51** | **5.05** |
| manifest rail chips | 0.07 | **4.00** | **4.19** |
| arc satellites | 0.03 | 0.05 | **8.08** |
| client hero | 0.06 | 0.12 | **1.37** |
| greeting card (solid, rule 23) | 0.00 | **3.44** | **5.06** |
| pane corner, 2x crop | n/a | **4.64** | **4.92** |

**And the honest split.** Most of the ON column is the recipe around the lens (the pane promotion,
the halved frost, the two drop shadows, the lighter scrim), not the lens. Each mode measured against
*itself with the `url()` stripped out of every `backdrop-filter`* isolates what the displacement
alone contributes:

| surface | lens alone, ON | lens alone, LIQUID | factor |
|---|---:|---:|---:|
| top bar | 0.27 | 0.63 | 2.3x |
| workroom pane | 0.20 | 0.23 | 1.1x |
| manifest rail chips | 0.04 | 0.09 | 2.4x |
| arc satellites | 0.05 | 0.68 | 13.8x |
| client hero | 0.05 | 0.24 | 5.1x |
| pane corner | 0.31 | 0.71 | 2.3x |

**The finding that survives all of it:** the arc satellites and the hero still read as nothing at
ON. The ground band did not rescue them there, and the reason is the frost, not the throw. At ON's
15px the band is averaged away before the displacement runs; at LIQUID's 7px the same band is the
loudest thing in the crop. Small glass needs a thin frost, not a bigger displacement.

## Legibility on liquid glass

Measured, not eyeballed: the glyphs are hidden, the backdrop that was under them is photographed,
and the contrast is taken against the **worst five percent** of that backdrop rather than its
average. A mean flatters glass; a reader meets the worst spot. State: the room mid-conversation over
the client page, which is the busiest backdrop the cockpit can produce.

| text | OFF | ON | LIQUID | AA needs |
|---|---:|---:|---:|---:|
| room body copy, 13px / 400, on the pane | 9.67 | 9.67 | **7.78** | 4.5 |
| room title | 15.26 | 15.89 | **15.79** | 4.5 |
| earlier-steps chip, 11px / 600 | 5.24 | 5.48 | **4.86** | 4.5 |
| field label inside a proposal card | 17.40 | 17.40 | **17.40** | 4.5 |

Everything clears AA. The narrowest margin is the earlier-steps chip at 4.86:1, the smallest type in
the room on the thinnest glass in the room; it clears AA and does not clear AAA, which was already
true before liquid (5.24:1). The pane's gradient and the message column's gradient exist precisely so
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

Liquid throws 48 to 64px at the rim, which is where a filter goes wrong, and it closes with **two**
composites for that reason. The pane's top left corner was shot at 2x in all three modes and is on
the compare page: no fringe, no smear, radius intact, bevel and both shadows reading.

`.eg-glass-micro`, the 7px-radius narrator sliver, stays off the bend and off the lens in both modes.
At that radius an 18px rim mask has nowhere to land, which is the same geometry that already exempts
it from the triple rim.

## The motion clips

Nine, three scenes across three modes, four seconds each, Playwright `recordVideo` at 1360x900 and
25 fps, converted to h264 mp4 with ffmpeg. **`deviceScaleFactor` does not raise the recording
resolution**, because Playwright captures at viewport size, so the clips are 1x while the stills are 2x.

- **a** the landing headline scrolling under the top bar
- **b** the workroom pane with the client page scrolling behind it. The room locks the page scroller
  while it is open, so the probe unlocks it for the length of the clip; the clip is about what the
  glass does to moving content, not about what the room does to the scrollbar, and the compare page
  says so.
- **c** the rail, two committed cards deep, riding over the pane, the hero and the ground band

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

`npx tsc --noEmit` clean. `npx vitest run`: 3165 tests, all passing. `npm run build` green,
1,379,347 bytes, inside the 1.5 MiB budget. Release chain NOT run, artifact NOT published, NOT
merged to main.

## Open, for the founder

1. **The ground band puts violet linework on the page ground.** Rule 21 keeps purple blooms off the
   ground and rule 66 sanctions ambient violet linework for the landing band specifically. The band
   is at 3 to 5 percent and measures 0.10 of 255 on the open canvas, so it is arguably below the
   rule's reach, but extending violet linework app-wide is a call, not a filter setting. Liquid's
   ground blooms carry a violet radial at .11 as well, which is squarely inside rule 21's subject.
2. **Pane parallax (e)** is not built. See the depth table.
3. **Whether ON is worth keeping** now that liquid exists. ON's lens contributes 0.04 to 0.31 of 255
   on its own; liquid's contributes 0.09 to 0.71 and its recipe carries the rest. If liquid is the
   direction, ON is a step on the way to it rather than a mode anyone would choose.
