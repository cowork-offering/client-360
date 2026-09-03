# The composer plus menu

Branch `composer-plus`, cut from `main` at b116cf9.

> "Next to the send button in the chat we should have a + sign. Clicking it lists the loans of the
> selected Product Package; picking one gives quick actions for everything we can do ... It does NOT
> send: it puts the prompt into the chat so you can still steer and add your personal note before
> sending, which ensures you always select the correct one."
> Founder, 2026-09-03

## What shipped

- Compare page: https://bot.connectry.io/s/251843edd3de/
- Live build: https://bot.connectry.io/s/ee45bd6bb824/

A plus, sized and coloured as the send button beside it, opens a glass panel above the composer.
Three levels and a breadcrumb: the members of the Product Package, the topics, the actions, and a
fourth level wherever an action refers to records that already exist. Escape, an outside click and a
pick all close it; up, down, enter and backspace walk it; a filter at the top reads every level at
once and prints the path above each hit.

Picking writes the line into the composer, selects its first placeholder and focuses the input. It
never sends.

## The files

| File | What it is |
|---|---|
| `app/src/components/composer/catalog.ts` | Topics, actions, templates and the record readers, as data |
| `app/src/components/composer/ComposerPlus.tsx` | The button and the panel |
| `app/src/components/composer/composer.css` | `cp-` prefixed, every leaf a token |
| `app/src/components/composer/icons.tsx` | One consistent inline SVG set, stroke 1.5, 16px, currentColor |
| `app/src/components/composer/catalog.test.ts` | Every template through the room's own readers |
| `design/probes/shot-composer-plus.mjs` | The seven evidence shots |

## The mount

Two lines, one per room, plus a ref on the input each composer already had.

- `app/src/components/workroom/Workroom.tsx:3922`
- `app/src/components/relationship/RelationshipRoom.tsx:1850`

Nothing else in either room changed, and `app/src/workroom/` was not touched.

## The catalogue

| Topic | Actions | Enumerates real records |
|---|---|---|
| Facility Terms | 6 (increase, reduce, rate, term, maturity, payment schedule) | no |
| Legal Entity | 2 (add a party over 5 roles, remove a party) | yes, the parties on that facility with their own role |
| Covenant | 3 (add over 9 catalogue tests, associate an existing one, leave one off) | yes, the covenants attached to the facility and the relationship covenants not yet on it |
| Collateral | 3 (pledge existing, pledge a new asset, leave a pledge off) | yes, the pledges on the facility and the relationship assets not yet pledged to it |
| Pricing and Payment | 2 (amortised term, first payment date) | no |
| Fees | 2 (percentage, flat) over the 6 fee kinds the room offers | no |
| Exceptions | 3 (open, waived, unmitigated) | no |
| Reviews (relationship) | 4 (annual, covenant, valuation, rating) | derived from `REL_ROUTE_CHIPS` |
| Service (relationship) | 1 (raise a service request) | derived from `REL_ROUTE_CHIPS` |

On the live Hartwell package that expands to 309 leaves across six booked members.

Any route another branch adds to `REL_ROUTE_CHIPS` lands under a "Create at relationship level" topic
on its own, by feature and never by name, so the intake work in flight on `intake-shell` needs no
change here to appear.

## Two reference forms for the same facility

The difference is load-bearing and it was found by driving the readers, not by reading them.

- `shortName` — the org's own loan name with the borrower's name off the front, e.g.
  `Equipment - $8,000,000.00`. One of the member's own identity tokens, so `parseModify` resolves
  exactly one member on it. Used by every line the deterministic parser takes.
- `phrase` — the dollar qualifier, e.g. `8M equipment loan`. `focusQualifier` resolves it, stands the
  room on that member and STRIPS the phrase out of the line before any surface reader sees it. Used
  by every line a create surface takes: covenant, collateral, involvement, fee, exception.

Why it matters: the covenant surface reads a bare money token in the line as the THRESHOLD. With the
facility named as `$8.0MM Equipment`, `add a Minimum Liquidity covenant min [threshold] ... ` came
back holding a threshold of 8,000,000 that nobody typed. Behind `focusQualifier` there is no money
left in the line and the placeholder stays a placeholder.

## Placeholders

Square-bracketed, and the first one is selected on insert so the next keystroke replaces it.

No placeholder may carry a reading word. `what`, `which`, `show`, `list` and `value` are read-shape
words to `fee.ts`, `exception.ts` and `elicit.ts`, and one inside a placeholder turns a create into a
question about the book: `[what is out of policy]` made `readExceptionOpen` return null, and
`$[value]` made `openCreate` refuse a collateral line. They are `[name the exception]` and
`[amount]`.

## How a template is proved

Each action names the reader the room resolves it with:

| Gate | Reader |
|---|---|
| `parse` | `parseModify(line, ctx)` |
| `surface` | `focusQualifier` then `openCreate` / `readFeeOpen` / `readExceptionOpen`, then the parser behind them |
| `arm` | `readRemove` fences it, `readArmRemoval` files the carry exclusion |
| `relRoute` | `readRelRouteIntent` |

`catalog.test.ts` drives every template for every booked Hartwell member through that reader twice:

1. the raw template is never a refusal (it stages, or it comes back as the room's own question);
2. the same template with its placeholders typed over stages on the member the menu was standing on.

## The stacking fix

The panel first read `--z-palette` and painted BEHIND the workroom, which is itself a full-screen
overlay at `--z-modal`: in the DOM, correctly positioned, and invisible inside the room's own glass.
`--z-sheet` is the token for exactly this case, a surface stacked on the panel that owns it, and it is
what the panel reads. Never anchor a workroom-hosted overlay on the palette scale.

## Gate

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 109 files, 3180 tests, all pass |
| `npm run build` | clean, `dist/cockpit.html` 1,385,098 bytes |

The release chain was not run, the artifact was not published, and nothing was merged to `main`.
