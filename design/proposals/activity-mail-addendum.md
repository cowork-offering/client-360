# The activity mail row: one row, and it opens our workroom

Branch `activity-mail`, from `main @ 61a3259`. Nothing merged, nothing published.

> "in the activity, when an email is coming in: it looks pretty bad, it has this long winded text, and the
> pop up still opens up the old loan modification tab, not our workroom. I need it sleek and elegant."
>
> Fabian, 2026-09-03

Two defects on one path, and the second one is the older of the two: the mail intake was built before the
facility workroom existed, so it proposed the only thing there was to propose.

---

## 1. What it did

A sweep matched a message to the relationship and landed it as a `REQUEST_RECEIVED` activity entry
(`channel/syncSweep.ts`). Two things came with it.

**The prose.** `ActivityTab`'s ordinary trail entry renders `entry.summary` as a paragraph under the title.
For a message the summary IS the body preview, so a trail row carried three lines of client prose, and under
that the citation printed the raw Graph message id in monospace. Four lines of trail for one message, and the
id is 27 characters of base64 nobody reads.

**The old tab.** `syncSweep.ts:325` hung a next step off the entry:

```ts
const nextSteps = read ? [{ actionId: suggestedActionFor(read), note: describeRequest(read) }] : undefined;
```

`suggestedActionFor` answered `"loan-modification"` for every intent except renewal and a new facility, and
that id names the REGISTRY action whose `hasPanel` opens `ActionPanel`, the pre-workroom action tab.

`detail.nextSteps` is shared state by design (A30.4): one array feeding the detail popup, the chat chips and
the actions panel. So one arriving message offered the old tab from three surfaces at once. The founder met
it on the popup because that is the one the row opens.

## 2. What it does

**One row.** `MailEntry` in `components/tabs/ActivityTab.tsx`, chosen at `:220` for any entry
`readMailRow` accepts. The subject in the trail's own weight, the sender and the relative time beside it,
the ask on one line, and one ink pill (rule 41). Then a quiet "Show message".

**The body is not in the default DOM.** Not hidden, not clipped, not there. One click brings the full
preview and the citation back inside a wash; the next click takes them away. That is the whole of the
"long winded text": a trail is a trail, and an inbox is somewhere else.

**The pill opens our room.** `openMailRoom` in `actions/mailRow.ts:203` makes the same three moves the
intent handoff makes:

1. the message is CARRIED, so the greeting leads with the one the banker clicked;
2. the cockpit flies to the relationship by the worklist row's own name flight (rule 58);
3. the facility room opens through its own `openFacilityRoom`, on the route the message names.

**It never binds and it never types.** An intent stages its lines on the feed because a banker wrote those
lines. A client did not. The room opens UNBOUND with the message's route as the opening chip, beside
"Something else", and the three routes stay reachable. Nothing is staged, nothing is typed, no gate moves.

**No mail path reaches a registry action.** The `nextSteps` line is gone and `suggestedActionFor` is deleted
with it. The registry's `loan-modification` action is untouched. It is still the right thing to offer as an
ACTION; it was never the right thing to offer as a reading of someone's mail.

## 3. The ask

Derived by `readMailRequest`, the cockpit's one mail reader for a request, so this is a second consumer of
it and never a second parser. At most **14 words**.

| the message says | the row says |
| --- | --- |
| "increase the line of credit from 15Mio to 20Mio" | Asks to increase the Line of Credit from $15M to $20M |
| "increase the construction loan to 20Mio" | Asks to increase the Construction to $20M |
| "send over the June covenant certificate" | the client's own first sentence, clipped at 14 words |

**Only the client's figures.** `describeRequest` may fall back to the facility's booked commitment for the
"from" side, because it renders under a suggestion card that says whose number it is. A trail row has no such
frame, so the fallback is dropped: a row reading "from $15M to $20M" means the message said both.

**The product word, never the booked name.** The org calls it
`Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00`, which is a line of prose on its own
AND carries the book's commitment into a sentence made of the client's figures. `facilityProduct` strips
both.

**An ambiguous facility yields no derived ask at all.** This package carries two Lines of Credit. A message
naming only a target amount matches neither, so the client's own words are clipped instead. Naming one of two
would be a guess wearing a match's clothes, which is the rule `matchFacility` already runs on.

## 4. The arrival

The sweep is the only way mail enters this cockpit, so an arrival is a gesture the banker already made. What
it earns is ONE line in the corner: `MailWhisper`, wearing the intent whisper's glass, in the same corner,
with the same two chips, and yielding to the assist exactly as that one does.

> james@hartwellprecision.com asks to increase the Line of Credit from $15M to $20M. Open the modification?

It speaks on the landing and on the relationship it names, and nowhere else. It is spent the moment the
banker answers it either way. There is no polling, no badge and no count.

## 5. The carry, and why it is not an intent

`useClientMail` picks the richer of a swept note and a live mailbox read. Neither knows WHICH message the
banker just clicked, and `mailNoteFromBundle` leads with `requests[0]`, so a relationship carrying three open
messages would open the room on whichever the sweep landed first.

`actions/mailCarry.ts` holds the answer: one note, keyed by account, set by the gesture and cleared by
`closeFacilityRoom`. `Workroom.tsx:847` prefers it over the intent note and over both reads, on exactly the
terms an intent is preferred: it is the reason the room is open.

**Rejected: modelling the opened message as a synthetic `IntentDoc`.** It would have reused `openIntent` and
the intent whisper for free. But `intentMailNote` stamps `source: "intent"`, and the envelope would then tell
the model that a swept mailbox message was not a mailbox read. The block says `swept`, because it is.

## 6. What the room is handed

| field | value | source |
| --- | --- | --- |
| `mail.source` | `swept` | the sweep landed it |
| `mail.from` | james@hartwellprecision.com | the mailbox, verbatim; never inferred |
| `mail.subject` | Hartwell line increase before quarter end | clipped at `MAIL_SUBJECT_CHARS` |
| `mail.gist` | the body preview | clipped at `MAIL_GIST_CHARS` |
| `mail.asked` | from $15M, to $20M, on the $15.0MM Line of Credit | the CLIENT's figures, labelled as theirs |
| `mail.route` | `modify` | the room's own `readRouteIntent` |
| `mail.arrivedAfterBook` | where the message is newer than the read | the sweep's own clamp decides the stamp |

Open dialogs on the page after Open: `["Facility Actions"]`. No Loan Modification panel, anywhere.

## 7. Not done, and why

**The relationship room has no activity view.** `RelationshipRoom.tsx` mints an activity entry when a review
is filed and never renders a trail, so there is nothing there to give the same treatment to.

**The detail popup is unchanged for every entry that is not a message.** An analysis, a covenant evaluation,
a filed action: same modal, same registry next steps, same portal and z-scale. Seven of its tests moved onto
those entries rather than being weakened, because a message no longer opens it at all.

## 8. Files

| file | what changed |
| --- | --- |
| `actions/mailRow.ts` | new. The read, the greeting note, the opening, the arrival store, the whisper line, `openMailRoom`. |
| `actions/mailCarry.ts` | new. The message the room was opened on. A leaf module with one type import. |
| `components/MailWhisper.tsx` | new. One line in the corner. |
| `components/tabs/ActivityTab.tsx` | `MailEntry`, and the trail chooses it for a message. |
| `channel/syncSweep.ts` | no `nextSteps` on an inbound message. |
| `actions/mailIntake.ts` | `suggestedActionFor` deleted. |
| `components/workroom/Workroom.tsx` | one line: the carried message outranks the mailbox contest. |
| `components/workroom/roomSession.ts` | the carry dies with the room. |
| `components/workroom/clientMail.ts` | `clip` exported as `clipMail`; one rule, two consumers. |
| `styles/panes.css` | `.tli.mail`: the head row, the ask, the pill, the expand, the wash. |
| `design/probes/lib/stub-mail.js` | new harness. One mailbox message; every other read throws. |
| `design/probes/shot-activity-mail.mjs` | new. Four states through the assembled build at 2x. |

## 9. Gate

`npx tsc --noEmit` clean. `npx vitest run`: **112 files, 3212 tests**, 15 of them new
(`mailActivity.render.test.tsx`: six on the read, nine on the glass driven through the real sweep).
`npm run build` clean at 1.325 MiB. The release chain was not run, nothing was published, nothing was merged.

Evidence: https://bot.connectry.io/s/85c7fb34c3e8/ · the build: https://bot.connectry.io/s/35e0a71308a8/
