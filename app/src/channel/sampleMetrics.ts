/* =============================================================================
   THE LATENCY GATE, INSTRUMENTED.

   The founder's decision on the sample channel was "switch, but PROVE LATENCY
   FIRST", and the spec names the five numbers that decide it: rung 2 quick
   first-token and full-answer time, rung 2 default the same, rung 3 end to end,
   the consent prompt's cost on the first call of a view, and the OVER-CALL RATE
   (how often the model reached for a tool when the envelope already held the
   fact). Aspiration does not decide this. The numbers do.

   So every call through the session door is timed here, in the page, per view.
   Nothing is sent anywhere: `sampleSummary()` is read off the console (or a
   debug panel) after a drive. It is a measuring tape, not telemetry.
   ============================================================================= */

/** What the call was FOR. The gate reads differently per kind: a narration that
 *  takes eight seconds is a worse failure than a judgment answer that does. */
export type CallKind = "greeting" | "narrate" | "reply";

export type CallTier = "quick" | "default" | "complex";

export interface CallRecord {
  kind: CallKind;
  tier: CallTier;
  /** The ladder rung the router picked, so an over-call can be judged. */
  rung: 2 | 3;
  /** Milliseconds from the call leaving the page to the first streamed text.
   *  On the FIRST call of a view this includes the consent dialog, which is the
   *  cost the spec asks us to measure separately. */
  firstTokenMs: number | null;
  /** Milliseconds from the call leaving the page to the promise settling. */
  totalMs: number | null;
  /** True on the first call of a view: its first-token time carries the consent
   *  dialog and must never be pooled with the rest. */
  consented: boolean;
  /** Page functions the model actually called during this round trip. */
  toolCalls: string[];
  /** Of those, the ones the envelope already answered. This is the number that
   *  decides whether the tool discipline in the prompt actually holds. */
  overCalls: string[];
  /** The failure code, where the call did not resolve. */
  failed?: string;
}

let records: CallRecord[] = [];
let viewHasConsented = false;

/** The live handle a caller stamps as the call progresses. */
export interface CallProbe {
  /** The first `onText` of this call. Called more than once, only the first
   *  stamp counts: first-token time is a first-token time. */
  firstToken(): void;
  /** A page function the model called, and whether the envelope already held
   *  the answer to it. */
  tool(name: string, overCall: boolean): void;
  done(): void;
  failed(code: string): void;
}

/**
 * START TIMING A CALL. The record lands in the log immediately, so a call that
 * never comes back is still visible as a call that never came back.
 */
export function markCall(args: { kind: CallKind; tier: CallTier; rung: 2 | 3 }): CallProbe {
  const started = Date.now();
  const record: CallRecord = {
    kind: args.kind,
    tier: args.tier,
    rung: args.rung,
    firstTokenMs: null,
    totalMs: null,
    consented: !viewHasConsented,
    toolCalls: [],
    overCalls: [],
  };
  records.push(record);
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    record.totalMs = Date.now() - started;
    // The consent dialog is a once-per-view cost. Once a call has come back,
    // every later call in this view is measured without it.
    viewHasConsented = true;
  };
  return {
    firstToken: () => {
      if (record.firstTokenMs === null) record.firstTokenMs = Date.now() - started;
    },
    tool: (name, overCall) => {
      record.toolCalls.push(name);
      if (overCall) record.overCalls.push(name);
    },
    done: settle,
    failed: (code) => {
      record.failed = code;
      settle();
    },
  };
}

/** Every call this view has made, oldest first. */
export function sampleTimings(): readonly CallRecord[] {
  return records;
}

/** Wipe the log. For the suite, and for a founder starting a clean drive. */
export function resetSampleMetrics(): void {
  records = [];
  viewHasConsented = false;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const worst = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null);

export interface LatencyBand {
  calls: number;
  firstTokenMedianMs: number | null;
  firstTokenWorstMs: number | null;
  fullAnswerMedianMs: number | null;
  fullAnswerWorstMs: number | null;
}

export interface SampleSummary {
  /** One band per `kind:tier` pair that actually ran. The gate is read here. */
  bands: Record<string, LatencyBand>;
  /** The first call of the view, whose first-token time carries the consent
   *  dialog. Reported alone, never pooled. */
  consentCall: { kind: CallKind; firstTokenMs: number | null; totalMs: number | null } | null;
  /** Rung 3 end to end, which is the number the "let me check that" story
   *  stands or falls on. */
  rung3: LatencyBand;
  toolCalls: number;
  /** Tool calls the envelope already answered, over tool calls made. The spec's
   *  deciding number. Null where no tool was called at all. */
  overCallRate: number | null;
  failures: Record<string, number>;
}

const bandOf = (rows: CallRecord[]): LatencyBand => {
  const first = rows.map((r) => r.firstTokenMs).filter((n): n is number => n !== null);
  const full = rows.map((r) => r.totalMs).filter((n): n is number => n !== null);
  return {
    calls: rows.length,
    firstTokenMedianMs: median(first),
    firstTokenWorstMs: worst(first),
    fullAnswerMedianMs: median(full),
    fullAnswerWorstMs: worst(full),
  };
};

/**
 * THE GATE, READ OFF.
 *
 * The consent call is held out of every band: pooling a 9 second dialog wait
 * into a quick-tier median would make the quick tier look broken and hide the
 * one number that is genuinely a once-per-view cost.
 */
export function sampleSummary(): SampleSummary {
  const consent = records.find((r) => r.consented) ?? null;
  const measured = records.filter((r) => !r.consented);

  const bands: Record<string, LatencyBand> = {};
  for (const key of new Set(measured.map((r) => `${r.kind}:${r.tier}`))) {
    bands[key] = bandOf(measured.filter((x) => `${x.kind}:${x.tier}` === key));
  }

  const toolCalls = records.reduce((n, r) => n + r.toolCalls.length, 0);
  const overCalls = records.reduce((n, r) => n + r.overCalls.length, 0);
  const failures: Record<string, number> = {};
  for (const r of records) if (r.failed) failures[r.failed] = (failures[r.failed] ?? 0) + 1;

  return {
    bands,
    consentCall: consent ? { kind: consent.kind, firstTokenMs: consent.firstTokenMs, totalMs: consent.totalMs } : null,
    rung3: bandOf(records.filter((r) => r.rung === 3)),
    toolCalls,
    overCallRate: toolCalls ? overCalls / toolCalls : null,
    failures,
  };
}

/**
 * THE READOUT, WHERE A FOUNDER CAN REACH IT.
 *
 * `window.c360SampleGate()` in the panel's console prints the summary. No
 * network, no storage, no build flag: a measuring tape you can pick up mid-drive
 * and put down again.
 */
export function installSampleGateReadout(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w.c360SampleGate = () => sampleSummary();
  w.c360SampleCalls = () => sampleTimings();
}
