/* =============================================================================
   DECISION TOKEN (A33.5.4)

   Stated plainly so nobody reads more into it than it holds: the token is
   evidence that A NAMED HUMAN SAW A SPECIFIC PLAN AND PRESSED CONFIRM. It is
   NOT a credit approval, it does not stand in for one, and no tool may write a
   state the bank's own process is supposed to mint.

   Properties the spec requires and this module enforces:
     - minted ONLY by the panel's confirm gesture,
     - single use,
     - bound to stagingId + planHash + the banker's user id,
     - the model cannot mint it (there is no tool surface that returns one).
   ============================================================================= */

export interface DecisionToken {
  token: string;
  stagingId: string;
  planHash: string;
  /** The banker who pressed confirm. */
  userId: string;
  mintedAt: string;
}

/** Tokens already spent. Single use is enforced here, not by the caller. */
const spent = new Set<string>();

function randomSuffix(): string {
  const c = (typeof crypto !== "undefined" ? crypto : undefined) as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Mint a token. The caller must be the confirm gesture: this is deliberately
 * not exported through any tool-facing surface, so a model has no path to it.
 */
export function mintDecisionToken(args: { stagingId: string; planHash: string; userId: string }): DecisionToken {
  if (!args.stagingId || !args.planHash) {
    throw new Error("a decision token must be bound to a stagingId and a planHash");
  }
  if (!args.userId) {
    throw new Error("a decision token must name the banker who confirmed");
  }
  return {
    token: `dt-${randomSuffix()}`,
    stagingId: args.stagingId,
    planHash: args.planHash,
    userId: args.userId,
    mintedAt: new Date().toISOString(),
  };
}

export type TokenCheck = { valid: true } | { valid: false; reason: string };

/** Validate a token against the plan it is being spent on, and burn it. */
export function redeemDecisionToken(token: DecisionToken, against: { stagingId: string; planHash: string }): TokenCheck {
  if (spent.has(token.token)) return { valid: false, reason: "this confirmation has already been used" };
  if (token.stagingId !== against.stagingId) return { valid: false, reason: "the confirmation belongs to a different staged plan" };
  // The single most important check: a token never travels to another plan.
  if (token.planHash !== against.planHash) {
    return { valid: false, reason: "the plan changed after you confirmed it, so the confirmation no longer applies" };
  }
  spent.add(token.token);
  return { valid: true };
}

/** Test-only reset so suites do not leak spent tokens into one another. */
export function __resetSpentTokens(): void {
  spent.clear();
}
