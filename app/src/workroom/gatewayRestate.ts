import { callTool, SERVERS, TOOLS, unwrapLlm } from "../channel/mcp";

/* =============================================================================
   THE VOCABULARY ASSIST.

   Its whole job is WORDS. It restates a banker's line using the room's own
   vocabulary and the deterministic parser reads THAT; nothing the gateway says
   becomes a chip without passing the same validation a typed line passes. So a
   wrong restatement is a wrong sentence, never a wrong write.

   BOUNDED, because a gateway that never answers is silence and silence is the
   one thing the room may not do. The deterministic parse has already missed by
   the time this runs, so this call gets a slice of the banker's attention and
   then the honest miss is the answer.

   ONE call, lean payload, and the answer is a SENTENCE rather than a structure:
   the artifact-to-connector bridge burns on machine-shaped payloads (structured
   tripped at ask 2, prose lasted 15).
   ============================================================================= */

/** How long the assist may hold the conversation open. */
export const RESTATE_TIMEOUT_MS = 12_000;

export type Restate = (line: string, vocabulary: string[]) => Promise<string | null>;

/**
 * Restate `line` in `vocabulary`. Null means "no help": either the gateway said
 * the line is not one of ours, or it did not answer in time. Both are the same
 * fact to the caller, which is that the deterministic miss stands.
 */
export const gatewayRestate: Restate = async (line, vocabulary) => {
  const prompt =
    "Rewrite this banker instruction using only these words, keeping every number, name and date exactly as written. " +
    "Reply with the rewritten instruction and nothing else. If it is not an instruction about a loan or a credit package, reply NONE.\n" +
    `Words: ${vocabulary.join(", ")}\nInstruction: ${line}`;
  try {
    const res = await Promise.race([
      callTool(SERVERS.gateway, TOOLS.llm, { prompt }, { read: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("the gateway did not answer in time")), RESTATE_TIMEOUT_MS)),
    ]);
    const text = unwrapLlm(res.payload).text.trim();
    return !text || /^none$/i.test(text) ? null : text;
  } catch {
    // A gateway that is down is not a parse failure the banker should read as
    // one: the deterministic path already answered, and this was the assist.
    return null;
  }
};
