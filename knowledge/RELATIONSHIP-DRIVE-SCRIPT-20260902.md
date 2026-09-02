# The relationship drive, 2026-09-02

Every line below was driven headless against the built artifact on this branch and every
expectation is what the room actually put on the glass. Where the room does something other than
the addendum's section 6 predicted, this says so rather than the addendum.

**Where.** Open Hartwell Precision Manufacturing LLC from the worklist, click the round button
bottom right, then **Relationship**. That is Relationship Actions. Facility Actions is the other
arm of the same button and is the room being demoed tomorrow evening; nothing here touches it.

**Reload between arcs.** Each block below starts from a freshly opened room. The room memoises the
consent moment per view, so a second open in the same page replays the first greeting. Reload the
page, reopen the client, reopen the room.

---

## Arc A: the room opens, and answers without committing

| # | Type | What you should see |
|---|---|---|
| A1 | (nothing, just open it) | "Relationship Actions on Hartwell Precision Manufacturing LLC." Then the governance signal it found: **"The Accounts Receivable test is due in 6 days. Run the covenant review?"** Two chips: **Open the covenant review** and **Something else**. The lane on the right says "Pick a review to begin." |
| A2 | `what is the risk rating` | Answered from the read, as a card, naming the surface. Six facility rows with their grades, then "Run the risk-rating review, or read something else on the book?" **No route binds.** Asking what is on the book is not choosing what to do about it. |
| A3 | `covenant review` | The route binds and the brief reads first: what it covers, what it produces. Then the honest refusal: **"nCino holds no open test period on any of the 6 covenants on this relationship, so there is nothing for a covenant review to close."** It asks nothing. This is correct: Hartwell carries no compliance rows in the org, and the room says so rather than inventing a period. |

**What changed here.** Before tonight the covenant route stopped one step earlier, on
`NO_PACKAGE_ANCHOR`, because the fixture put no product package on the relationship's snapshot. The
package is now on the snapshot (Hartwell: `a5Fbb000000IHFJEA4`, derived from its own facilities), so
the route runs and reaches the real, data-grounded refusal instead.

---

## Arc B: the collateral valuation, end to end

Reload. This is the route the package anchor also unblocked, and it now files.

| # | Type or click | What you should see |
|---|---|---|
| B1 | `collateral valuation` | The brief, then **"Step 1 of 6 · Which collateral are we valuing?"** with four chips, each carrying its type, its value and its lendable figure: Accounts receivable (UCC-Accounts, $12M, $9.60M lendable), Inventory (UCC-Inventory, $8M, $4M), the Fort Wayne and Kokomo real estate (Real Estate-Warehouse, $14M, $10.50M), and the machinery blanket lien (UCC-Equipment, $10M, $7.50M). |
| B2 | `all` | Takes the whole set in one line. The lane shows "Collateral · 4 selected". |
| B3 | `7200000` | "What value are we filing for [the A/R]?" then the same for inventory, then the real estate, then the equipment. **One question per asset**, four in all. Type a figure for each. |
| B4 | `2026-08-31` | "As of what date was the valuation struck?" |
| B5 | `net orderly liquidation value` | "On what basis was it struck?" Twelve chips, all the org's own names: Actual Cash Value, As Complete Value, As Is Value, As Stabilized Value, Balance Sheet, Book Value, Cash Balance, Contents Value, Fair Market Value - Equipment / Transportation, Fair Market Value - Real Estate, **Net Orderly Liquidation Value**, Orderly Liquidation Value. |
| B6 | `field exam` | "And where did the figure come from?" offers twelve sources and **Field Exam is not one of them**. The room answers "I could not read that as one of the values above. Pick one, or say it exactly as it reads" and puts the twelve back up: Account Balance / Statement, Appraisal, Credit Officer, Financial Statement, Insurance Agent, Internal Valuation, Inventory Report, Invoice / Bill of Sale, Real Estate Abundance of Caution, Real Estate Evaluation, Real Estate Restricted Appraisal, Receivables Aging. **Known gap:** the addendum wanted the room to say out loud that this org holds no Field Exam source. It re-offers the list instead. Not built tonight. |
| B7 | click **Appraisal** | Then "Is this the primary valuation on the pledge?" with two chips that say what each does. Then "Name the appraiser or the exam, for the record." |
| B8 | `Field exam, August 2026` | **"Everything the collateral valuation needs is collected."** The chip under the composer reads **"10 answers collected · Review & file"**. |

At this point the lane on the right holds all ten answers and is the thing to look at. See Arc F.

---

## Arc C: the risk-rating review, and the scale

Reload. This is the arc with the most new behaviour.

| # | Type | What you should see |
|---|---|---|
| C1 | `downgrade them to a 5` | Binds the rating route. Four factor questions first: cash-flow coverage, revenue growth, management experience, credit score. Each is optional and carries a **Not assessed** chip. |
| C2 | `Not assessed` x4 | Then: **"The grade on file is 4, on the relationship. What grade does this analysis support, on the rating review's own scale?"** |
| C3 | `47` | **"The rating review's own scale is 1 to 12, in whole numbers, and I will not file a grade off it. Zero is not a grade on this scale either: skip the question instead. Give me a number from 1 to 12."** The question stays live and the lane does not move. |
| C4 | `99`, then `0`, then `6.5`, then `13` | The same refusal each time. Nothing is recorded. The lane still reads "4 answers". |
| C5 | `5` | Accepted. The lane goes to 5 answers and the room asks: "Are you overriding the computed grade? Give me the grade you are filing instead, or skip it." |
| C6 | `47` | Refused again, with the same sentence. **Both grades are bounded, not just the first.** |
| C7 | `6` | Accepted, and the room states the rule before the org has to: **"An override needs a written reason. That is the org's own rule and it has no bypass."** There is no skip chip on that question. |
| C8 | `Not assessed` | Refused: "I could not read that. Say it again." The comment is not optional while an override stands. |
| C9 | `they are special mention` | **"Special Mention, Substandard, Doubtful and Loss are the regulatory categories and this org's scale is numeric. I file the grade; the classification is assigned elsewhere and I will not write one into it."** Then it names the surface it is filing on. |

**What changed here.** The route used to accept 47, 99 and 0 as grades and file them. The Apex class
states the scale twice in its own comments and validates neither grade, so the org would have taken
the 47.

---

## Arc D: the client's ask

Reload.

| # | Type or click | What you should see |
|---|---|---|
| D1 | `james wants the june certificate` | **NOT** the five-way. One line: "That reads as something the client asked us for, which is a service request on this relationship rather than one of the reviews." Two chips: **Raise a service request** and **Something else**. |
| D2 | click **Raise a service request** | Binds the service route **with your own line**, so "james wants the june certificate" is already taken as the case subject. The room goes straight to **"Step 2 of 3 · And the request in full, as the servicing team needs to read it."** |

**Two questions, not three.** There is no "How did it reach us?" step: the org sets Case Type and
Case Origin from its own picklists and the tool takes no origin.

`Something else` at D1 puts the five back up, unchanged.

---

## Arc E: what this room does not do

Reload.

| # | Type | What you should see |
|---|---|---|
| E1 | `pledge the equipment to the 8M loan` | One line: **"That is facility work. Pledging security, cloning a covenant onto a renewal and reshaping a booked facility all run in Facility Actions on this relationship. This room takes the five reviews."** |
| E2 | `add a covenant on the relationship` | Bind a review first (say `covenant review`), then type it: the room composes the create and refuses it by name, with the org-side gap stated. Typed at the five-way it reaches the router instead. |

**What changed at E1.** The handoff used to live only inside a bound room, so this line at the
five-way was answered with a list of four reviews you had just asked for none of.

---

## Arc F: the lane, which now scrolls

Do Arc B again, and make the window short: about 1280 by 640. Ten answers on the lane.

What to look for, on the right:

- The head, **"This review · 10 answers · Scope"**, sits above the list and **does not move**. It
  states the whole review however far the chips have travelled.
- The chips scroll under it. The bar is invisible until your cursor or the keyboard is on the rail,
  and then it is a thin thread, never a grey gutter.
- The last chip stops **27 pixels short of the room's bottom edge**. Nothing is cut off and the
  composer and the "Review & file" chip do not move.
- A soft fade appears only on the edge that is actually holding content back.
- Click the lane and use the arrow keys, Page Up and Page Down, Home and End. It scrolls.
- **There is no "n earlier in this review" fold any more.** Every answer is on the rail.

Measured on the built artifact at 1280x640, ten answers: the scroller is 1185px of content in a
480px frame, the head is outside it, and the last chip's bottom is 599px against a room bottom of
626px.

**Caveat.** Under 1080px wide the lane is hidden entirely by a rule that predates this work. Keep
the window wider than that.

---

## Not in this drive

- **The covenant review cannot be demonstrated on Hartwell.** It carries no compliance rows in the
  org, so the route is an honest refusal. Demonstrating it needs a relationship that has rows, or a
  row raised on Hartwell in the org. Either is a deliberate change, not a quiet edit.
- **Nothing files against the org here.** The drive stubs the stage and execute tools. Do not read
  "Review & file" as a live write.
- **Do not open the room twice in one page load.** The consent moment is memoised per view and the
  second open replays the first greeting. Reload.
