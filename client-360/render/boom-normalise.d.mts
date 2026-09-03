/* Types for boom-normalise.mjs, the ONE Boom shape shared by the plugin's node assembler and the
 * app's TypeScript. The runtime lives in boom-normalise.mjs; keep the two in step by hand.
 * The app re-exports the result as `Boom` in src/data/contract.ts. */

export interface BoomRawRatios {
  revenue?: number | null;
  revenuePrior?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  ebitda?: number | null;
  totalDebt?: number | null;
  leverage?: number | null;
  interestCoverage?: number | null;
  revenueYoY?: number | null;
  grossMargin?: number | null;
  /** FRACTION as Boom emits it (0.081), not the rendered percentage. */
  ebitdaMargin?: number | null;
}

export interface NormalisedBoomPeriod {
  period?: string;
  revenue?: number;
  /** Only ever set for the ratios' own asOf period. The chart carries no D&A. */
  ebitda?: number;
  margin?: number;
}

export interface NormalisedBoomLineItem {
  line?: string;
  ltm?: number;
  priorFy?: number;
}

export interface NormalisedBoom {
  ratios?: {
    revenue?: number;
    ebitda?: number;
    /** PERCENT, scaled from Boom's fraction at the seam. */
    ebitdaMargin?: number;
    totalLeverage?: number;
    interestCoverage?: number;
    asOf?: string;
    raw?: BoomRawRatios;
  };
  spread?: {
    sourceFile?: string;
    periods?: NormalisedBoomPeriod[];
    lineItems?: NormalisedBoomLineItem[];
    /** boom_get_spread `file`, verbatim: the provenance copy the challenge recomputes from. */
    file?: unknown;
  };
  note?: string;
}

export interface SpreadIndex {
  index: Record<string, Record<string, number>>;
  /** Period end dates, newest first. */
  endDates: string[];
  latest: string;
}

export declare const REVENUE_CODES: string[];
export declare function ratiosAsOf(ratios: unknown): string | null;
export declare function indexSpreadFile(file: unknown): SpreadIndex | null;
export declare function normaliseBoom(boom: unknown): NormalisedBoom | null;
export declare function normaliseC360Boom<T>(data: T): T;
