/* =============================================================================
   THE ACCOUNT'S COLLATERAL, AND THE PLEDGES UNDER EACH ASSET.

   FOUNDER READ (2026-09-03, on the exposure pane's collateral block): "Why is
   the collateral name that long? Should it not be Collateral Type and Sub-type
   and address information? ... I would like to have the account collaterals
   shown here nicely and not confusing; clicking onto it shows the active
   pledges."

   nCino's chain is `LLC_BI__Collateral__c` (the asset) to
   `LLC_BI__Account_Collateral__c` (ownership) to `LLC_BI__Loan_Collateral2__c`
   (the pledge). The exposure read arrives the other way round, a PLEDGE per
   facility, so a warehouse securing three loans arrives three times. The asset
   is the thing a banker reads, and the pledges are its detail.

   NAMING. `LLC_BI__Collateral_Type__c` is named `<Family>-<Sub-type>` in this
   org ("UCC-Accounts", "Real Estate-Warehouse"), so the split on the first
   hyphen is the ORG's own two-level classification, not a guess. A type with no
   hyphen is a family with no sub-type recorded, and says so rather than being
   cut in half.

   THE DESCRIPTOR is the first sentence of the org's description, which is what
   the asset IS. The whole description stays available on hover and the org's
   autonumber name rides beside it, because the long prose as a title is the
   defect being fixed.
   ============================================================================= */

import type { BorrowerBundle, Collateral, Facility } from "../data/contract";
import { facilityProduct } from "../data/facilityStage";
import { isActiveFacility } from "../data/worklist";

export interface AssetPledgeRow {
  loanId?: string;
  /** The product, out of the org's own loan name ("Line of Credit"). */
  facility: string;
  fullName: string;
  committed: number | null;
  /** This facility's share of the asset (`LLC_BI__Amount_Pledged__c`). */
  pledged: number | null;
  lienPosition?: string;
  advanceRate: number | null;
  /** The org's own answer to WHO set that rate. */
  advanceRateSource?: string;
  /** TRUE where the source names a pledge-level override. */
  overridden: boolean;
}

export interface CollateralAsset {
  key: string;
  collateralId?: string;
  /** The org's autonumber name, e.g. COL-000762. */
  collateralName?: string;
  /** The whole `LLC_BI__Collateral_Type__c` name, unsplit. */
  collateralType?: string;
  /** The family, before the first hyphen. */
  type: string;
  /** The sub-type, after it. Null where the type carries none. */
  subType: string | null;
  /** The first sentence of the org's description. Null where there is none. */
  descriptor: string | null;
  /** The whole description, for the title attribute. */
  description: string | null;
  value: number | null;
  advanceRate: number | null;
  lendableValue: number | null;
  pledges: AssetPledgeRow[];
  /** The count badge, in words. */
  badge: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Active means active. A pledge the org has released is not security, and an
 *  absent status is treated active the way F6 treats an absent facility status. */
const isActivePledge = (c: Collateral): boolean => {
  const s = (c.pledgedStatus ?? "").trim().toLowerCase();
  return s === "" || s === "active";
};

/** `<Family>-<Sub-type>`, split on the FIRST hyphen only: "Real Estate-Warehouse"
 *  is a two-word family, and splitting on every hyphen would lose it. */
export function splitCollateralType(type: string | undefined): { type: string; subType: string | null } {
  const raw = (type ?? "").trim();
  if (!raw) return { type: "Collateral", subType: null };
  const at = raw.indexOf("-");
  if (at <= 0 || at === raw.length - 1) return { type: raw, subType: null };
  return { type: raw.slice(0, at).trim(), subType: raw.slice(at + 1).trim() };
}

/** The first sentence, so the row reads as a descriptor rather than a paragraph.
 *  A description with no sentence break is returned whole and the cell's own
 *  ellipsis handles the length. */
export function firstSentence(text: string | undefined | null): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const m = /^(.+?[.!?])(\s|$)/.exec(raw);
  return (m ? m[1] : raw).trim();
}

/* =============================================================================
   THE SHORT ASSET TITLE (founder finding, 2026-09-03, on the pledge lane).

   He pledged the blanket AR collateral and the cards and the confirm sentence
   printed the record's full legal description as the asset's NAME, six times
   over: "All present and future accounts receivable. Excludes invoices over
   90 days past due, uninsured foreign debtors, intercompany and contra
   accounts. 20% concentration cap per account debtor." is what the asset IS,
   not what a banker reads it as in a sentence.

   TYPE-AND-SUB-TYPE PLUS A COMPACT DESCRIPTOR, never the description field
   whole and never the org's autonumber name (COL-000762): "UCC-Accounts ·
   blanket receivables". Every surface that speaks or cards a pledged asset,
   the pledge card, the confirm sentence, a chip, the plan read-back, the
   manifest rail, reads through this rather than the org's own fields, so the
   full description never reaches the glass by a second, uncorrected path. It
   stays reachable behind the card's own info affordance and in the dossier,
   because it is still what the record IS; it is only never the NAME.
   ============================================================================= */

/** Up to six words off the first sentence of the org's own description. The
 *  fallback is a plain word, never the org's autonumber: an asset this read
 *  carries no description for is still "the asset", not COL-000762. */
export function shortDescriptor(description: string | undefined | null, fallback = "the asset"): string {
  const sentence = firstSentence(description) ?? (description ?? "").trim();
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 6);
  return words.length ? words.join(" ") : fallback;
}

/** The org's own type name (unsplit: "UCC-Accounts", "Real Estate-Warehouse")
 *  joined to the short descriptor, the way the collateral pane's own type and
 *  sub-type read beside each other. Callers still clip the result to their own
 *  cap (`clipTitle`, `components/workroom/elicit.ts`) as the last defence
 *  against a description that carries no sentence break at all. */
export function shortAssetTitle(
  kind: string | undefined | null,
  description: string | undefined | null,
  fallback = "the asset",
): string {
  const type = (kind ?? "").trim();
  const descriptor = shortDescriptor(description, fallback);
  return type ? `${type} · ${descriptor}` : descriptor;
}

/**
 * One row per ASSET, with its active pledges underneath.
 *
 * Grouped by `collateralId` where the assembler staged one; a pledge without an
 * id is still listed, because a banker should see the security whether or not a
 * valuation can be written against it.
 */
export function collateralAssets(bundle: BorrowerBundle | null | undefined): CollateralAsset[] {
  const relationship = bundle?.snapshot?.name;
  const facilities: Facility[] = (bundle?.exposure?.facilities ?? []).filter(isActiveFacility);
  const order: string[] = [];
  const byKey = new Map<string, CollateralAsset>();

  facilities.forEach((f, fi) => {
    (f.collateral ?? []).forEach((c, ci) => {
      const key = c.collateralId ?? `unanchored-${fi}-${ci}`;
      let asset = byKey.get(key);
      if (!asset) {
        const split = splitCollateralType(c.collateralType);
        asset = {
          key,
          collateralId: c.collateralId,
          collateralName: c.collateralName,
          collateralType: c.collateralType,
          type: split.type,
          subType: split.subType,
          descriptor: firstSentence(c.collateralDescription),
          description: c.collateralDescription ?? null,
          value: num(c.collateralValue),
          advanceRate: num(c.advanceRate),
          lendableValue: num(c.currentLendableValue),
          pledges: [],
          badge: "",
        };
        byKey.set(key, asset);
        order.push(key);
      }
      // The asset's own figures are repeated on every pledge of it, so the first
      // row that carries one wins and nothing is ever summed across pledges.
      asset.value = asset.value ?? num(c.collateralValue);
      asset.advanceRate = asset.advanceRate ?? num(c.advanceRate);
      asset.lendableValue = asset.lendableValue ?? num(c.currentLendableValue);
      if (!asset.descriptor && c.collateralDescription) {
        asset.descriptor = firstSentence(c.collateralDescription);
        asset.description = c.collateralDescription;
      }

      if (!isActivePledge(c)) return;
      asset.pledges.push({
        loanId: f.loanId,
        facility: facilityProduct(f, relationship),
        fullName: f.name ?? f.loanId ?? "Facility",
        committed: num(f.committed),
        pledged: num(c.amountPledged),
        lienPosition: c.lienPosition,
        advanceRate: num(c.advanceRate),
        advanceRateSource: c.advanceRateSource,
        overridden: /override/i.test(c.advanceRateSource ?? ""),
      });
    });
  });

  return order.map((k) => {
    const a = byKey.get(k)!;
    a.badge = a.pledges.length ? `${a.pledges.length} ${a.pledges.length === 1 ? "pledge" : "pledges"}` : "Unpledged";
    return a;
  });
}

/** The line an asset with no active pledge shows when it opens. */
export const NO_PLEDGE_LINE =
  "Not pledged to any facility. The account owns this asset and no active pledge secures a loan with it.";
