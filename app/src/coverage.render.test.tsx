// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BorrowerBundle, C360Data, Facility } from "./data/contract";
import { AppProvider } from "./state/appState";
import { ExposureTab } from "./components/tabs/ExposureTab";
import { collateralRecords } from "./data/collateralRecords";
import { isActiveFacility } from "./data/worklist";
import envelopes from "./data/observed-exposure-envelopes.json";
import live from "../../artifact/live-data.json";
import sample from "../../artifact/sample-data.json";

/* =============================================================================
   COVERAGE CORRECTNESS, ON THE OBSERVED ENVELOPES.

   The mocks in this file are not written, they are COPIED: every figure comes
   from `data/observed-exposure-envelopes.json`, a verbatim capture of what the
   bankinggpt org returned for Hartwell (001bb00001I7FPNAA3) and Piedmont
   (001bb00001DLtRMAA1). If someone re-derives a "plausible" coverage number,
   these tests are what catches it.

   Three things are being defended:

   1. The BAKED bundle equals the envelope, field for field. A demo that shows
      figures the org never returned is the failure mode this whole release
      exists to close.
   2. Nothing sums pledge lendable values. Hartwell's pledges add to 59.2MM of
      lendable value across 7 rows for 4 distinct records worth 31.6MM. The
      first number must appear nowhere.
   3. A null ratio renders the org's REASON, not a blank. Piedmont has two
      drawn facilities with no usable security; the cockpit says so in the
      org's own words.
   ============================================================================= */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HARTWELL = "001bb00001I7FPNAA3";
const PIEDMONT = "001bb00001DLtRMAA1";

const OBSERVED: Record<string, Record<string, unknown>> = {
  [HARTWELL]: envelopes.exposure_read_hartwell_v2[0].outputValues as unknown as Record<string, unknown>,
  [PIEDMONT]: envelopes.exposure_read_piedmont_v2[0].outputValues as unknown as Record<string, unknown>,
};

const LIVE = live as unknown as C360Data;
const SAMPLE = sample as unknown as C360Data;

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", LIVE],
  ["sample-data.json", SAMPLE],
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderExposure(bundle: BorrowerBundle, data: C360Data = LIVE): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider data={data}>
        <ExposureTab bundle={bundle} />
      </AppProvider>,
    );
  });
  return container.textContent ?? "";
}

/** Money as the tab renders it, so an assertion reads like the screen. */
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.00$/, "")}M` : `$${Math.round(n).toLocaleString("en-US")}`);

/* ============================================================ the envelopes */

describe("the baked bundle IS the observed envelope", () => {
  for (const [accountId, observed] of Object.entries(OBSERVED)) {
    it(`${accountId}: borrowers entry matches the org read field for field`, () => {
      expect(LIVE.borrowers?.[accountId]?.exposure).toEqual(observed);
    });
  }

  it("the legacy `borrower` anchor is the same Piedmont relationship, not an older invention", () => {
    expect(LIVE.borrower.exposure).toEqual(OBSERVED[PIEDMONT]);
  });

  it("carries the new members on every observed facility", () => {
    for (const observed of Object.values(OBSERVED)) {
      for (const f of observed.facilities as Facility[]) {
        expect(Object.hasOwn(f, "totalPledgedValue")).toBe(true);
        expect(Object.hasOwn(f, "coverageNote")).toBe(true);
        // The alias is the same figure under an unambiguous name.
        expect(f.totalPledgedValue).toBe(f.totalLendableValue);
      }
    }
  });

  it("carries relationship coverage the facility rows cannot reproduce", () => {
    const piedmont = OBSERVED[PIEDMONT];
    const shares = (piedmont.facilities as Facility[]).reduce((n, f) => n + (f.totalPledgedValue ?? 0), 0);
    // 9.25MM of pledged share against a 14.0MM distinct lendable base. Deriving
    // the relationship ratio from the facility rows would understate the org by
    // a third, which is exactly why nothing derives it.
    expect(shares).toBe(9_250_000);
    expect(piedmont.totalUniqueCollateralLendableValue).toBe(14_000_000);
    expect(piedmont.coverageRatio).toBe(1.65);
  });
});

/* ====================================================== relationship coverage */

describe("Hartwell renders the org's relationship coverage, not a sum", () => {
  const bundle = LIVE.borrowers![HARTWELL];

  it("shows 1.09x over the distinct collateral", () => {
    // The org grew a second package (2026-09-03): seven distinct collateral
    // records now (the four original plus the plant, the CNC-cell equipment
    // behind the Proposal loan, and the metrology fleet), $42.37M lendable.
    const text = renderExposure(bundle);
    expect(text).toContain("1.09×");
    expect(text).toContain(money(42_370_000));
    expect(text).toContain("across 7 collateral records");
  });

  it("never renders the double-counted 69.97MM", () => {
    const pledges = (bundle.exposure?.facilities ?? []).flatMap((f) => f.collateral ?? []);
    const doubleCounted = pledges.reduce((n, p) => n + (p.currentLendableValue ?? 0), 0);
    expect(doubleCounted).toBe(69_970_000);

    const text = renderExposure(bundle);
    expect(text).not.toContain(money(doubleCounted));
    // And the ratio that sum would have produced.
    expect(text).not.toContain("1.81×");
  });

  it("says the relationship clears its floor while three facilities do not", () => {
    // The org grew a second package (2026-09-03): nine facilities now, and a
    // third one (the new CRE Purchase loan, 0.99x) reads under-covered
    // alongside the original two.
    const text = renderExposure(bundle);
    expect(text).toContain("Covered");
    expect(text).toContain("3 of 9 facilities are under-covered at facility level.");
  });
});

describe("Piedmont renders 1.65x, and its drawn facilities as shortfalls", () => {
  const bundle = LIVE.borrowers![PIEDMONT];

  it("shows the relationship ratio over 2 distinct records", () => {
    const text = renderExposure(bundle);
    expect(text).toContain("1.65×");
    expect(text).toContain("across 2 collateral records");
    expect(text).toContain("2 of 3 facilities are under-covered at facility level.");
  });
});

/* ================================================== facility-level shortfalls */

describe("the true positives a credit officer must see at a glance", () => {
  const bundle = LIVE.borrowers![HARTWELL];

  it("renders Construction at 0.75x and Equipment at 0.53x", () => {
    const text = renderExposure(bundle);
    expect(text).toContain("0.75×");
    expect(text).toContain("0.53×");
  });

  it("flags exactly the three facilities the org flagged", () => {
    // The org grew a second package (2026-09-03): the new CRE Purchase loan
    // (0.99x) reads under-covered too, alongside the original Construction
    // (0.75x) and Equipment (0.53x) facilities.
    const flagged = (bundle.exposure?.facilities ?? []).filter((f) => f.coverageShortfall);
    expect(flagged.map((f) => f.coverageRatio)).toEqual([0.75, 0.99, 0.53]);
    const text = renderExposure(bundle);
    expect((text.match(/Shortfall/g) ?? []).length).toBe(3);
  });

  it("shows every facility's pledged share, and the drawn balances that are now real", () => {
    const text = renderExposure(bundle);
    for (const f of bundle.exposure?.facilities ?? []) {
      expect(text, `pledged share missing for ${f.name}`).toContain(money(f.totalPledgedValue as number));
      expect(text, `outstanding missing for ${f.name}`).toContain(money(f.outstanding as number));
    }
  });
});

describe("a null ratio renders the org's reason, never a blank", () => {
  const bundle = LIVE.borrowers![PIEDMONT];

  it("repeats each coverageNote verbatim", () => {
    const text = renderExposure(bundle);
    const notes = (bundle.exposure?.facilities ?? []).map((f) => f.coverageNote).filter(Boolean) as string[];
    expect(notes).toHaveLength(3);
    for (const note of notes) expect(text, `note dropped: ${note}`).toContain(note);
  });

  it("names the Excluded and Abundance-of-Caution pledges as the reason", () => {
    const text = renderExposure(bundle);
    expect(text).toContain("all 3 collateral pledges on this facility are flagged Excluded or Abundance-of-Caution");
  });

  it("a drawn facility with no usable security is a SHORTFALL, not an unknown", () => {
    const locs = (bundle.exposure?.facilities ?? []).filter((f) => f.coverageRatio === null && (f.outstanding ?? 0) > 0);
    expect(locs).toHaveLength(2);
    for (const f of locs) {
      expect(f.coverageShortfall, `${f.name} drawn with no coverage but not flagged`).toBe(true);
      expect(f.totalPledgedValue).toBe(0);
    }
  });
});

describe("pledge rows carry the facility share and where the advance rate came from", () => {
  it("Hartwell's cross-pledged receivables show 8.0MM to one facility and 1.6MM to the other", () => {
    const bundle = LIVE.borrowers![HARTWELL];
    const shares = (bundle.exposure?.facilities ?? [])
      .flatMap((f) => f.collateral ?? [])
      .filter((c) => c.collateralName === "COL-000762")
      .map((c) => c.amountPledged);
    expect(shares).toEqual([8_000_000, 1_600_000]);
    // The two shares partition the collateral's whole lendable value exactly.
    expect(shares.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(9_600_000);

    const text = renderExposure(bundle);
    expect(text).toContain(money(8_000_000));
    expect(text).toContain("Collateral type default");
    expect(text).toContain("Pledge override");
  });
});

/* ============================================ per-borrower matrix, both files */

describe("every borrower in every staged file renders coverage honestly", () => {
  for (const [file, data] of FILES) {
    for (const [accountId, raw] of Object.entries(data.borrowers ?? {})) {
      const bundle = raw as BorrowerBundle;
      const name = bundle.snapshot?.name ?? accountId;
      const exp = bundle.exposure ?? {};
      const facs = (exp.facilities ?? []).filter(isActiveFacility);

      it(`${name} (${file}): renders the org's ratio, or says it is not computed`, () => {
        const text = renderExposure(bundle, data);
        if (exp.coverageRatio != null) {
          expect(text).toContain(`${exp.coverageRatio.toFixed(2)}×`);
          expect(text).toContain(money(exp.totalUniqueCollateralLendableValue as number));
        } else {
          // An older bundle carries no relationship ratio. Nothing is derived in
          // its place: a summed one would be the double count, presented as the
          // org's own figure.
          expect(text).toContain("Not computed");
          expect(text).toContain("The source read does not carry a relationship coverage ratio.");
        }
      });

      it(`${name} (${file}): every facility shows its own ratio or its own reason`, () => {
        const text = renderExposure(bundle, data);
        for (const f of facs) {
          if (f.coverageRatio != null) expect(text, `${name}: ${f.name} ratio missing`).toContain(`${f.coverageRatio.toFixed(2)}×`);
          if (f.coverageNote) expect(text, `${name}: ${f.name} reason dropped`).toContain(f.coverageNote);
        }
      });

      it(`${name} (${file}): a drawn facility with no pledged share is flagged`, () => {
        for (const f of facs) {
          const share = f.totalPledgedValue ?? f.totalLendableValue;
          const drawn = f.outstanding ?? 0;
          if (drawn > 0 && !share) {
            expect(f.coverageShortfall, `${name}: ${f.name} is drawn with nothing behind it`).toBe(true);
          }
        }
      });

      it(`${name} (${file}): never renders a summed pledge lendable`, () => {
        const pledges = facs.flatMap((f) => f.collateral ?? []);
        const records = collateralRecords(bundle);
        // Only meaningful where a record is pledged more than once — otherwise
        // the sum and the distinct total are the same number.
        if (pledges.length <= records.length) return;
        const summed = pledges.reduce((n, p) => n + (p.currentLendableValue ?? 0), 0);
        expect(renderExposure(bundle, data)).not.toContain(money(summed));
      });
    }
  }
});
