# Customer 360 / EWS — Data Mapping (the "100% confirmed how we map" doc)

Set 2026-06-29 (Fabian: confirm exactly how every dashboard element maps to a source before we build).
Scope: the v1 MVP = **read-only** EWS portfolio dashboard (inspired by the Truist mock, made better) that
**drills into a read-only single-customer 360**. Grade + a composite **Borrower Health Index (BHI)**.

**Status legend** for every mapping:
- ✅ **VERIFIED-LIVE** — field/tool confirmed in the bankinggpt sandbox, carries Piedmont data.
- 🟡 **VERIFIED-SHALLOW** — field/tool exists + confirmed, but seeded data is thin (often Piedmont-only);
  book-level numbers are real-shaped, demonstrated with Piedmont + synthetic siblings.
- 🟠 **STUBBED** — source not live yet (Snowflake rating/PD on Snowflake; CapIQ/IBIS peers). Placeholder seed.
- ⚙️ **COMPUTED** — derived server-side (SR 11-7: deterministic, in code, never LLM-computed).
- 🔧 **CONFIG** — per-tenant configurable (grouping key, thresholds, covenant/collateral generation).

Two invariants on every row: the cockpit **concludes and routes; a human commits**; every regulated figure is
**deterministic server-side, never LLM-computed**.

---

## 0. Identity & portfolio scoping (how we know whose book this is)
| Element | Source | Status |
|---|---|---|
| Acting user / "Good morning, {name}" | `getUserInfo` (run-as-user OAuth) | ✅ |
| The RM's book (portfolio scope) | Packages/Accounts/Loans where **OwnerId = me** OR named-officer lookup = me: `Account.Bank_Relationship_Manager__c` / `Account.Primary_Officer__c`; `Package.LLC_BI__Primary_Officer__c` / `LLC_BI__Secondary_Officer__c`; `Loan.LLC_BI__Loan_Officer__c` / `cm_Portfolio_Manager__c` | ✅ fields / 🟡 sparse |
| Graceful fallback | If named-officer lookups are null (Piedmont), fall back to ownership + the connected obligor group; never error on a sparse book | ⚙️ |
| Admin god-mode (see any book) | gated + audited cross-user read | 🔧 |

> Live check (2026-06-29): the book-by-owner rollup returns one user owning the single funded package
> (TCE $12.5M). So scoping logic is real; **depth is Piedmont-only** — demo the book with synthetic siblings.

---

## 1. Portfolio summary (the four KPI tiles)
| Tile | Source | Status |
|---|---|---|
| Managed Exposure | `SUM(LLC_BI__Product_Package__c.LLC_BI__TCE__c)` across the book (TCE rollup, never naive loan sum) | ✅ field / 🟡 depth |
| Active Clients | `COUNT(DISTINCT Account)` in the book | ✅ / 🟡 |
| EWS Alerts | `COUNT(borrowers with >=1 fired trigger above threshold)` | ⚙️ over §4 |
| Open Tasks | `COUNT(Task WHERE OwnerId = me AND IsClosed = false)` + the tickler/work-queue | ✅ (std Task) |

---

## 2. Borrower Health Alerts rail + Recent Clients (per-borrower row)
| Element | Source | Status |
|---|---|---|
| Borrower name | `Account.Name` | ✅ |
| Industry / sector | `Account` NAICS (`LLC_BI__NAICS__c` / industry field) | ✅ |
| Exposure | `Package.LLC_BI__TCE__c` (group rollup) | ✅ / 🟡 |
| **Risk grade (RG)** | `Package.LLC_BI__Risk_Rating__c` (picklist; Piedmont = 5) · loan grade `Loan.LLC_BI__Risk_Grade__c` | ✅ |
| **EWS state** (Pass / Watch / Alert) | banded from the fired-trigger set + severity rubric (§4, EARLY-WARNING.md) | ⚙️ |
| **BHI (0-100)** | composite health score (§3) | ⚙️ |
| Top trigger / "why" | the highest-severity fired signal for that borrower (§4) | ⚙️ |
| Sector-deterioration narrative | aggregate the book by NAICS × EWS state; industry outlook from peers | ⚙️ + 🟠 peers |

---

## 3. Borrower Health Index (BHI) — the composite score (Fabian: grade + BHI)
A deterministic **0-100** score, computed server-side, **decision-support only — never a regulatory grade**
(SR 11-7). It is the early-warning lens; the `LLC_BI__Risk_Rating__c` grade stays the regulatory anchor.

- **Inputs = the seven EWS signal classes** (EARLY-WARNING.md §1), each scored 0-3 deterministically:
  financial deterioration (Boom ratios), covenant headroom (`deal_covenant_grade`), behavioral/servicing
  (AFS), risk migration (Snowflake 🟠), deposit/wallet (FSC), external/industry (CapIQ/IBIS 🟠), structural
  (collateral/guaranty/modification cluster).
- **Composite**: weighted sum → normalized to 0-100, **higher = healthier** (inverse of severity). Weights
  are 🔧 per-tenant (the EWS scorecard weights are part of "tomorrow's" incoming detail; default weights
  shipped, replaceable by config).
- **Banding** (illustrative defaults, 🔧): 80-100 Healthy · 60-79 Watch · 40-59 Elevated · <40 Critical.
  Maps to but never overrides the grade; a band change raises a flag, never moves a grade.
- **Provenance**: every BHI shows its contributing signals + the source field behind each (drill to the
  Boom ratio, the covenant cushion, the AFS utilization). No black box.

---

## 4. EWS triggers (the fired-signal set behind every alert + the BHI)
Full taxonomy in EARLY-WARNING.md §1/§5. Source map (each = a deterministic read):
| Signal class | Source / tool | Status |
|---|---|---|
| Financial deterioration | Boom `boom_get_ratios` / `boom_get_spread` (server-side via experience-mcp `boomFinancials.js`) | ✅ |
| Covenant breach / thin headroom | `deal_covenant_grade` over `LLC_BI__Covenant2__c` (threshold `Financial_Indicator_Value__c` vs actual `Last_Evaluation_Value__c`) | ✅ |
| Behavioral / servicing | AFS `revolver_utilization`, `payment_history`, `loan_summary` | ✅ (fixture)/🟡 |
| Risk migration | Snowflake `rating` / `PD` / sensitivity (Snowflake) | 🟠 stub |
| Deposit / wallet | FSC `FinServ__*` household deposits/balances | 🟡 (empty for Piedmont) |
| External / industry | CapIQ / IBIS peer medians + sector outlook | 🟠 stub |
| Structural | `LLC_BI__Loan_Collateral2__c.Current_Lendable_Value__c` vs outstanding; guaranty via Connection graph; `LLC_BI__Loan_Modification__c` cluster; `LLC_BI__LoanRenewal__c` maturity | ✅ |

---

## 5. Single-customer 360 (the drill target — read-only)
| Panel | Source | Status |
|---|---|---|
| Header verdict (who/grade/exposure/BHI/next move) | composed from below | ⚙️ |
| Entity & ownership graph | `LLC_BI__Connection__c` (ownership %, role) + `LLC_BI__Legal_Entities__c` (borrower/guarantor) | ✅ |
| Household (people + wallet) | FSC `AccountContactRelation` / `FinServ__AccountAccountRelation__c` + deposit rollups | ✅ model / 🟡 data |
| Exposure | `Package.LLC_BI__TCE__c/TBE__c/TOE__c` + collateral `LLC_BI__Loan_Collateral2__c` (lendable, advance rate, lien) | ✅ |
| Risk | grade `Package.LLC_BI__Risk_Rating__c` + covenant grade (`deal_covenant_grade`) + Snowflake PD | ✅ / 🟠 Snowflake |
| Active deals / mods / renewals | `Package.LLC_BI__Stage__c`; `LLC_BI__Loan_Modification__c`; `LLC_BI__LoanRenewal__c` (43 live) | ✅ |
| Credit history (memo as a source) | `cm_*` Product-Package narratives, `LLC_BI__Credit_Memo__c`; ledger `recall_decisions` | ✅ |

---

## 6. What's read-only-able TODAY vs what we still need
- **Fetch-ready now (no new build):** nCino + FSC reads (`sobject-sf`), Boom ratios/spread, AFS servicing,
  `deal_covenant_grade`, the Snowflake decision ledger (`recall_decisions`). → covers §0,1,2,5 and 5 of 7
  EWS signal classes.
- **Still needed:** Snowflake rating/PD live (Snowflake) + CapIQ/IBIS peers (2 of 7 signal classes); the new
  native Customer 360 MCP as the read spine (we proxy via `sobject-sf` today); the EWS scorecard weights +
  bank-specific thresholds (incoming); deeper seed data for a convincing book-level demo.
- **Deferred (write, later phase):** `record_decision` / watch-list placement / task creation / stage a
  modification or renewal — all via the proven credit-memo write path, gated.
