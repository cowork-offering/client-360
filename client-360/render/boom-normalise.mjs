// NORMALISE the Boom payload into ONE shape, read by the Financials tab AND the covenant challenge.
//
// Two consumers used to disagree about what `bundle.boom` is. The Financials tab read a
// hand-shaped display object (ratios.{revenue, ebitda, ebitdaMargin, totalLeverage,
// interestCoverage}, spread.{sourceFile, periods[], lineItems[]}); validate-c360.mjs read the raw
// Boom payload (spread.file.financialStatements[]). Whichever shape the agent staged, the other
// consumer silently rendered nothing. This module is the single seam: the assemblers call it once,
// both consumers read its result, and the RAW payload survives underneath for provenance.
//
//   normaliseBoom(boom)      -> the normalised bundle-level `boom`, or null
//   normaliseC360Boom(data)  -> normalises every bundle in place, returns the data
//   indexSpreadFile(file)    -> { index: { accountCode: { endDate: number } }, endDates[], latest }
//   ratiosAsOf(ratios)       -> the ratios' asOf date as YYYY-MM-DD, or null
//
// THE SHAPE (also documented in SKILL.md "Boom payload" and app/src/data/contract.ts):
//
//   boom.ratios  { revenue, ebitda, ebitdaMargin (PERCENT), totalLeverage, interestCoverage,
//                  asOf?, raw? }        raw = boom_get_ratios `raw` verbatim, numbers as Boom emits
//                                       them (margins as FRACTIONS). The provenance copy.
//   boom.spread  { sourceFile?, periods[{period, revenue, ebitda, margin}],
//                  lineItems[{line, ltm, priorFy}], file? }   file = boom_get_spread `file` verbatim
//   boom.note    the caption the tab prints under the pane
//
// EBITDA IS NOT DERIVABLE FROM THE LINE-ITEM CHART. Boom's accountCode chart carries no
// depreciation and amortisation line (the cash-flow statement's D&A row has no accountCode at all;
// Boom's own ratio layer finds it BY NAME). So EBITDA exists for exactly ONE period, the one
// boom_get_ratios reports its `asOf` for, and every other period's EBITDA is null. Deriving a prior
// year from operating profit alone would print an understated EBITDA as though it were spread.
//
// IDEMPOTENT: the normalised output keeps `ratios.raw` and `spread.file`, and the derivation reads
// only those, so normalising twice yields the same object.
//
// No dependencies beyond node built-ins. Node 18+.

/** Revenue, in the order Boom's own consumer layer tries the codes. */
export const REVENUE_CODES = ["net_sales_revenue", "sales_revenue", "revenue", "total_revenue"];

/** The income-statement rows the tab prints, LTM against prior FY. `ratios` marks the row that
 *  can only come from boom_get_ratios (EBITDA), never from the chart. */
const CHART = [
  { line: "Revenue", codes: REVENUE_CODES },
  { line: "Gross Profit", codes: ["gross_profit"] },
  { line: "EBITDA", ratios: "ebitda" },
  { line: "Net Income", codes: ["net_income"] },
  { line: "Interest Expense", codes: ["interest_expense"], abs: true },
];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** A Boom date as YYYY-MM-DD. Boom emits plain dates; an instant is trimmed to its day. */
function dayOf(v) {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** The date boom_get_ratios computed its figures for, or null. */
export function ratiosAsOf(ratios) {
  const r = obj(ratios);
  return r ? dayOf(r.asOf) : null;
}

/**
 * Index a raw boom_get_spread `file` on the PERIOD END DATE.
 *
 * Boom keys `periodValues` by the period's UUID `id`, and the statement's own `periods[]` is the
 * only place that id is tied to an `endDate`. Reading the ids directly is what broke the covenant
 * challenge: a year regex over "30a85977-2082-4dfb-9f19-45a91de7d8f7" matched 2082, so "the latest
 * period" was whichever UUID happened to carry the highest four digits.
 *
 * Periods are per statement, so the mapping is rebuilt per statement. First writer wins for a
 * given (accountCode, endDate) pair, so a code that appears on two statements never has one
 * statement's figure quietly overwritten by the other's.
 */
export function indexSpreadFile(file) {
  const f = obj(file);
  const statements = f && Array.isArray(f.financialStatements) ? f.financialStatements : null;
  if (!statements) return null;

  const index = {};
  const endDates = new Set();
  for (const st of statements) {
    if (!obj(st)) continue;
    const byId = {};
    for (const p of Array.isArray(st.periods) ? st.periods : []) {
      const day = obj(p) ? dayOf(p.endDate) : null;
      if (p && p.id != null && day) byId[p.id] = day;
    }
    for (const li of Array.isArray(st.lineItems) ? st.lineItems : []) {
      if (!obj(li) || !li.accountCode || !obj(li.periodValues)) continue;
      const row = (index[li.accountCode] ??= {});
      for (const [id, value] of Object.entries(li.periodValues)) {
        const day = byId[id];
        if (!day || !isNum(value)) continue;
        endDates.add(day);
        if (!Object.hasOwn(row, day)) row[day] = value;
      }
    }
  }
  if (!endDates.size) return null;
  const sorted = [...endDates].sort().reverse(); // ISO dates sort lexicographically
  return { index, endDates: sorted, latest: sorted[0] };
}

/** The first of `codes` that carries a number in that period, else null. Null and not undefined,
 *  because a spread line of 0 is a figure and must survive the check. */
function pick(index, codes, endDate) {
  for (const code of codes) {
    const v = index[code] ? index[code][endDate] : undefined;
    if (isNum(v)) return v;
  }
  return null;
}

/** "FY2025" for an annual period; the bare end date for anything else, since a fiscal-year label
 *  over a quarter would assert a period the spread does not carry. */
function periodLabel(endDate, annual) {
  return annual ? `FY${endDate.slice(0, 4)}` : endDate;
}

/** Whether every statement calls this period annual. Absent periodType is treated as annual, which
 *  is what Boom's own annual spreads emit. */
function annualDates(file) {
  const out = new Map();
  for (const st of file.financialStatements ?? []) {
    for (const p of Array.isArray(st && st.periods) ? st.periods : []) {
      const day = obj(p) ? dayOf(p.endDate) : null;
      if (!day) continue;
      const annual = p.periodType == null || p.periodType === "annual";
      out.set(day, (out.get(day) ?? true) && annual);
    }
  }
  return out;
}

/** The display ratio set, derived from boom_get_ratios `raw` when it is there. Margins arrive as
 *  FRACTIONS from Boom and are rendered as percentages, so they are scaled here, once. */
function ratiosFrom(ratios) {
  const r = obj(ratios);
  if (!r) return null;
  const raw = obj(r.raw);
  const out = {};
  const take = (key, rawKey, scale = 1) => {
    const v = raw ? raw[rawKey] : undefined;
    if (isNum(v)) out[key] = scale === 1 ? v : v * scale;
    else if (isNum(r[key])) out[key] = r[key];
  };
  take("revenue", "revenue");
  take("ebitda", "ebitda");
  take("ebitdaMargin", "ebitdaMargin", 100);
  take("totalLeverage", "leverage");
  take("interestCoverage", "interestCoverage");
  const asOf = dayOf(r.asOf);
  if (asOf) out.asOf = asOf;
  if (raw) out.raw = raw;
  return Object.keys(out).length ? out : null;
}

/** The display spread, derived from the raw `file` when it is there. */
function spreadFrom(spread, ratios) {
  const s = obj(spread);
  const file = s ? obj(s.file) : null;
  if (!file) return s ? { ...s } : null;

  const flat = indexSpreadFile(file);
  const out = {};
  if (typeof file.fileName === "string" && file.fileName) out.sourceFile = file.fileName;
  else if (typeof s.sourceFile === "string" && s.sourceFile) out.sourceFile = s.sourceFile;

  const asOf = ratiosAsOf(ratios);
  const ebitda = obj(ratios) && obj(ratios.raw) && isNum(ratios.raw.ebitda) ? ratios.raw.ebitda : null;
  const annual = annualDates(file);

  if (flat) {
    const ascending = [...flat.endDates].reverse();
    const periods = [];
    for (const endDate of ascending) {
      const rev = pick(flat.index, REVENUE_CODES, endDate);
      const row = { period: periodLabel(endDate, annual.get(endDate) !== false) };
      if (rev !== null) row.revenue = rev;
      // EBITDA belongs to the ratios' own period and to no other. See the header note.
      if (ebitda != null && asOf === endDate) {
        row.ebitda = ebitda;
        if (rev) row.margin = Math.round((ebitda / rev) * 1000) / 10;
      }
      periods.push(row);
    }
    if (periods.length) out.periods = periods;

    const [latest, prior] = flat.endDates;
    const lineItems = [];
    for (const spec of CHART) {
      const row = { line: spec.line };
      if (spec.ratios) {
        // The chart has no D&A, so the prior year has no EBITDA. Null, never derived.
        if (ebitda != null && asOf === latest) row.ltm = ebitda;
      } else {
        const l = pick(flat.index, spec.codes, latest);
        const p = prior ? pick(flat.index, spec.codes, prior) : null;
        if (l !== null) row.ltm = spec.abs ? Math.abs(l) : l;
        if (p !== null) row.priorFy = spec.abs ? Math.abs(p) : p;
      }
      if (row.ltm != null || row.priorFy != null) lineItems.push(row);
    }
    if (lineItems.length) out.lineItems = lineItems;
  } else {
    if (Array.isArray(s.periods)) out.periods = s.periods;
    if (Array.isArray(s.lineItems)) out.lineItems = s.lineItems;
  }

  out.file = file;
  return out;
}

/**
 * Normalise one bundle's `boom`.
 *
 * Accepts the raw connector payloads (boom_get_ratios / boom_get_spread as returned), the already
 * normalised shape, or a hand-shaped display object with no raw payload underneath, and returns
 * the normalised shape in every case. `null` in, `null` out: a borrower with no spread on file
 * keeps its honest gap state rather than gaining an empty one.
 */
export function normaliseBoom(boom) {
  const b = obj(boom);
  if (!b) return null;
  const ratios = ratiosFrom(b.ratios);
  const spread = spreadFrom(b.spread, ratios);
  if (!ratios && !spread) return null;

  const out = {};
  if (ratios) out.ratios = ratios;
  if (spread) out.spread = spread;
  // No note of our own: the tab already captions the pane from spread.sourceFile when the staged
  // payload carries no note, and a second fallback here would only invent a second wording.
  if (typeof b.note === "string" && b.note) out.note = b.note;
  return out;
}

/** Normalise every staged bundle's `boom` IN PLACE (borrowers + the anchor alias) and return the
 *  data. Deduped by object reference, so the anchor is normalised once however it is aliased. */
export function normaliseC360Boom(data) {
  if (!data || typeof data !== "object") return data;
  const seen = new Set();
  if (obj(data.borrower)) seen.add(data.borrower);
  for (const b of Object.values(obj(data.borrowers) ?? {})) if (obj(b)) seen.add(b);
  for (const bundle of seen) {
    if (!Object.hasOwn(bundle, "boom")) continue;
    bundle.boom = normaliseBoom(bundle.boom);
  }
  return data;
}
