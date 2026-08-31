# UI / UX Revamp — Handover for the parallel design session

2026-08-31. Founder decision: mechanics complete first (this session), UI revamp runs in PARALLEL
as a STATIC artifact — no MCP wiring, no live data, pure look/feel/motion. This document is the
complete brief. The design session must NOT touch this repo's `app/` — it produces a standalone
HTML artifact whose language we later port back onto the working components.

## 1. Source of truth — where the current UI lives

Repo: `/opt/connectry/projects/commercial-credit-reinvented/customer-360-reinvented` (branch main).

| What | Where |
|---|---|
| The BUILT single-file app (read this to see everything at once) | `artifact/customer-360-template.html` (~840KB, React inlined) |
| Design tokens (palette "Dusk Linen") | `app/src/styles/tokens.css` |
| Workroom styles | `app/src/styles/workroom.css` |
| Cockpit components (landing/worklist, relationship header, tabs) | `app/src/components/` |
| Workroom shell (thread, chips, manifest rail, checks, options) | `app/src/components/workroom/Workroom.tsx` |
| Demo data snapshot the static artifact should reuse for realism | `artifact/live-data.json` (Hartwell relationship, real figures) |

## 2. The surfaces to redesign (all of them, one visual language)

1. **C360 LANDING / WORKLIST** — the entry: banker's book, worklist rows, NAICS/industry
   context. Today: bare breadcrumb + table-ish list. Needs a real landing identity.
2. **RELATIONSHIP COCKPIT** — header (name, rating grade, committed/drawn, DSC/FCC KPIs,
   Sync + Client Actions), seven tabs (Activity, Exposure & Collateral, Covenants,
   Relationship Graph, Opportunities, Structural Signals, Financials), Client Actions drawer.
3. **DEAL WORKROOM** (the demo's heart, modal today) — package header + member strip,
   personal opener, stage bar (UNDERSTAND > COMPOSE > CHECKS > APPROVE), conversation thread,
   delta chips (confirm/discard), clickable option pills, challenge/check cards
   (verdict + "Show the math"), advisory cards with one-tap resolutions, manifest rail
   ("THIS MODIFICATION", grouped member terms), approval card ("One clone. One single use
   token. One approval."), filing state, filed summary.

## 3. The UI element inventory (KEEP every affordance — restyle, never remove)

- Member strip chips (product + amount, dashed = Proposal/not booked)
- Delta chip: kind badge (TERM CHANGE / ADD COVENANT / …), title, target member,
  before → after, Confirm / Discard, info peek
- Option pills (org picklist values, tap = say) — new, keep prominent
- Challenge card: verdict chip (COVERAGE THINS), provenance kicker ("derived here from the
  org's collateral pool"), figures line, Acknowledge + Show the math
- Advisory card: "Before you confirm" + one-tap resolution button
- Manifest rail: change count, "Package today" peek, grouped entries with remove-x
- Stage bar: four stages with counts (today thin grey text — the redesign's biggest single win)
- Approval card + governance line + Approve button; "Working…" state; filed summary with
  per-step verification
- Suggestion pills (proactive: "Take the Line of Credit to $20M")
- Peeks (hover/click disclosure panels), Why button, agent/banker thread bubbles
- The ">" fill-glyph loading beat (brand motif — keep the mechanic, elevate the drama)

## 4. Design direction (single direction, per design-intent-gate doctrine)

**Archetype: institutional banking console — "the credit committee's instrument", not a chat app.**

Anchor references, in priority order:
1. **MSTL blessed spec** (the look Noland + Fabian already approved):
   `/opt/connectry/brain/working/artifact/workspace-unified.html` — slate `#f3f4f7` ground,
   white cards with `0 4px 18px` shadow, **navy `#003164` two-line stage chevrons**, numbered
   sub-step rail with role subtitles, attestation trail, **serif deal values**. Verdict on
   record: flat white underline-tab minimalism reads "lightweight and hard to follow" for
   dense banking surfaces. Confident density wins.
2. **Accenture brand system** (this demo is Accenture-branded "Commercial Credit 360"):
   - Core purple `#A100FF` (the "greater than" brand) — used as SIGNAL, never as wash;
     current app already calms it to `#822db4` for ramps (`tokens.css` — keep that discipline)
   - The **">" chevron mark** — brand motif; today it's the loading glyph, elevate it into the
     stage bar / section markers
   - Black `#000000` / white, generous contrast; Accenture's own surfaces pair the purple with
     near-black ink and disciplined greys
   - Typeface: Accenture's brand face is **Graphik** (licensed — NOT on Google Fonts). For the
     artifact use the closest Google stack and declare it: `"Inter Tight"` or `"Public Sans"`
     for UI + a serif for deal values (`"Source Serif 4"`) — final call in the intent gate.
   - Wordmark lockup as in the current header: `accenture>` + "Commercial Credit 360"
3. **Current token base**: `tokens.css` "Dusk Linen" — keep as the starting palette family,
   push contrast and hierarchy rather than replacing hue-wholesale.

**The three experiential upgrades the founder named:**
- **Sleek loading = living execution.** The 30–60s filing must narrate itself: plan steps
  stream in as the org verifies them (roll the package → carry 21 involvements + 7 pledges +
  4 fees → apply $20M to the clone → verified). Design this as the hero moment — the loading
  IS the product story. The step data exists (the plan tracker); the static artifact should
  fake the stream with a timed sequence.
- **Proactive.** The room opens with the deal's next move (maturity inside the quarter,
  covenant due, utilization trend), not a static paragraph. Design the opening
  recommendation card + how suggestions surface during composition.
- **Reactive.** Every banker input answers within a beat — design thinking/typing beats,
  chip arrival motion, check reveals. Motion: cinematic but elegant (founder's words);
  the ">" glyph FILLS, it never bounces.

## 5. Deliverable of the design session

ONE static single-file HTML artifact ("Commercial Credit 360 — Design Direction") containing
the three surfaces in sequence (landing → cockpit → workroom) with the Hartwell demo data,
one scripted living-execution filing sequence on a timer, light/dark handled, no external
assets except Google Fonts. It is a DESIGN OPTION to react to, not production code — but every
element in §3 must appear, because the port-back maps 1:1.

Process guard: run the `design-intent-gate` skill first (archetype named above; confirm with
the founder before full build). No freehand AI-slop layouts — 21st.dev is catalog-only per
the Aug 26 decision; hand-choreograph on the token system.

## 6. What NOT to do

- No changes in `app/` or to the live artifact `91b5e835-...` — the mechanics session owns them
- No MCP/capability wiring — static means static
- No new information architecture — the flows are proven; the language is what changes
- No em dashes in UI copy (founder style rule); no emojis in the product surface
