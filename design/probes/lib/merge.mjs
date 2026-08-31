/* Merge N repeat runs into one stable report: numbers become medians, everything
   else must agree across runs or it is flagged __unstable. */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function median(nums) {
  const v = nums.slice().sort((a, b) => a - b);
  const m = v.length >> 1;
  const out = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return Math.round(out * 1000) / 1000;
}

function sameJson(vals) {
  const first = JSON.stringify(vals[0]);
  return vals.every((v) => JSON.stringify(v) === first);
}

export function mergeRuns(runs) {
  if (runs.length === 1) return runs[0];
  return mergeValues(runs);
}

function mergeValues(vals) {
  const defined = vals.filter((v) => v !== undefined);
  if (!defined.length) return null;

  if (defined.every((v) => typeof v === "number" && !Number.isNaN(v))) return median(defined);
  if (defined.every((v) => v === null)) return null;

  if (defined.every(isPlainObject)) {
    const keys = Array.from(new Set(defined.flatMap((o) => Object.keys(o))));
    const out = {};
    for (const k of keys) out[k] = mergeValues(defined.map((o) => o[k]));
    return out;
  }

  if (defined.every(Array.isArray)) {
    const len = defined[0].length;
    if (defined.every((a) => a.length === len)) {
      if (defined.every((a) => a.every((x) => typeof x === "number"))) {
        return Array.from({ length: len }, (_, i) => median(defined.map((a) => a[i])));
      }
      if (sameJson(defined)) return defined[0];
      return { __unstable: true, runs: defined };
    }
    return { __unstable: true, reason: "array length varies", runs: defined };
  }

  if (sameJson(defined)) return defined[0];
  return { __unstable: true, runs: defined };
}

/** Walk a report and collect every leaf as `dotted.path -> value`. */
export function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) && !("__unstable" in v)) flatten(v, p, out);
    else out[p] = v;
  }
  return out;
}
