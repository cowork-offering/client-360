/* THE TWO-PACKAGE FIXTURE.
 *
 * WHY IT HAS TO BE BUILT. `artifact/live-data.json` ships five borrowers and every
 * one of them stages exactly ONE product package, so the branch this build exists
 * for — a relationship carrying more than one, where the room must ask before it
 * anchors — has never been rendered against real data. The org has 100 accounts
 * carrying several (knowledge/PACKAGE-ANCHOR-FINDINGS-20260902.md section 4), and
 * none of them is in the shipped book.
 *
 * DERIVED FROM A BAKED BORROWER, NEVER INVENTED WHOLE. Sterling Fabrication Co.
 * keeps its two booked facilities in its own package and gains a SECOND package
 * holding one facility that is still in credit approval. That is the shape the
 * ask has to read correctly: one package a credit action can run against and one
 * it cannot, which is why the ask is route-neutral and the route's own card is
 * not. Every other borrower in the file is untouched, so the Hartwell facility
 * regression runs against exactly the book it always ran against.
 *
 * THE SNAPSHOT ANCHOR IS CLEARED, because that is what the org does: `aggregate.ts`
 * writes `snapshot.productPackageId` only where the facilities name precisely one,
 * and a real two-package account comes back without it.
 *
 * ONE SOURCE FOR BOTH READERS. The vitest suite imports `withSecondPackage` and
 * the Playwright probe assembles an artifact from `twoPackageData()`, so the shot
 * on the glass and the assertion in the suite stand on the same bytes.
 *
 *   node scripts/two-package-fixture.mjs [outFile]     # write the data file
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The relationship the second package hangs off. */
export const ACCOUNT_ID = "001SAMPLE0000STRL";
/** Sterling's own package: two booked facilities, $18.0MM committed. */
export const PACKAGE_ONE = "a5FSAMPLE00000STRL";
/** The second: one facility, still in credit approval, $6.0MM committed. */
export const PACKAGE_TWO = "a5FSAMPLE0000STRL2";
export const FACILITY_TWO = "a1XSAMPLESTRL003";

/** The facility the second package holds. Same shape the exposure read returns. */
const SECOND_FACILITY = {
  loanId: FACILITY_TWO,
  name: "Sterling Fort Mill Expansion Construction Loan",
  productType: "Real Estate",
  riskGrade: "5",
  committed: 6000000,
  outstanding: 0,
  available: 6000000,
  maturityDate: "2029-04-30T00:00:00",
  interestRate: 7.65,
  totalLendableValue: 6600000,
  coverageRatio: 1.1,
  coverageShortfall: false,
  collateral: [
    {
      loanId: FACILITY_TWO,
      collateralType: "Real Estate-Industrial",
      collateralValue: 8800000,
      advanceRate: 75,
      currentLendableValue: 6600000,
      lienPosition: "1st",
      pledgedStatus: "Active",
      isPrimary: true,
      amountPledged: 6600000,
      advanceRateSource: "Collateral type default",
    },
  ],
  status: "Open",
  stage: "Credit Approval",
  productPackageId: PACKAGE_TWO,
  totalPledgedValue: 6600000,
  coverageNote: null,
};

/**
 * The cockpit data with a second package on Sterling. Pure: the argument is not
 * mutated, and every borrower but Sterling comes back by reference.
 */
export function withSecondPackage(data) {
  const borrower = data.borrowers?.[ACCOUNT_ID];
  if (!borrower) throw new Error(`${ACCOUNT_ID} is not in this book`);

  const facilities = [...(borrower.exposure?.facilities ?? []), SECOND_FACILITY];
  const sum = (key) => facilities.reduce((n, f) => n + (typeof f[key] === "number" ? f[key] : 0), 0);

  const snapshot = { ...borrower.snapshot, packageCount: 2 };
  delete snapshot.productPackageId;

  return {
    ...data,
    borrowers: {
      ...data.borrowers,
      [ACCOUNT_ID]: {
        ...borrower,
        snapshot,
        exposure: {
          ...borrower.exposure,
          facilities,
          totalCommitted: sum("committed"),
          totalOutstanding: sum("outstanding"),
          totalAvailable: sum("available"),
        },
      },
    },
  };
}

/** The shipped book with the second package on it, read off disk. */
export function twoPackageData() {
  return withSecondPackage(JSON.parse(readFileSync(join(ROOT, "artifact", "live-data.json"), "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? "/tmp/c360-two-package.json";
  const data = twoPackageData();
  writeFileSync(out, JSON.stringify(data, null, 2));
  const facilities = data.borrowers[ACCOUNT_ID].exposure.facilities;
  const ids = [...new Set(facilities.map((f) => f.productPackageId))];
  console.log(`OK — ${out}: ${ACCOUNT_ID} now stages ${ids.length} packages over ${facilities.length} facilities`);
}
