# Hartwell Precision Manufacturing LLC - demo dossier

Written 2026-09-03 for the evening demo. This file is the single source of truth for
every Hartwell figure. The talk track, the bundle and the org are all written to agree
with it. If a number appears anywhere else and disagrees with this file, this file wins
and the other place is stale.

Account `001bb00001I7FPNAA3`, org `bankinggpt-at`
(`accenture-d8--bankinggpt.sandbox.my.salesforce.com`).

---

## 1. Who Hartwell is

Hartwell Precision Manufacturing LLC is a third-generation precision machining company
in Fort Wayne, Indiana. NAICS 332710, machine shops. It cuts close-tolerance components
on multi-axis CNC for three end markets: heavy truck and off-highway drivetrain, medical
device housings, and aerospace fittings. Two plants: the owner-occupied Fort Wayne
campus (218,000 sq ft on 22.4 acres) and a Kokomo plant (140,000 sq ft, under
expansion). About 310 employees.

Revenue LTM June 2026 is $64.2M on EBITDA of $5.2M, an 8.1 percent margin. The story of
the last three years is volume growth of roughly 22 percent against margin compression
from labour and steel, partly recovered in FY2025 as the medical mix grew.

**Owners and related parties**

| Party | Role |
|---|---|
| James Hartwell | Owner, 100 percent member. Unlimited personal guarantor on six loans. |
| Elena Hartwell | Spouse. Limited guarantor, capped, on the real estate package. |
| Hartwell Logistics LLC | Affiliate under common control. Runs the private fleet, leases dock space from the borrower. Not a borrower, not a guarantor. |

Relationship manager: Fabian Goetzens. Primary risk rating 4. Annual review completed
2026-07-15, rating affirmed at 4.

---

## 2. Facilities

Two product packages. **Same maturity date for every loan of the same product class
within a package.** The lines in the C&I package mature together on **2027-03-15**, the
term loans in the C&I package mature together on **2031-03-15**, and the real estate
package carries **2036-01-31** for the mortgage and **2033-01-31** for the equipment
note. This is the choice: one maturity per product class per package, not one per
package, because a 20-year mortgage and a 7-year equipment note cannot share a date
without one of them being wrong.

### 2.1 Hartwell Industrial C&I Credit Package - `a5Fbb000000IHFJEA4`

Six booked facilities, $46.0M committed, $31.03M drawn.

| Loan | Id | Committed | Drawn | Product | Purpose | Rate | Term | Amortisation | First payment | Maturity |
|---|---|---|---|---|---|---|---|---|---|---|
| Revolving line | `a4Zbb0000027MaYEAU` | $15,000,000 | $9,200,000 | Line of Credit | Working capital | SOFR + 2.25%, 6.58% all-in | 24 mo | Interest only, bullet | 2025-04-15 | 2027-03-15 |
| Seasonal line | `a4Zbb0000027MttEAE` | $2,500,000 | $1,150,000 | Line of Credit | Working capital | SOFR + 2.50%, 6.83% all-in | 24 mo | Interest only, bullet | 2025-04-15 | 2027-03-15 |
| Equipment term | `a4Zbb0000027MnREAU` | $8,000,000 | $5,900,000 | Equipment | Equipment purchase | 6.45% fixed | 60 mo | 84 mo | 2026-04-20 | 2031-03-15 |
| Construction | `a4Zbb0000027Mp3EAE` | $12,000,000 | $7,350,000 | Construction | Business expansion | SOFR + 2.75%, 7.08% all-in | 60 mo | 240 mo | 2026-04-01 | 2031-03-15 |
| Purchase | `a4Zbb0000027MqfEAE` | $5,000,000 | $4,420,000 | Purchase | Commercial real estate purchase | 6.20% fixed | 60 mo | 180 mo | 2026-04-10 | 2031-03-15 |
| Equipment term | `a4Zbb0000027MsHEAU` | $3,500,000 | $3,010,000 | Equipment | Equipment purchase | 6.75% fixed | 60 mo | 84 mo | 2026-04-18 | 2031-03-15 |

Plus one unbooked facility on the same package: **$3,000,000 Equipment,
`a4Zbb000002CECXEA4`, stage Proposal.** It is the CNC cell the equipment expansion
opportunity is chasing. It carries no drawn balance and is excluded from exposure.

Two maturity dates moved from what the org previously held. The $2.5M seasonal line read
**2026-06-30**, which is in the past and would have shown an expired live facility on
screen. It now reads 2027-03-15 with the other line. The construction facility read
2026-11-01 and the three other term loans read 2030-09-20, 2028-05-10 and 2030-02-18;
all four now read 2031-03-15.

### 2.2 Hartwell Real Estate Package - second package, created 2026-09-03

Two booked facilities, $8.0M committed, $7.67M drawn.

| Loan | Committed | Drawn | Product | Purpose | Rate | Term | Amortisation | First payment | Maturity |
|---|---|---|---|---|---|---|---|---|---|
| Owner-occupied CRE term | $6,500,000 | $6,340,000 | Real Estate Term | Commercial real estate purchase | 6.35% fixed | 120 mo | 240 mo | 2026-02-28 | 2036-01-31 |
| Equipment term | $1,500,000 | $1,330,000 | Equipment | Equipment purchase | 6.60% fixed | 84 mo | 84 mo | 2026-02-28 | 2033-01-31 |

The mortgage takes a first lien on the Fort Wayne campus. The equipment note takes a
first lien on the coordinate measuring and inspection equipment. The DSC of Borrower
covenant is associated to both. James Hartwell guarantees both, unlimited.

### 2.3 Relationship totals

| | |
|---|---|
| Committed, both packages | **$54,000,000** |
| Drawn | **$38,700,000** |
| Available | $15,300,000 |
| Utilisation | 71.7 percent |

**This is a deliberate change from the $31.0M of $46.0M the client page read this
morning.** The second package adds $8.0M committed and $7.67M drawn. Every headline on
the page, and every figure in the talk track, must use $38.7M of $54.0M.

### 2.4 Pricing components

Every booked facility carries a pricing stream with a rate component and a payment
component, on the Flowers For Dreams pattern:

- Rate component: `Interest_Rate_Type = Fixed`, `Term_Unit = Unit_Months`,
  frequency `Frequency_Monthly`, rate as the table above.
- Payment component: frequency `Frequency_Monthly`, payment includes
  **Interest and Principal** for the term loans, **Interest** only for the two lines.

Before this session only the two C&I lines carried seeded components. All eight booked
facilities carry them now.

---

## 3. Covenants

Six covenants on the relationship. Four quarterly financial tests, one monthly borrowing
base test, one one-off construction condition.

| Covenant | Id | Type | Threshold | Frequency | Last test 2026-06-30 | Result | Next due |
|---|---|---|---|---|---|---|---|
| COV-000646 | `a3Bbb000000S0UvEAK` | Debt Service Coverage of Borrower | >= 1.25x | Quarterly | **1.38x** | Compliant | 2026-09-30 |
| COV-000647 | `a3Bbb000000S0WXEA0` | Maximum Debt to Worth | <= 3.00x | Quarterly | **2.42x** | Compliant | 2026-09-30 |
| COV-000648 | `a3Bbb000000S0Y9EAK` | Minimum Liquidity | >= $5,000,000 | Quarterly | **$6,800,000** | Compliant | 2026-09-30 |
| COV-000649 | `a3Bbb000000S0ZlEAK` | DSC with and without Distributions | >= 1.15x | Quarterly | **1.22x** | Compliant | 2026-09-30 |
| COV-000650 | `a3Bbb000000S0bNEAS` | Accounts Receivable (eligibility) | >= 80% eligible | Monthly | **84%** | Compliant | 2026-09-08 |
| COV-000651 | `a3Bbb000000S0czEAC` | Term Covenants (construction completion) | Certificate of occupancy, Kokomo | One-off | not yet tested | In Progress | 2026-11-01 |

COV-000650 is attached to the $15M line. COV-000651 is attached to the construction
facility. COV-000646 is attached to both real estate package loans.

Compliance rows: **four Compliant rows for the quarter ended 2026-06-30** carrying the
observed values above, and **six Pending rows** as the next test, due 2026-09-30 for the
four quarterly tests, 2026-09-08 for the AR test and 2026-11-01 for the term covenant.
The Pending rows are what makes the covenant review file during the demo. They stay
Pending.

Nothing is breached. The relationship is clean, which is the point: the demo is about a
performing borrower where the work is administrative, not a workout.

---

## 4. Collateral

| Collateral | Id | Type | Sub-type | Descriptor | Value | Valued | Method | Lien | Advance | Pledged to |
|---|---|---|---|---|---|---|---|---|---|---|
| COL-000762 | `a35bb0000013xz3AAA` | UCC | Accounts | Accounts receivable, eligible. Excludes invoices over 90 days past due, uninsured foreign debtors, intercompany and contra accounts. 20 percent concentration cap per debtor. | $12,000,000 | 2026-08-31 | Borrowing base certificate | 1st | 80% | $15M line, $2.5M line |
| COL-000763 | `a35bb0000013y0fAAA` | UCC | Inventory | Inventory at Fort Wayne and Kokomo: raw bar and plate stock, work in process, finished goods. Excludes consigned material and stock over 12 months old. | $8,000,000 | 2026-08-31 | Borrowing base certificate | 1st | 50% | $15M line |
| COL-000764 | `a35bb0000013y2HAAQ` | UCC | Equipment | Blanket lien on all production machinery: 14 multi-axis CNC centres incl. Mazak Integrex i-400 (2022) and DMG Mori NTX 2500 (2023), grinding and EDM cells. | $10,000,000 | 2026-05-22 | Orderly liquidation appraisal | 1st | 75% | $8M equipment, $3.5M equipment |
| COL-000765 | `a35bb0000013y3tAAA` | Real Estate | Warehouse / Industrial | First mortgage, 4820 Adams Center Road, Fort Wayne IN 46806 (218,000 sq ft on 22.4 acres) and 2100 Home Avenue, Kokomo IN 46902 (140,000 sq ft, under expansion). | $14,000,000 | 2026-06-04 | MAI appraisal, as-is | 1st | 75% | $12M construction, $5M purchase, $6.5M CRE term |
| Inspection equipment | new | UCC | Equipment | Zeiss CONTURA and Hexagon Global S coordinate measuring machines, optical comparators, calibration lab. | $2,100,000 | 2026-01-20 | Invoice cost less depreciation | 1st | 70% | $1.5M equipment term |

Pledged value across the relationship is $46.1M, lendable $34.7M against $38.7M drawn.
The construction facility remains the one thin spot: $5.5M allocated of a $12.0M
commitment, a 0.75 coverage ratio, which the Kokomo completion in November cures. Say
that out loud rather than hiding it. It is the only red pixel on the page and it has a
dated answer.

---

## 5. Guarantors

| Guarantor | Type | Cap | Covers |
|---|---|---|---|
| James Hartwell | Unlimited personal guaranty | none | All six C&I facilities and both real estate facilities |
| Elena Hartwell | Limited personal guaranty | $2,000,000 | Real estate package only |

Hartwell Logistics LLC is an affiliate under common control and is **not** a guarantor.
It appears on the relationship graph as a related party so the room can see it, and the
right answer when someone asks is that it is out of the credit box.

---

## 6. Opportunities

| Opportunity | Stage | Amount | Close | One line |
|---|---|---|---|---|
| Hartwell Industrial - Treasury Services Expansion | Proposal | $185,000 | 2026-10-30 | Move operating and payroll accounts, add positive pay and lockbox; annual fee income. |
| Hartwell Industrial - CNC Cell Equipment Expansion | Qualification | $3,000,000 | 2026-11-14 | Finance the fifth multi-axis cell at Kokomo; the Proposal-stage $3M equipment facility already sits on the C&I package. |
| Hartwell Industrial - Interest Rate Swap | Qualification | $12,000,000 | 2026-12-12 | Fix the floating construction exposure for five years ahead of the 2031 maturity. |

The first already exists in the org (`006bb00000tsmeNAAQ`). The other two are created
in this session.

---

## 7. Audit trail, last 90 days

Ten entries, oldest first. This is what the activity feed and the action history read.

| Date | Entry |
|---|---|
| 2026-06-08 | Borrowing base certificate received for May; eligible AR 84 percent, no ineligibles added. |
| 2026-06-22 | Site visit, Kokomo. Expansion shell complete, mechanical in progress. Photos filed. |
| 2026-07-06 | Q2 financial statements received from Hartwell's controller, company-prepared. |
| 2026-07-14 | Covenant tests recorded for quarter ended 2026-06-30. DSC 1.38x, debt to worth 2.42x, liquidity $6.8M, DSC with distributions 1.22x. All compliant. |
| 2026-07-15 | Annual review completed. Risk rating affirmed at 4. Recommendation: maintain. |
| 2026-07-29 | Email from James Hartwell: asks whether the fifth CNC cell can be added to the existing equipment line rather than a new facility. |
| 2026-08-05 | Reply to James: new facility is cleaner for the collateral schedule; $3M proposal opened. |
| 2026-08-12 | Equipment appraisal ordered, orderly liquidation basis, for the Kokomo machinery. |
| 2026-08-20 | Loan modification filed on the $2.5M seasonal line: maturity aligned to 2027-03-15 with the $15M line. |
| 2026-08-31 | August borrowing base certificate received. AR $12.0M, inventory $8.0M, no covenant exceptions. |

---

## 8. Boom-style spread

Source file `Hartwell_Precision_FY2025_LTM.xlsx`. Fiscal year ends 31 December.
LTM is the twelve months to 30 June 2026. All figures in US dollars.

### Income statement

| | FY2023 | FY2024 | FY2025 | LTM Jun-2026 |
|---|---|---|---|---|
| Revenue | 52,400,000 | 58,900,000 | 63,800,000 | **64,200,000** |
| COGS | 40,346,000 | 45,120,000 | 48,490,000 | 48,600,000 |
| Gross profit | 12,054,000 | 13,780,000 | 15,310,000 | 15,600,000 |
| Gross margin | 23.0% | 23.4% | 24.0% | **24.3%** |
| Operating expense | 7,934,000 | 9,170,000 | 10,270,000 | 10,400,000 |
| EBITDA | 4,120,000 | 4,610,000 | 5,040,000 | **5,200,000** |
| EBITDA margin | 7.9% | 7.8% | 7.9% | **8.1%** |
| Depreciation and amortisation | 1,850,000 | 2,010,000 | 2,180,000 | 2,240,000 |
| EBIT | 2,270,000 | 2,600,000 | 2,860,000 | 2,960,000 |
| Interest expense | 1,190,000 | 1,380,000 | 1,610,000 | **1,760,000** |
| Pre-tax income | 1,080,000 | 1,220,000 | 1,250,000 | 1,200,000 |
| Tax | 259,000 | 293,000 | 300,000 | 288,000 |
| **Net income** | **821,000** | **927,000** | **950,000** | **912,000** |

### Balance sheet, as at 30 June 2026

| | |
|---|---|
| Cash | 2,600,000 |
| Accounts receivable | 11,400,000 |
| Inventory | 9,600,000 |
| Other current assets | 1,200,000 |
| **Total current assets** | **24,800,000** |
| Accounts payable | 4,100,000 |
| Accrued liabilities | 1,728,000 |
| Current portion of long-term debt | 8,372,000 |
| **Total current liabilities** | **14,200,000** |
| **Total debt** | **38,700,000** |
| Total liabilities | 44,528,000 |
| **Tangible net worth** | **18,400,000** |

### Ratios

| Ratio | Value | How it is built |
|---|---|---|
| **DSCR** | **1.38x** | EBITDA 5,200,000 / debt service 3,768,000 (interest 1,760,000 + principal 2,008,000) |
| **Leverage, debt to worth** | **2.42x** | Total liabilities 44,528,000 / tangible net worth 18,400,000 |
| **Current ratio** | **1.75x** | Current assets 24,800,000 / current liabilities 14,200,000 |
| **Fixed charge coverage** | **1.22x** | EBITDA 5,200,000 / (debt service 3,768,000 + distributions 493,000 = 4,261,000) |
| Interest coverage | 2.95x | EBITDA 5,200,000 / interest 1,760,000 |
| Liquidity | $6,800,000 | Cash 2,600,000 + unused eligible availability 4,200,000 |

Every covenant value in section 3 is one of these ratios. DSC 1.38x is the DSCR row.
Debt to worth 2.42x is the leverage row. DSC with distributions 1.22x is the fixed
charge row. Liquidity $6.8M is the liquidity row. The spread and the covenants are the
same arithmetic seen twice, and that is the line to say when someone asks whether the
numbers are real.

---

## 9. What to say if a figure is challenged

- **Committed and drawn**: $54.0M committed, $38.7M drawn, 71.7 percent utilised,
  across two packages. Not $46.0M. The real estate package is the difference.
- **Revenue**: $64.2M LTM. The account record previously carried $85M in the annual
  revenue field, which was wrong against the spread. It has been corrected to $64.2M.
- **Risk rating**: 4 on the relationship. Two facilities carry a 5 at facility level,
  the construction facility and the seasonal line, and that is deliberate.
- **The one weak coverage ratio**: construction, 0.75. Cured on certificate of
  occupancy, tested 2026-11-01 under COV-000651.
