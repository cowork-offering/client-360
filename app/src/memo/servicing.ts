/* =============================================================================
   THE SERVICING MODULE'S DATA ADAPTER (phase D, 2026-09-04).

   Three AFS reads behind one call: the loan as booked, how it has been paid,
   and how much of the revolver is drawn. Shapes transcribed from the port plan
   and confirmed against one live call each on 2026-09-04 (see OBSERVED.md);
   nothing here is guessed and no observed VALUE is carried as sample data.

   THE KEY IS THE WHOLE GAME. Without a mapping this returns the gap and calls
   nothing: see afsMapping.ts for why a defaulted AFS key is worse than no data.
   ============================================================================= */

import { SERVERS, TOOLS, callTool } from "../channel/mcp";
import type { AfsCoordinates } from "../data/contract";
import { AFS_GAP } from "./afsMapping";

export interface AfsLoanSummary {
  borrower?: { name?: string; type?: string; status?: string; salesVolume?: number; currency?: string; reviewDate?: string; probabilityOfDefault?: number };
  facilities?: Array<{ application?: number; type?: string; totalDirect?: number; prinBalCurrentDirect?: number; futureDirect?: number }>;
  terms?: { product?: string; purpose?: string; secured?: string; commitment?: number; legalMaturityDate?: string; rate?: number; accrualStatus?: string; performing?: string; loanToValue?: number };
  outstanding?: { balanceType?: string; amount?: number; currency?: string; asOf?: string };
  balanceCodes?: Array<{ code?: string; amount?: number }>;
  collateral?: Array<{ item?: number; type?: string; description?: string; currentValue?: number; netUseableValue?: number; advancePercent?: number }>;
  guaranties?: unknown[];
  /** The tool's own words about what it could not answer. Rendered verbatim. */
  warnings?: string[];
}

export interface AfsPaymentHistory {
  status?: { currentDaysPastDue?: number; timesPastDue?: number; returnedCheckCount?: number; nextDueDate?: string; firstDelinquencyDate?: string; principalPastDue?: number; principalBilledNotPaid?: number; performing?: string; finalClose?: string };
  agingBuckets?: Record<string, number>;
  events?: Array<{ date?: string; type?: string; amount?: number }>;
  ledgerTransactions?: number;
  notes?: string[];
}

export interface AfsRevolverUtilization {
  commitment?: number;
  drawn?: number;
  unused?: number;
  utilizationPercent?: number;
  balanceCodes?: Array<{ code?: string; amount?: number; asOf?: string }>;
}

export type ServicingModule =
  | {
      available: true;
      key: AfsCoordinates;
      loan?: AfsLoanSummary;
      payments?: AfsPaymentHistory;
      revolver?: AfsRevolverUtilization;
      /** Reads that did not answer, in the connector's own words. */
      unreachable: string[];
    }
  | { available: false; gap: string };

/**
 * Read servicing for one obligation, or report the gap.
 *
 * The three reads are independent: one connector failure loses one panel, not
 * the module. Reads carry `read: true`, so the transport's retry-once policy
 * covers an expired AFS session (mcp.ts); none of them writes anything.
 */
export async function readServicing(mapping: AfsCoordinates | undefined): Promise<ServicingModule> {
  if (!mapping) return { available: false, gap: AFS_GAP };
  const input = { bank: mapping.bank, obligor: mapping.obligor, obligation: mapping.obligation };

  const [loan, payments, revolver] = await Promise.all([
    read<AfsLoanSummary>(TOOLS.afsLoanSummary, input),
    read<AfsPaymentHistory>(TOOLS.afsPaymentHistory, input),
    read<AfsRevolverUtilization>(TOOLS.afsRevolverUtilization, input),
  ]);

  return {
    available: true,
    key: mapping,
    loan: loan.data,
    payments: payments.data,
    revolver: revolver.data,
    unreachable: [loan, payments, revolver].flatMap((r) => (r.error ? [r.error] : [])),
  };
}

async function read<T>(tool: string, input: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const res = await callTool<T>(SERVERS.afs, tool, input, { read: true });
    return { data: res.payload };
  } catch (e) {
    const failure = e as { message?: string; fix?: string };
    return { error: `${tool}: ${failure.fix ?? failure.message ?? String(e)}` };
  }
}
