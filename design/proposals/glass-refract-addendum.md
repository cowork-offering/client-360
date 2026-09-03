# Refractive glass: the addendum

Branch `glass-refract`, cut from `main` at b116cf9. Built, gated and shot; NOT merged, NOT
released, NOT published as an artifact. The compare page is the decision.

## The two links

- Compare page, OFF vs ON, 2x: <https://bot.connectry.io/s/a78773385799/>
- Live build with refraction: <https://bot.connectry.io/s/2127d57e4bbb/?refract=1>
  (the `?refract=1` is load-bearing; without it the page is today's cockpit, unchanged.
  `?refract=2` additionally puts the workroom pane on the bend.)

## What was built

One SVG filter sheet, `app/src/components/GlassFilters.tsx`, mounted once in `App` outside the
load states, because a `url()` reference that resolves to nothing silently drops the whole
`backdrop-filter` declaration and the boot scene paints glass too. Two filters:

```
#eg-refract        panes, bar, rail, hero, chat, cmdk
  feTurbulence      fractalNoise  baseFrequency 0.006  numOctaves 2  seed 7
  feGaussianBlur    stdDeviation 3
  feDisplacementMap scale 36  xChannelSelector R  yChannelSelector G  in SourceGraphic
  feComposite       displaced OVER SourceGraphic          <- the fringe fix

#eg-refract-soft   chips, satellites, pills
  feTurbulence      fractalNoise  baseFrequency 0.01   numOctaves 2  seed 7
  feGaussianBlur    stdDeviation 2
  feDisplacementMap scale 14  xChannelSelector R  yChannelSelector G  in SourceGraphic
  feComposite       displaced OVER SourceGraphic

both: color-interpolation-filters sRGB, filter region x/y -10% width/height 120%
```

Tuned by eye against the top bar with the landing headline sliding under it, which is the highest
contrast backdrop in the app. At baseFrequency 0.009 / scale 30 the individual letterforms wobble,
which reads as a texture. At 0.006 / scale 36 the whole word slides, which reads as a slab. Longer
wavelength, larger throw, fewer visible events.

The CSS lives in `electric-glass.css` behind `html.eg-refract`, and it is the one place the recipe
is written:

```css
backdrop-filter: blur(B) saturate(S);                    /* Safari keeps this  */
backdrop-filter: url(#eg-refract) blur(B) saturate(S);   /* Chromium takes this */
```

`B` is half the surface's own `--eg-blur`, computed off the same token, so the frost scale and the
refract scale cannot drift apart. 36 becomes 18, 30 becomes 15, 28 becomes 14. The halving is not a
taste call: a 30px to 38px frost averages the backdrop flat before the eye can read structure in
it, and a bent flat field is still a flat field.

Toggle in `main.tsx`, read once at boot, default OFF: `?refract=1` or `#refract` adds `eg-refract`;
`?refract=2` or `#refract2` adds `eg-refract-pane` alongside it. `window.c360Refract(on, pane)`
flips the same classes live for an A/B in one tab.

## The rim

Reworked for thickness, still exactly three inset lines so the glass census passes by construction:

| | before | after | why |
|---|---|---|---|
| top | `0 1px 1px rgba(255,255,255,.95)` | `0 1px 0 rgba(255,255,255,.98)` | the lit edge, crisp rather than a 1px smudge |
| bottom | `0 -1px 1px rgba(255,255,255,.35)` | `0 -1px 0 rgba(0,0,0,.10)` | the shadow side of the slab, which did not exist before |
| ring | `0 0 0 1px rgba(255,255,255,.28)` | `0 0 0 1px rgba(255,255,255,.22)` | dropped so the new dark bottom is not washed out by the ring crossing it |

The dark outer hairline is untouched. Census verified live in all three modes: 13 backdrop-filter
surfaces, 12 at three rims, `.arclbl` at one as always, zero rim violations, zero white borders.

## Edge artifacts

The fringe fix is the last primitive in each filter and it is the reason the corners are clean.
Displacement samples outside the backdrop image, and outside it there is transparent black, which
shows up as a see-through or smeared band along the edges and in the rounded corners. Compositing
the displaced result back OVER the undisplaced source fills exactly those pixels with the original
backdrop. It is geometry-independent, so a 999px pill and a 22px pane both get it without either
one knowing its own shape. All four corners of the workroom pane checked at 2x: no fringe, no
smear, radius intact.

## The performance gate

3 second rAF counter while text is appended to the room's last agent bubble every frame, which is
the worst case a real narration stream can produce. Medians of three runs, headless Chromium,
4 core box, no GPU.

| workroom pane | fps | ms/frame |
|---|---:|---:|
| backdrop-filter removed entirely | 14.4 | 69 |
| today, frost 30px | 9.3 | 108 |
| bend + 15px | 6.3 | 159 |

The pane never reaches 50 fps on this box in ANY mode, the no-glass floor included, so the 50 fps
rule cannot be cleared on this evidence. The rule's own fallback therefore applies and is what
ships on `?refract=1`:

**Refraction carries on the static surfaces. The workroom pane keeps plain frost.**

Carrying it: the top bar, the client hero, the chat panel, the cmdk lens, the whisper, the toast,
the arc satellites, the manifest rail chips, the room's notices, dossier and pills. Excluded:
`.eg-glass-workroom` (the gate) and `.eg-glass-micro`, the 7px-radius narrator chip, where the
displaced corners have nowhere to land and the edge turns to mush. That is the same geometry that
already exempts it from the triple rim.

The pane variant is built and reachable at `?refract=2` because the call is the founder's and he
has to be able to see it. Re-measure on real hardware before reversing the gate.

## What the bend acts on, and the honest finding

Refraction is invisible over a flat field, and the cockpit ground is flat by design: the Apple
canvas #F5F5F7 under a white radial, plus one teal bloom at 4 percent alpha. Rule 22 put it there
and rule 21 keeps purple off it. Mean pixel difference OFF to ON, out of 255:

| surface | mean diff | reads |
|---|---:|---|
| top bar, book scrolled under it | 0.54 | yes, clearly |
| workroom pane over the client page (`?refract=2`) | 0.53 | yes, clearly |
| client hero over the weave and chevron | 0.06 | no |
| manifest rail chips | 0.07 | no |
| arc satellites | 0.03 | no |
| greeting card | 0.00 | not a glass surface at all |

The two that work do so because CONTENT passes behind them, not because the background does
anything. The greeting card the room opens on is SOLID by rule 23: content is opaque white, never
translucent. It has no backdrop to bend and it did not get one. Making it refract means overturning
rule 23, which is a founder call, not a filter call.

### Proposal, NOT shipped

For the bend to read on the hero and the chips, the ground needs structure at the bend's own
wavelength (about 167px at baseFrequency 0.006), not at 1px. The weave is drawn at 0.5 to 1.1px
stroke and 6 to 20 percent alpha, which an 18px blur erases before the displacement can move it.

1. **Cheapest and on-brand.** Add one coarse band to `buildThreads` in `app/src/data/weave.ts`:
   3 or 4 threads at 6 to 10px stroke width and 3 to 5 percent alpha in the CORE violet, drawn
   under the existing filaments. At that alpha they are invisible on the open canvas but they
   survive an 18px blur, so the glass finally has an edge to bend. One branch in one generator,
   no token change, no palette change.
2. **Weaker.** Lift the two ambient blooms in `body`'s background from 0.04 to about 0.07 and add
   a third off-centre. A gradient bent by a gradient still reads as a gradient, so this buys
   little, and rule 21 confines it to teal.
3. **Free.** Change nothing, and accept that refraction reads on the two surfaces where content
   passes behind glass and is decorative everywhere else.

Nothing in this list is implemented on the branch.

## Chromium only

WebKit rejects `url()` inside `backdrop-filter` and drops that declaration, so Safari and every iOS
WebKit keeps today's frost at today's blur and never sees the bend. That is deliberate: it is the
whole reason the plain declaration sits directly above the `url()` one, and the order between them
is load-bearing. Verified in the built CSS that both declarations survive minification in that
order. The `-webkit-` line stays plain for the same reason it exists at all, pre-18 WebKit reads
only that property and would reject the `url()` too. Firefox supports reference filters in
`backdrop-filter`; untested here. The fallback path was reasoned from the parser rule, not observed
on a real Safari.

## Gate

`npx tsc --noEmit` clean. `npx vitest run`: 108 files, 3165 tests, all passing. `npm run build`
green, 1,369,981 bytes, inside the 1.5 MiB budget. Release chain NOT run, artifact NOT published,
NOT merged to main.
