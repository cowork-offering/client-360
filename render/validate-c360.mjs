#!/usr/bin/env node
// VALIDATE the Customer 360 cockpit data — the deterministic "effective challenge" stage (SR 11-7).
//
// This module recomputes covenant figures from the Boom spread and runs a data-quality sweep. It is
// the ONLY source of the challenge/dataQuality numbers: LLMs never compute these figures. Everything
// here is pure arithmetic over data already fetched into C360_DATA. It augments the data object
// IN PLACE (and returns it) with two new surfaces:
//
//   • <bundle>.covenantChallenge[] — per covenant, the Boom-implied value beside the nCino actual,
//     with a corroborated / diverges / not-computable verdict. Divergence is a REVIEW FLAG, never a
//     breach determination — the bank's contractual covenant definitions are nCino-owned and may
//     differ from these standard ratio definitions.
//   • data.dataQuality[] — deterministic data-integrity findings across the staged book.
//
// Idempotent: re-running rebuilds both surfaces from scratch (no double-append).
//
//   node validate-c360.mjs --data <c360-data.json> [--out <out.json>]
//
// With --out it writes the augmented JSON; without, it prints a human summary and writes nothing.
// No dependencies beyond node built-ins. Node 18+.
import { readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------- formula registry
// covenantType → standard-definition recompute. Matched case-insensitively by substring, in order.
// `unit`: "ratio" rounds to 2dp, "dollars" rounds to whole dollars.
const FORMULAS = [
  {
    match: ["debt service coverage"],
    direction: "min",
    unit: "ratio",
    formula: "Adjusted EBITDA / (Interest Expense + CPLTD)",
    inputs: ["adjusted_ebitda", "interest_expense", "current_portion_ltd"],
    compute: (v) => v.adjusted_ebitda / (v.interest_expense + v.current_portion_ltd),
  },
  {
    match: ["debt to worth", "debt to equity", "leverage"],
    direction: "max",
    unit: "ratio",
    formula: "Total Debt / Total Equity",
    inputs: ["total_debt", "total_equity"],
    compute: (v) => v.total_debt / v.total_equity,
  },
  {
    match: ["liquidity"],
    direction: "min",
    unit: "dollars",
    formula: "Cash & Equivalents",
    inputs: ["cash_and_equivalents"],
    compute: (v) => v.cash_and_equivalents,
  },
  {
    match: ["fixed asset purchases"],
    direction: "max",
    unit: "dollars",
    formula: "Capital Expenditures (FY)",
    inputs: ["capital_expenditures"],
    compute: (v) => v.capital_expenditures,
  },
];

const CHECK_TYPES = [
  "rollup-gap", "missing-rating", "stale-covenant-eval", "covenant-overdue",
  "boom-period-mismatch", "coverage-null", "util-null",
];

const round2 = (n) => Math.round(n * 100) / 100;
const roundBy = (n, unit) => (unit === "ratio" ? round2(n) : Math.round(n));

// FY2025 > FY2024. Pick the latest period key across a spread's line items by trailing year.
function latestPeriod(periodKeys) {
  const yearOf = (k) => { const m = String(k).match(/(\d{4})/); return m ? Number(m[1]) : -Infinity; };
  return [...periodKeys].sort((a, b) => yearOf(b) - yearOf(a))[0];
}

// Flatten a boom.spread into { accountCode: { period: value } } across all financial statements.
function indexSpread(spread) {
  const file = spread && spread.file;
  const statements = file && Array.isArray(file.financialStatements) ? file.financialStatements : null;
  if (!statements) return null;
  const index = {};
  const periods = new Set();
  for (const st of statements) {
    for (const li of st.lineItems || []) {
      if (!li || !li.accountCode || !li.periodValues) continue;
      index[li.accountCode] = li.periodValues;
      for (const p of Object.keys(li.periodValues)) periods.add(p);
    }
  }
  if (!periods.size) return null;
  return { index, period: latestPeriod(periods) };
}

function matchFormula(covenantType) {
  const t = String(covenantType || "").toLowerCase();
  return FORMULAS.find((f) => f.match.some((m) => t.includes(m))) || null;
}

const nCinoCompliant = (cov) => {
  const s = String(cov.covenantStatus ?? cov.lastEvaluationStatus ?? "").toLowerCase();
  if (s) return s === "compliant";
  return cov.breached === false;
};

// ---------------------------------------------------------------- AUGMENTATION 1: covenant challenge
function buildChallenge(bundle) {
  const covenants = (bundle && bundle.covenants && Array.isArray(bundle.covenants.covenants))
    ? bundle.covenants.covenants : [];
  const spread = bundle && bundle.boom ? bundle.boom.spread : null;
  const flat = spread ? indexSpread(spread) : null;
  const period = flat ? flat.period : null;

  const noteFor = (p) =>
    `Boom-implied value uses standard ratio definitions over the latest spread period (${p}); ` +
    `the bank's contractual definitions are nCino-owned and may differ. ` +
    `Divergence is a review flag, not a breach determination.`;

  const out = [];
  for (const cov of covenants) {
    const spec = matchFormula(cov.covenantType);
    const entry = {
      covenantId: cov.covenantId ?? null,
      covenantType: cov.covenantType ?? null,
      nCinoActual: cov.actualValue ?? null,
      threshold: cov.thresholdValue ?? null,
      direction: spec ? spec.direction : null,
      boomImplied: null,
      delta: null,
      status: "not-computable",
      note: "",
    };

    if (!bundle.boom) {
      entry.note = "Boom spread not on file for this borrower — no source to recompute the covenant.";
      out.push(entry); continue;
    }
    if (!spec) {
      entry.note = `Covenant type "${cov.covenantType}" has no standard-definition mapping — not recomputed.`;
      out.push(entry); continue;
    }
    if (!flat) {
      entry.note = "Boom spread carries no line-item periods — cannot recompute.";
      out.push(entry); continue;
    }
    const inputs = {};
    let missing = null;
    for (const code of spec.inputs) {
      const pv = flat.index[code];
      const val = pv ? pv[period] : undefined;
      if (typeof val !== "number") { missing = code; break; }
      inputs[code] = val;
    }
    if (missing) {
      entry.note = `Spread has no numeric "${missing}" in period ${period} — cannot recompute.`;
      out.push(entry); continue;
    }
    const raw = spec.compute(inputs);
    if (!Number.isFinite(raw)) {
      entry.note = `Recompute produced a non-finite value (check denominators) for period ${period}.`;
      out.push(entry); continue;
    }

    const value = roundBy(raw, spec.unit);
    entry.boomImplied = { value, formula: spec.formula, inputs, period };
    entry.delta = roundBy(value - Number(entry.nCinoActual), spec.unit);
    entry.note = noteFor(period);

    // status: crossing (opposite compliance side vs nCino) ALWAYS wins → diverges + breachRiskFlag.
    const boomCompliant = spec.direction === "min"
      ? value >= Number(entry.threshold)
      : value <= Number(entry.threshold);
    const crossing = entry.threshold != null && (nCinoCompliant(cov) !== boomCompliant);
    const base = Math.abs(Number(entry.nCinoActual));
    const relDelta = base > 0 ? Math.abs(value - Number(entry.nCinoActual)) / base : Infinity;

    if (crossing) { entry.status = "diverges"; entry.breachRiskFlag = true; }
    else if (relDelta > 0.15) { entry.status = "diverges"; }
    else { entry.status = "corroborated"; }

    out.push(entry);
  }
  bundle.covenantChallenge = out;
  return out;
}

// ---------------------------------------------------------------- AUGMENTATION 2: data quality sweep
function daysBetween(aISO, bISO) {
  const a = Date.parse(aISO), b = Date.parse(bISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

function buildDataQuality(data) {
  const findings = [];
  const dateISO = data.meta && data.meta.dateISO;

  // Unique account bundles: the staged book keyed by accountId, plus the anchor alias if distinct.
  const bundles = new Map();
  if (data.borrowers && typeof data.borrowers === "object") {
    for (const [id, b] of Object.entries(data.borrowers)) if (b) bundles.set(id, b);
  }
  if (data.borrower && data.borrower.snapshot) {
    const id = data.borrower.snapshot.accountId;
    if (id && !bundles.has(id)) bundles.set(id, data.borrower);
  }

  for (const b of bundles.values()) {
    const snap = b.snapshot || {};
    const exp = b.exposure || {};
    const committed = Number(exp.totalCommitted) || 0;
    const acct = { accountId: snap.accountId, accountName: snap.name };

    // rollup-gap (warn): package rollup is 0 while facility-level commitments exist.
    if (snap.totalCreditExposure === 0 && committed > 0) {
      findings.push({
        severity: "warn", code: "rollup-gap", ...acct,
        message: `Package snapshot totalCreditExposure is $0 but facility-level totalCommitted is $${committed.toLocaleString()} — package rollup has not been computed.`,
      });
    }
    // missing-rating (warn): committed exposure with no primary risk rating.
    if (committed > 0 && (snap.primaryRiskRating == null || snap.primaryRiskRating === "")) {
      findings.push({
        severity: "warn", code: "missing-rating", ...acct,
        message: `Account carries $${committed.toLocaleString()} committed but has no primaryRiskRating on file.`,
      });
    }
    // stale-covenant-eval (warn): covenant last evaluated > 90 days before the report date.
    const covs = (b.covenants && Array.isArray(b.covenants.covenants)) ? b.covenants.covenants : [];
    for (const cov of covs) {
      if (!cov.lastEvaluationDate || !dateISO) continue;
      const age = daysBetween(dateISO, cov.lastEvaluationDate);
      if (age != null && age > 90) {
        findings.push({
          severity: "warn", code: "stale-covenant-eval", ...acct,
          message: `Covenant "${cov.covenantType}" last evaluated ${cov.lastEvaluationDate} — ${age} days before report date ${dateISO} (>90).`,
        });
      }
    }
    // coverage-null (info): secured facility with no coverage ratio computed
    // AND no reason given. A facility carrying `coverageNote` has already been
    // explained by the org — an undrawn facility has nothing to cover, and that
    // is a fact, not a finding to chase.
    for (const f of (exp.facilities || [])) {
      const collat = f && f.collateral;
      const hasCollateral = Array.isArray(collat) ? collat.length > 0 : Number(collat) > 0;
      if (hasCollateral && (f.coverageRatio == null) && !f.coverageNote) {
        findings.push({
          severity: "info", code: "coverage-null", ...acct,
          message: `Facility "${f.name || f.loanId}" has pledged collateral but coverageRatio is null.`,
        });
      }
    }
    // boom-period-mismatch (warn): ratios revenue vs spread latest sales_revenue > 1%.
    if (b.boom && b.boom.ratios && b.boom.spread) {
      const rawRev = b.boom.ratios.raw && b.boom.ratios.raw.revenue;
      const flat = indexSpread(b.boom.spread);
      const spreadRev = flat && flat.index.sales_revenue ? flat.index.sales_revenue[flat.period] : undefined;
      if (typeof rawRev === "number" && typeof spreadRev === "number" && spreadRev !== 0) {
        const pct = Math.abs(rawRev - spreadRev) / Math.abs(spreadRev);
        if (pct > 0.01) {
          const asOf = b.boom.ratios.asOf || "ratios period";
          findings.push({
            severity: "warn", code: "boom-period-mismatch", ...acct,
            message: `Boom ratios revenue $${rawRev.toLocaleString()} (asOf ${asOf}) differs from spread sales_revenue $${spreadRev.toLocaleString()} (${flat.period}) by ${(pct * 100).toFixed(1)}%.`,
          });
        }
      }
    }
  }

  // covenant-overdue (critical): ONE aggregated finding over the portfolio-wide EWS signal.
  const dueSoon = (data.portfolio && data.portfolio.signals && Array.isArray(data.portfolio.signals.covenantsDueSoon))
    ? data.portfolio.signals.covenantsDueSoon : [];
  const overdue = dueSoon.filter((c) => c && c.overdue === true);
  if (overdue.length > 0) {
    const top3 = [...overdue]
      .sort((a, b) => (a.daysUntilNextEvaluation ?? 0) - (b.daysUntilNextEvaluation ?? 0))
      .slice(0, 3)
      .map((c) => c.accountName)
      .filter(Boolean);
    findings.push({
      severity: "critical", code: "covenant-overdue",
      message: `${overdue.length} covenant evaluation(s) past due but still active in nCino. Most overdue: ${top3.join(", ")}.`,
    });
  }

  // util-null (info): book-wide utilization could not be computed.
  const util = data.portfolio && data.portfolio.bookTotals ? data.portfolio.bookTotals.utilizationPct : undefined;
  if (util === null) {
    findings.push({
      severity: "info", code: "util-null",
      message: "Portfolio bookTotals.utilizationPct is null (Σtce = 0) — utilization cannot be computed.",
    });
  }

  const rank = { critical: 0, warn: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return findings;
}

// ---------------------------------------------------------------- public entry
export function validateC360(data) {
  if (!data || typeof data !== "object") throw new Error("validateC360: data must be an object");

  // Augment every staged bundle + the anchor alias. Dedup by object reference so that when
  // data.borrower and data.borrowers[anchorId] are the SAME object we augment it once.
  const seen = new Set();
  if (data.borrower && typeof data.borrower === "object") seen.add(data.borrower);
  if (data.borrowers && typeof data.borrowers === "object") {
    for (const b of Object.values(data.borrowers)) if (b && typeof b === "object") seen.add(b);
  }
  for (const bundle of seen) buildChallenge(bundle);

  const dataQuality = buildDataQuality(data);
  data.dataQuality = dataQuality;

  data.meta = data.meta || {};
  data.meta.validation = {
    ranAt: data.meta.generatedAt ?? null,
    checks: CHECK_TYPES.length,
    findings: dataQuality.length,
  };
  return data;
}

// count challenges over unique accounts (staged book, else the anchor alias) — for summaries.
export function challengeCount(data) {
  if (data.borrowers && typeof data.borrowers === "object") {
    let n = 0;
    for (const b of Object.values(data.borrowers)) n += (b && b.covenantChallenge ? b.covenantChallenge.length : 0);
    return n;
  }
  return data.borrower && data.borrower.covenantChallenge ? data.borrower.covenantChallenge.length : 0;
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : undefined; };
  const die = (m) => { console.error(`ERROR: ${m}`); process.exit(1); };
  const dataPath = arg("--data");
  const outPath = arg("--out");
  if (!dataPath) die("missing --data <path/to/c360-data.json>  (usage: node validate-c360.mjs --data <data.json> [--out <out.json>])");

  let data;
  try { data = JSON.parse(readFileSync(dataPath, "utf8")); }
  catch (e) { die(`cannot read/parse --data ${dataPath}: ${e.message}`); }

  validateC360(data);

  if (outPath) {
    try { writeFileSync(outPath, JSON.stringify(data, null, 2)); }
    catch (e) { die(`cannot write --out ${outPath}: ${e.message}`); }
    console.log(`OK — wrote ${outPath} · challenge ${challengeCount(data)} covenants · DQ ${data.dataQuality.length} findings`);
  } else {
    const lines = [];
    lines.push(`Customer 360 validation — anchor ${data.meta && data.meta.anchorAccountId}`);
    lines.push(`  challenge: ${challengeCount(data)} covenant(s) recomputed`);
    const anchor = data.borrowers && data.meta ? data.borrowers[data.meta.anchorAccountId] : null;
    for (const c of (anchor && anchor.covenantChallenge) || []) {
      const bi = c.boomImplied ? c.boomImplied.value : "n/a";
      const flag = c.breachRiskFlag ? " ⚠ breach-risk" : "";
      lines.push(`    · ${c.covenantType}: nCino ${c.nCinoActual} vs boom ${bi} → ${c.status}${flag}`);
    }
    lines.push(`  dataQuality: ${data.dataQuality.length} finding(s)`);
    for (const f of data.dataQuality) {
      lines.push(`    [${f.severity}] ${f.code}${f.accountName ? " · " + f.accountName : ""}: ${f.message}`);
    }
    console.log(lines.join("\n"));
  }
}
