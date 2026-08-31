# Workroom Object Coverage — the track list

What the C360 workroom caters for, per nCino object, as of 2026-08-31. The canonical mirror of the
[coverage tracker artifact]. Update BOTH when an arm ships.

## Tier 1 — FILES (a governed write authors it today)

| Object | What files | Proof |
|---|---|---|
| `LLC_BI__Loan__c` (facility) | Amount, maturity date, rate, term — applied to the modification CLONE; new-facility create at Qualification (+ one hop to Proposal); every member cloned by the version roll | Founder click + wire-proves 08-30 |
| `LLC_BI__Product_Package__c` (credit package) | Create (create flow); NEW VERSION via credit action (isNewPackage), name + account repaired post-engine | Wire-proves 08-30 |
| `LLC_BI__Covenant2__c` (covenant) | NET-NEW create, born Pending/Active on the borrower; type resolved against the org's 60-entry catalog (ambiguous names refused with ids) | COV-000662 live, 08-30 |
| `LLC_BI__Account_Covenant__c` (account association) | Created beside every net-new covenant, the way nCino's own UI does (founder correction 08-31); Hartwell's 6 seeded covenants backfilled | 74 tests green, 08-31 |
| `LLC_BI__Loan__c` FIELD WAVE | Any updateable non-formula loan field outside the doctrine deny-list, via `fieldChangesJson`: resolved by API name OR label against the live describe, values coerced by field type, picklists validated with the org's legal list returned on refusal | Deployed 08-31; client wiring in flight |
| `LLC_BI__Loan_Covenant__c` (covenant junction) | Attach the net-new covenant to the clone; CARRIED on every version roll | Wire-proves 08-30 |
| `LLC_BI__Legal_Entities__c` (borrowing structure) | ADD on the clone under the five-role birth state (Borrower, Co-Borrower, Guarantor, Limited Guarantor, Related Entity); REMOVE as CARRY EXCLUSION — parent untouched, nothing deleted; borrower row on the create flow; CARRIED on every roll | Wire-prove 08-30 (release EPC guarantor + add Limited Guarantor) |
| `LLC_BI__Collateral_Valuation__c` | Create (batch ≤ 20, per-item valuationDate, same-asset-same-date guard) | Live 08-25 |
| `LLC_BI__Covenant_Compliance2__c` | Update only → Compliant / Waived / Exception (covenant review) | Live 08-25 |
| `LLC_BI__Annual_Review__c` (risk rating) | Create at In Review | Live 08-25 |
| `LLC_BI__Review__c` (annual review) | Create at In Progress | Live 08-25 |
| `Case` (service request) | Create at New | Live 08-25 |
| `LLC_BI__LoanRenewal__c` (version chain) | Written by nCino's engine; we map clone→parent through it and verify by re-query | Every versioning run |

## Tier 2 — CARRIED (replicated by the versioning carry, verified by count)

| Object | Carry behavior |
|---|---|
| `LLC_BI__Loan_Collateral2__c` (pledge) | Replicated onto each clone (7 of 7 proven on Hartwell) |
| `LLC_BI__Loan_Collateral_Aggregate__c` | FRESH shell per clone — aggregates are per-loan rollup anchors, reuse would cross versions |
| `LLC_BI__Loan_Covenant__c` / `LLC_BI__Legal_Entities__c` | Carried too (see Tier 1) — removes are expressed as exclusions here |

The engine copies NOTHING itself (probed: all 8 RelatedListsCopyConfiguration defaults on → zero
rows). The carry is ours, synchronous, in-transaction, OP_CARRY-guarded.

## Tier 3 — NEXT (designed on the shipped pattern, not yet built)

| Object / arm | Shape |
|---|---|
| Fees (`LLC_BI__Fee__c`) | UNBLOCKED (founder correction 08-31): direct required loan lookup, no junction. 4 realistic fees seeded on Hartwell (origination 0.50 pct, attorney flat, appraisal flat, unused commitment 0.25 pct as 'Other' because the Fee_Type picklist is residential/TRID with no commitment entry, founder call if visible). Org facts: RecordTypeId refused for this profile (use `LLC_BI__Record_Type__c` picklist); percentage fees demand `Basis_Source` + `Percentage` and the org computes Amount itself. Arm = create-on-clone + carry |
| Pledge EXISTING collateral | Author the pledge on the clone + fresh aggregate — the same write the carry already performs, authored instead of replicated |
| `LLC_BI__Collateral__c` + `LLC_BI__Collateral_Type__c` create-then-pledge | The connected chain: collateral → ownership → pledge, no orphans (catalog chainLinks already carry it); type needs an advance rate (org VR) |
| `LLC_BI__Policy_Exception__c` | PROBED SAFE 08-31: no approval process targets it, zero emails. Caveat: an org-local `PolicyExceptionCDC` trigger egresses the record to an external AWS endpoint on create (sandbox EventBridge relay, the same class the loan CDC uses). Minimum usable create: Type + Name + Loan + Status (defaults Unmitigated) |
| Loan field wave (`fieldChangesJson`) | Amortization, payment structure, purpose, index/spread etc. on the clone — a describe-curated per-field allowlist extension of apply_changes |

## Tier 4 — DISCOVERY (an org fact blocks the design)

| Object | The blocker |
|---|---|
| Pricing (`LLC_BI__Pricing_Stream__c`) | Hartwell's 2 streams are SHELLS: rate/payment flags true but zero components, no stored index, spread, rate or schedule anywhere in the tree. A carry must re-point `LLC_BI__Context_Id__c` (a plain TEXT field holding the loan id, so a copy silently carries the wrong id). Demo pricing detail must be seeded before it can be shown |

## Fences (deliberate refusals, not gaps)

- Covenant AMEND / DETACH — every junction field is non-updateable; detach is a delete
- Covenant assessment from the workroom — separate action; a compliance CREATE fires the unrecallable acnpex approval email
- Package stage / status — the org's package automation owns them
- BOOKING — LV06: nCino's own Submit for Approval, no bypass
- Deletes, all objects — the carry exclusion expresses removal without one
- Involvement roles Grantor / Contractor — collateral and construction semantics, not borrowing structure

## Association law (founder corrections, 2026-08-31)

A record that belongs to the relationship carries its ACCOUNT association, always:
- Covenant -> `LLC_BI__Account_Covenant__c` (arm-enforced + test-pinned; Hartwell backfilled)
- Collateral -> `LLC_BI__Account_Collateral__c` (Owner / Primary / 100 pct / pledging authority; Hartwell's 4 backfilled; mandatory link in the create-collateral chain)
- Liens: NO carry needed. The lien's required master is the COLLATERAL (shared, not versioned); its loan lookup is nillable and follows at booking.

Read side: the ten `Customer360*` tools read everything above regardless of write tier.
Recon evidence: `knowledge/sf-build-v2/recon-20260831.md` and `field-inventory-20260831.json`.
