# Greeting v2: the line item, the client's mail, and a route-neutral greeting

Branch `greeting-v2`, from `main @ 6fc1eee`. Nothing merged, nothing published.

The founder drove the room in his claude.ai panel on 2026-09-02 and came back with three things.
The first needed no build (the room answers reads before the route binds, by design). This is what
shipped for the other two, plus the two refinements he added the same morning.

---

## 1. What he said, and what it turned into

> "The responses are good but some are a bit long winded and hard to read, maybe more sections,
> better structured, for instance showing XYZ covenant as a line item with text around it."

A THIRD NARRATION BLOCK KIND. A hyphen bullet that opens on a bold name followed by a colon is a
ROW: the name, the clause, and the entity's own figure in a right-hand rail.

> "when there is an email attached, it should be in that first response baked in"
>
> ...and, sharper, later the same morning: it is ANY mail, not an increase. "btw James reached out
> for xyz, do you want to bake this in?"

A MAIL BLOCK ON THE ENVELOPE, fed by the cockpit's one existing mail reader, carrying whatever the
client actually wrote, so the model can read what it asks and offer the matching move, or simply
mention it when there is no move to offer.

> The greeting reads like a modification even when the route question is still open.

ROUTE-NEUTRAL UNTIL BOUND. One argument on one call site, plus the doctrine that makes the model
write to the position rather than to a route nobody has chosen.

---

## 2. The grammar

The model writes the name and the sentence. **The room writes the number.** They cannot disagree
about a figure because they are not the same source.

```
Hartwell's $46M package sits clean across six facilities, nothing staged yet.
- **Debt Service Coverage of Borrower**: the widest ratio cushion on the deal.
- **Maximum Debt to Worth**: room before the covenant binds, either way.
- **Accounts Receivable**: exactly on its ceiling, and tested monthly.
Modify, renew, or structure something new?
```

renders as a lead paragraph, then

| row | rail |
| --- | --- |
| **Debt Service Coverage of Borrower**: the widest ratio cushion on the deal. | 1.38x vs >= 1.25x |
| **Maximum Debt to Worth**: room before the covenant binds, either way. | 2.42x vs <= 3.00x |
| **Accounts Receivable**: exactly on its ceiling, and tested monthly. | 80% vs >= 80% |

then the closing line. Forty-eight prose words carrying six figures, against the founder's own
eighty-eight carrying two. **The model wrote none of the six.**

(The rails render with the room's own glyphs, the multiplication sign and the real inequalities.
They are transliterated in this table only so a diff of this file stays readable.)

**Candidacy is strict.** Only a bullet whose FIRST span is bold and is immediately followed by a
colon is a row. Bold anywhere else is a figure and stays prose bold. That is also what makes it
stream-safe by construction: a half-written head has no closing marker, and a complete head with no
colon yet is still a bullet, so both read as ordinary bullets until the whole head has landed. The
only mid-stream visual event is the rail appearing; nothing reflows twice.

**Resolution order**, first writer wins per key: staged title, then covenant name, then facility
label, then involvement name, then collateral asset. Matching is exact first, then a normalised
token multiset, so the room's "$15.0MM Line of Credit" and the founder's own "Line of Credit
($15.0MM)" are the same facility.

**An ambiguous name resolves to NOTHING.** This package carries two Lines of Credit. A normalised
key that two entries in one table both produce is banned, permanently, rather than guessed at.
Printing one facility's commitment beside the other's name is the failure that staged a reduction
on the wrong line in the 2026-09-01 evening drive. It must never be weakened into a fuzzy match.

**No match is a plain-reading row**: the label, the colon, the sentence, no rail, no placeholder,
no error. On the glass it is indistinguishable from a bullet whose first words are bold, because
the hyphen mark is byte-identical to the bullet list's.

**Pricing is not a source.** Every pricing key is already shadowed by the facility rank (both come
from the same `nameOf()`), so including it would be dead code whose only effect, if the ranks were
ever reordered, is a RATE printed beside a COMMITMENT. A rate stays prose bold.

### Caps

| what | value | where |
| --- | --- | --- |
| blocks per remark | 4 | `NARRATION_MAX_BLOCKS`, unchanged |
| rows per entity block | 3 | `NARRATION_MAX_BULLETS`, reused, no new constant |
| label | 2 to 72 chars | `LABEL_MIN` / `LABEL_MAX` |
| clause | 120 chars, word boundary | `CLAUSE_MAX` |
| rail value | 24 chars | `VALUE_MAX` |
| mail subject | 140 chars | `MAIL_SUBJECT_CHARS` |
| mail gist | 320 chars | `MAIL_GIST_CHARS` |
| greeting wait for the mailbox | 1200 ms | `MAIL_GATE_MS` |
| envelope | 10,000 bytes | `ENVELOPE_CAP_BYTES`, unchanged |
| doctrine | 16,000 bytes | `DOCTRINE_BUDGET_BYTES`, unchanged |

### Per-act word budget

Keyed like `ACT_LINE` and printed directly under it, so the model sees the budget for the act it is
writing and no other. greeting ~90 (three rows is the default, not the exception); answered ~75;
staged ~55; refused ~45; mail ~55. One act-independent cut order: the third row first, then the
closing line whenever the chips or the card's own follow-up already carry the ask, then a row's
trailing clause. Never the lead line, and never a figure.

---

## 3. The mail

`BrainMail` rides the envelope at **top level, beside `reads` and never inside it**. `reads` means
what this room read from the BOOK; a mailbox is not the book. That is what lets the doctrine say
"never a source for a figure" without contradicting "speak from CONTEXT.reads".

It carries: `from` (verbatim, absent is absent), `received`, `subject`, `gist`, `more` (a COUNT of
other matches, never their text), `arrivedAfterBook`, `asked` (the client's own figure, labelled as
theirs), `route` (what the room's own `readRouteIntent` finds, or nothing), and `source`.

**One reader, two consumers.** `useMailTip` is deleted; `useClientMail` makes the same single
`outlook_email_search` the tier used to make on its own and serves both the greeting's block and
the quiet tier from it. Net connector traffic for a room open is unchanged at one call, and inside
60 seconds of a sync sweep it is the platform cache. A sweep already on the bundle answers
synchronously, with no call at all.

**Timing.** The greeting fires when the brain, the lookup, the opening item and the gate are all
ready. The gate opens on the swept note, on the read resolving, on it rejecting, or on
`MAIL_GATE_MS`, whichever is first, and with no connector it is open on the first tick. On the
animated path the room's own lookup is 1500 ms, so the mailbox adds **at most 0 ms**; under reduced
motion it adds at most one 1200 ms beat.

**Why 1200 and not longer.** The consent dialog is the one moment the room cannot take twice. A
longer gate buys more mail at the price of a visibly late dialog, and the late-mail remark already
covers everything the gate misses. Do not solve a missed gate by calling `primeConsent` twice or
resetting the module door: that is a second consent dialog at a credit desk.

**Late mail is a SECOND remark, never a rewritten greeting**, through `askSession` and not
`primeConsent`: no second dialog, no second connector call, and the room never takes back a
sentence it already said in front of the banker.

**The mail is never a source for a figure.** Where the message states one, the doctrine has the
model say the client stated it and attribute it to them. And **a person is never inferred** from a
company name, a guarantor list or an email address.

---

## 4. Route neutrality

`Workroom.tsx` built the narration envelope with `routeOpen` defaulted to false, so while the route
question was still open the envelope carried the PROVISIONAL modify mode from `roomSession.ts`. The
model read it and wrote the founder's own complaint: "which facility or facilities move and what
changes follow". The room's deterministic sentence was already neutral; only the model was reading
the provisional mode off the envelope.

One argument, the same one the reply lane has always passed. While unbound the envelope carries
route "unbound" and the three options, and the `route-open` doctrine block says the three questions
are three questions and none of them has been asked yet. Once bound, the block is gone and a single
always-travelling line names the route the remark must write in.

**Both new doctrine blocks are force-selected and undroppable.** The greeting composes its doctrine
off an EMPTY line, so a block gated on a word in the line is unreachable there however true it is:
`composeDoctrine` gains `include` and the ENVELOPE says what the LINE cannot. Neither id is in
`DOCTRINE_DROP_ORDER`, because the block governing the one call that carries consent must not be
droppable. Both together are under 2 KB against a 16 KB budget.

---

## 5. The copy variants

The room's deterministic sentence is unchanged in every one of these. What follows is the model's
remark under it, with the rail shown in backticks at the end of each row.

### (a) No mail, route unbound

Glass: *"Hey Fabian. What are we doing with this relationship - modifying, renewing, or structuring
something new?"*

> Hartwell's $46M package sits clean across six facilities, nothing staged yet.
> - **Debt Service Coverage of Borrower**: the widest ratio cushion on the deal. `1.38x vs >= 1.25x`
> - **Maximum Debt to Worth**: room before the covenant binds, either way. `2.42x vs <= 3.00x`
> - **Accounts Receivable**: exactly on its ceiling, and tested monthly. `80% vs >= 80%`
>
> Modify, renew, or structure something new?

### (b) Microsoft 365 not attached

**Byte-identical to (a).** Silent: no `mail` key on the envelope (never a null, never a "not
connected" string), no MAIL doctrine, no correspondence line in `notCarried`, no tier, no apology,
and no added latency because the connector check is false and the gate opens on the first tick.

### (c) Mail present, route unbound, the mail names a modification

> Hartwell's $46M package is clean and compliant; one client message is open.
> - **Line of Credit ($15.0MM)**: the sender asked to take this to $20M, nothing staged toward it. `$15.0MM`
> - **Debt Service Coverage of Borrower**: the test a bigger line moves first. `1.38x vs >= 1.25x`
>
> That reads as a modification. Open it, or renew or structure something new instead?

### (d) The mail asks a RENEWAL

> Hartwell's $46M package is clean across six facilities, nothing staged yet.
> - **Equipment ($8.0MM)**: the facility the note names, and the one a renewal re-cuts. `$8.0MM`
> - **Debt Service Coverage of Borrower**: the test a renewal is priced against. `1.38x vs >= 1.25x`
>
> James asked to renew the $8.0MM equipment loan; open the renewal?

Chips stay exactly three: Modify, Renew, New facility. The remark matches none of "which facility",
"facilities move" or "changes follow".

### (e) A plain question, no credit action

> Hartwell's $46M package is clean; the message on it asks nothing of the credit.
> - **Accounts Receivable**: tested monthly, and the one test with no room left. `80% vs >= 80%`
>
> James asked on Aug 28 for a copy of the June covenant certificate. Modify, renew, or structure
> something new?

The close names THE THREE ROUTES, not a route from the mail. `readRouteIntent` finds none in it, so
none is offered.

### (f) The mail arrived after the book

As (c), (d) or (e), with one clause: *"that note landed after this book was read on Jul 25, so
nothing here reflects it."*

### (g) The mail lands late, as a SECOND remark under the greeting

> One more thing: James Hartwell wrote on Aug 28 asking to renew the $8.0MM equipment loan.
> - **Equipment ($8.0MM)**: matures inside the year and carries no loan-level covenant of its own. `$8.0MM`
>
> Open the renewal, or say what you want to do with it.

### (h) Route already bound

No `route-open` block; the bound route line travels instead. The remark restates the position in
that route's terms and never offers the other two. A bound RENEWAL room never says "which facility
moves" or "what changes follow". That is a test, not a hope.

---

## 6. Two corrections to the spec's own copy, from the real book

The spec wrote the Accounts Receivable covenant as "80% vs <= 80%" and Minimum Liquidity as
">= $5.00M". The room's own helpers say otherwise, and the room's helpers are what the card beside
the remark prints:

- **Accounts Receivable is ">=", not "<=".** The type matches neither the cap hints nor the floor
  hints, so `covenantDirection` falls to its magnitude rule, and an actual of 80 against a
  threshold of 80 reads as a floor. Whether that is the RIGHT reading of an AR advance-rate
  covenant is a separate question for a separate change; what matters here is that the line item
  and the card cannot disagree, and they do not.
- **Minimum Liquidity is ">= $5M".** The money formatter strips a trailing ".00".

The copy variants above are written against what the room actually prints.

---

## 7. The founder decision this build does NOT make

**There is no Hartwell mail in the demo data, and one real message in the founder's mailbox.**

- `artifact/live-data.json` was not touched. The Hartwell borrower carries no `requests` block and
  an empty `activity`, so with no connector and no sync sweep the room has no mail at all and every
  greeting is variant (a). That is honest, and it is also not a demo of the mail path.
- The one Hartwell message in the founder's mailbox is from **fabiangoetzens@yahoo.de**, not from
  James Hartwell, and it is dated 2026-07-26, one day AFTER `meta.generatedAt`.

The date is now handled honestly in code: `arrivedAfterBook` on the envelope, and the quiet tier no
longer discards a future-dated message (it says "received after this book was read"). **The SENDER
is not, and must not be.** The doctrine forbids inferring a person from a company name, so the
greeting will attribute to that address, and the founder's own "btw James reached out" reads
correctly only when the demo mail is sent from a Hartwell-shaped sender.

**So the founder has to pick one, before Thursday:**

1. **Seed a message.** Send one to the connected mailbox from a Hartwell-shaped sender, dated
   before `meta.generatedAt`, saying whatever he wants the room to react to. Zero code, and the
   live path then demonstrates itself. This is the recommendation.
2. **Bake a client-request block onto the Hartwell borrower** in `artifact/live-data.json`. That
   makes the mail path work with the connector detached, and it should be its own named, deliberate
   commit rather than a quiet edit inside this one.
3. **Demo without mail.** Variant (a) is a real improvement on its own: the line item and the
   route-neutral greeting are the two things he named, and neither needs a mailbox.

Loosening the attribution rule is not on the list.

---

## 8. Deliberately out of scope

1. **The mail-derived yes-chip.** Refinement (A) says "offer the matching route or instruction AS A
   CHIP". This build offers it as the CLOSING LINE naming an existing route chip, because the
   narration bubble is button-free by a pinned assertion and refinement (B)'s own example sentence
   ("open the renewal?") is a closing line. A mail-driven smart opening that outranks the deal
   signal and puts up a two-chip ask would satisfy the word literally; it touches `route.ts`,
   `RouteOption` and `chooseRoute`, collides with the `wire-arms` worktree in `Workroom.tsx`, and
   is the right follow-up rather than this week's work. **Flagged to the founder.**
2. **No mail page function.** The greeting is a rung-2 quick call with caching on and must stay
   tools-less; the call options never pass both tools and cache.
3. **No second message and no thread.** One message plus a count, and `notCarried` says so by name
   whenever the block is present.
4. **The assist desk is unchanged.** The mail tier's "Open the thread" chip still hands off to
   `askCopilot`.
5. **No second room open.** `primeConsent` memoises across the whole view, so opening Hartwell,
   closing, sweeping and reopening replays the FIRST greeting. Pre-existing, not made worse, not
   fixable inside the consent contract before Thursday. **Do not demo a second room open.**
6. **`covenantRow` in `readCard.ts` is unchanged.** The card writes "threshold 1.25" where the rail
   now writes ">= 1.25x". Cosmetic, one line to fix later with the same two helpers, not worth the
   blast radius this week.
7. **No cap moves.** Every constant in the table above that says "unchanged" is unchanged.

---

## 9. Known risks

- **Worktree collision.** `wire-arms` owns `Workroom.tsx`. This build's hunks there are seven and
  narrow; land them after `wire-arms` or rebase.
- **The covenant format change is read by the REPLY lane too**, not only the greeting: the envelope
  now says "$6.80M" where it said "5000000". A strict improvement using the room's own helpers, but
  any prompt or test that pattern-matched a bare number will move.
- **Model compliance is not guaranteed and does not have to be.** Ignore the syntax and the remark
  is exactly today's prose and bullets. Invent a name and the row is a value-less bullet. Write a
  heading, a table or a fence and it is still dropped. Every failure mode degrades to current
  behaviour. The residual founder-facing risk is not breakage: it is that the greeting still reads
  long, and the only levers on that are the per-act budget and the cut order, which are prompt copy
  and are cheap to tune after the first live read.
