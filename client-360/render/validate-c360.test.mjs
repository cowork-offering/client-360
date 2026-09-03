#!/usr/bin/env node
// Unit tests for the SR 11-7 covenant challenge over a REAL Boom spread.
// Run with: node --test render/validate-c360.test.mjs
//
// The fixture is the shipped artifact/live-data.json, so these tests fail the day the staged
// Piedmont payload stops being the live boom_get_ratios / boom_get_spread pair the challenge
// recomputes from. Piedmont FY2025 (period end 2025-12-31) is the case the four covenants exercise:
// two recompute, two honestly cannot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateC360 } from "./validate-c360.mjs";
import { indexSpreadFile, normaliseBoom } from "./boom-normalise.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PIEDMONT = "001bb00001DLtRMAA1";

const live = () => JSON.parse(readFileSync(join(here, "..", "..", "artifact", "live-data.json"), "utf8"));

/** The Piedmont bundle alone, challenged. `mutate` is handed the bundle's `boom`. */
function piedmontChallenge(mutate) {
  const data = live();
  const bundle = data.borrowers[PIEDMONT];
  if (mutate) mutate(bundle.boom);
  validateC360({ meta: data.meta, portfolio: data.portfolio, borrowers: { [PIEDMONT]: bundle } });
  return Object.fromEntries(bundle.covenantChallenge.map((c) => [c.covenantType, c]));
}

const boom = () => live().borrowers[PIEDMONT].boom;

// ---------------------------------------------------------------- the fixture is a real spread
test("the staged Piedmont payload carries the raw Boom spread the challenge recomputes from", () => {
  const b = boom();
  assert.ok(b.spread.file, "boom.spread.file must carry the raw boom_get_spread payload");
  assert.equal(b.ratios.asOf, "2025-12-31");
  assert.ok(b.ratios.raw, "boom.ratios.raw must carry the boom_get_ratios numeric contract");
  assert.equal(b.spread.file.downloadUrl, undefined, "the presigned downloadUrl is never staged");
});

test("the spread indexes on period END DATE, not on the period's UUID", () => {
  const flat = indexSpreadFile(boom().spread.file);
  assert.deepEqual(flat.endDates, ["2025-12-31", "2024-12-31", "2023-12-31"]);
  assert.equal(flat.latest, "2025-12-31");
  // The bug this replaces: a year regex over a period id such as
  // "30a85977-2082-4dfb-9f19-45a91de7d8f7" read 2082 and won every comparison.
  for (const d of flat.endDates) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(flat.index.cash_and_equivalents["2025-12-31"], 4928000);
  assert.equal(flat.index.net_sales_revenue["2025-12-31"], 64486000);
});

// ---------------------------------------------------------------- the four Piedmont covenants
test("Debt to Worth recomputes to 1.07x against nCino's 2.18x and diverges", () => {
  const c = piedmontChallenge()["Maximum Debt to Worth"];
  assert.equal(c.status, "diverges");
  assert.equal(c.boomImplied.value, 1.07);
  assert.equal(c.nCinoActual, 2.18);
  assert.equal(c.delta, -1.11);
  assert.equal(c.boomImplied.period, "2025-12-31");
  assert.equal(c.boomImplied.inputs.total_debt, 20130000);
  assert.equal(c.boomImplied.inputs.total_equity, 18870000);
  assert.equal(c.boomImplied.sources.total_equity, "total_equity");
  // 1.07x sits well inside the 3.0x ceiling, so both sides read compliant: a divergence, not a
  // breach risk.
  assert.equal(c.breachRiskFlag, undefined);
});

test("total debt falls back to summing the debt lines when the ratios are not on file", () => {
  const c = piedmontChallenge((b) => { delete b.ratios; })["Maximum Debt to Worth"];
  assert.equal(c.boomImplied.value, 1.07);
  // st_loans_payable_bank 5,674,000 + long_term_debt_bank 14,456,000. current_portion_ltd is in the
  // derive list and Boom does not emit it, so it simply does not contribute.
  assert.equal(c.boomImplied.sources.total_debt, "derived: st_loans_payable_bank + long_term_debt_bank");
  assert.equal(c.boomImplied.inputs.total_debt, 20130000);
});

test("Liquidity recomputes to $4.93M against nCino's $8.2M and raises a breach risk", () => {
  const c = piedmontChallenge()["Minimum Liquidity"];
  assert.equal(c.status, "diverges");
  assert.equal(c.boomImplied.value, 4928000);
  assert.equal(c.nCinoActual, 8200000);
  assert.equal(c.threshold, 5000000);
  // Boom's cash sits BELOW the $5.0M floor while nCino reads compliant: opposite sides of the
  // covenant, which is the one condition that flags a breach risk.
  assert.equal(c.breachRiskFlag, true);
  assert.equal(c.boomImplied.sources.cash_and_equivalents, "cash_and_equivalents");
});

test("DSC stays not-computable and names every code it looked for", () => {
  const c = piedmontChallenge()["Debt Service Coverage of Borrower"];
  assert.equal(c.status, "not-computable");
  assert.equal(c.boomImplied, null);
  // Boom carries no CPLTD line. st_loans_payable_bank is "Line of Credit AND Current Portion of
  // Long-Term Debt", so reading it as CPLTD would load the whole revolver into debt service.
  assert.match(c.note, /current_portion_ltd/);
  assert.match(c.note, /Tried current_portion_ltd, cpltd_bank, current_maturities_ltd/);
  assert.doesNotMatch(c.note, /st_loans_payable_bank/);
});

test("Fixed Asset Purchases stays not-computable: the chart has no capex accountCode", () => {
  const c = piedmontChallenge()["Fixed Asset Purchases"];
  assert.equal(c.status, "not-computable");
  assert.equal(c.boomImplied, null);
  assert.match(c.note, /Tried capital_expenditures, purchases_of_ppe/);
});

test("all four covenants are challenged, none silently dropped", () => {
  const byType = piedmontChallenge();
  assert.equal(Object.keys(byType).length, 4);
  const computed = Object.values(byType).filter((c) => c.boomImplied);
  assert.equal(computed.length, 2);
});

// ---------------------------------------------------------------- input resolution rules
test("EBITDA reaches the table only through the ratios, and only for their own asOf period", () => {
  // The chart carries no D&A, so `ratios:ebitda` is the only source. Move the ratios to another
  // year and the DSC input that depended on them is gone with them.
  const shifted = piedmontChallenge((b) => { b.ratios.asOf = "2024-12-31"; });
  assert.match(shifted["Debt Service Coverage of Borrower"].note, /adjusted_ebitda/);
  assert.match(shifted["Debt Service Coverage of Borrower"].note, /Tried adjusted_ebitda, ratios:ebitda/);
});

test("expense lines arrive negative and are taken absolute", () => {
  // Boom signs interest expense -1,076,000. Give the DSC the CPLTD it lacks and the recompute has
  // to add the expense, not subtract it: 5,234,000 / (1,076,000 + 1,000,000) = 2.52x.
  const c = piedmontChallenge((b) => {
    b.spread.file.financialStatements
      .find((s) => s.statementType === "balance_sheet")
      .lineItems.push({
        accountCode: "current_portion_ltd",
        name: "Current Portion of Long-Term Debt",
        periodValues: { "6ff80c35-a66c-4db4-9b5e-d4841fc64b00": 1000000 },
      });
  })["Debt Service Coverage of Borrower"];
  assert.equal(c.boomImplied.inputs.interest_expense, 1076000);
  assert.equal(c.boomImplied.value, 2.52);
  assert.equal(c.boomImplied.sources.adjusted_ebitda, "ratios:ebitda");
});

test("a borrower with a hand-shaped Boom block and no raw spread is not-computable, not wrong", () => {
  const data = live();
  const hartwell = data.borrowers["001bb00001I7FPNAA3"];
  assert.equal(hartwell.boom.spread.file, undefined);
  validateC360({ meta: data.meta, portfolio: data.portfolio, borrowers: { H: hartwell } });
  for (const c of hartwell.covenantChallenge) {
    assert.equal(c.status, "not-computable");
    assert.match(c.note, /no raw line items under spread.file|no standard-definition mapping/);
  }
});

// ---------------------------------------------------------------- data quality sweep
test("the revenue cross-check reads net_sales_revenue and stays silent when the periods agree", () => {
  const data = live();
  validateC360(data);
  const mismatch = data.dataQuality.filter((f) => f.code === "boom-period-mismatch");
  assert.deepEqual(mismatch, [], "ratios revenue 64,486,000 IS the spread's net_sales_revenue");
});

test("the revenue cross-check fires, naming the code it compared, when the periods disagree", () => {
  const data = live();
  data.borrowers[PIEDMONT].boom.ratios.raw.revenue = 59915000; // the prior year's figure
  validateC360(data);
  const f = data.dataQuality.find((x) => x.code === "boom-period-mismatch");
  assert.ok(f, "a ratios/spread revenue gap must raise a finding");
  assert.match(f.message, /net_sales_revenue/);
  assert.match(f.message, /asOf 2025-12-31/);
});

// ---------------------------------------------------------------- normalisation is idempotent
test("normalising the staged payload again changes nothing", () => {
  const once = boom();
  assert.deepEqual(normaliseBoom(once), once);
});

test("the challenge is idempotent across re-runs", () => {
  const data = live();
  validateC360(data);
  const first = JSON.stringify(data.borrowers[PIEDMONT].covenantChallenge);
  validateC360(data);
  assert.equal(JSON.stringify(data.borrowers[PIEDMONT].covenantChallenge), first);
});
