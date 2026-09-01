import { callTool, mcpAvailable, SERVERS, TOOLS, unwrapLlm } from "./mcp";

/* =============================================================================
   THE BRAIN LANE — the room's second lane, over the artifact<->session bridge.

   TWO LANES, ONE COMPOSER. The deterministic parser is the FAST LANE and it is
   untouched: a line it confidently claims stages exactly as it did before this
   module existed. What routes here is what the fast lane cannot claim — every
   question the guard catches, and every line the parser hands back unparsed.

   THE TRANSPORT IS THE ASSIST'S OWN. `askCopilot` (channel/cockpitTools.ts)
   reaches the session's completion door through `window.claude.mcp` — the
   PROVEN live channel — and that is the one arm on this bridge that can carry a
   REPLY back. The legacy `window.sendPrompt` arm in channel/adapter.ts is
   fire-and-forget by construction: it hands a prompt over and resolves, and
   nothing ever comes back to parse. A lane built on it could only ever hang or
   lie, so this module treats "no mcp capability" as NO BRAIN LANE and says so
   (see `brainReachable`). That is the channel-none doctrine applied to the
   second lane.

   THE FENCE HOLDS. Nothing here writes, stages, mints a token or reaches an
   `execute_*` tool. A delta-proposal that validates is RESTATED as the sentence
   a banker could have typed and goes back through `engine.parseIntent` — the
   same path a typed line takes, the same org-side re-validation, the same plan,
   confirm and token ceremony. The brain proposes; the spine writes.

   A REPLY THAT FAILS VALIDATION IS NOT RENDERED. It degrades to a neutral
   clarify. Broken UI from a malformed model reply is the one failure this
   module exists to make impossible.
   ============================================================================= */

/* ------------------------------------------------------------ the envelope */

/** One member of the package, named tersely enough for a proposal to target it. */
export interface BrainFacility {
  loanId: string;
  label: string;
  /** The commitment as the room prints it. Pre-formatted; never re-derived. */
  commitment: string;
}

/* ------------------------------------------------------------ read blocks

   THE ENVELOPE WAS BLIND (F2, proven three times in the 2026-09-01 drive: the
   covenant read, the rate read and the guarantors read all came back "data not
   carried" over a bundle that held every one of them). What the room has ALREADY
   READ now travels with the line, pre-formatted exactly as the room prints it,
   so an answer is grounded in the same figures the glass shows.

   EVERY BLOCK IS READ, NEVER DERIVED. `notCarried` is the other half and it is
   load-bearing: a block that is absent because no read on this cockpit carries
   it must be refusable BY NAME, and an absent block must never be reported as
   an empty fact.                                                            */

export interface BrainReadBlocks {
  covenants?: Array<{
    name: string;
    threshold: string;
    measured?: string;
    lastEvaluated?: string;
    nextTest?: string;
    status: string;
    /** The facility it is attached to, or "across the relationship". */
    scope: string;
  }>;
  involvements?: Array<{
    name: string;
    role: string;
    /** Only where the org's OWN word says so. Absent is not "corporate". */
    kind?: "corporate" | "person";
    scope: string;
    detail?: string;
  }>;
  collateral?: Array<{
    asset: string;
    type?: string;
    advanceRate?: string;
    pledged?: string;
    lendable?: string;
    scope: string;
  }>;
  exposure?: { committed: string; drawn: string; available?: string; facilities: number };
  /** Pricing AS STORED. Rate only: this org stores no index name (see the
   *  prompt's prohibition) and no read on this cockpit carries a spread. */
  pricing?: Array<{ facility: string; rate: string }>;
  /** What NO read on this cockpit carries, named so an answer refuses by name
   *  rather than reporting silence as a fact. */
  notCarried: string[];
}

/** One exchange of the conversation so far. The banker's words are verbatim;
 *  the room's are summarised, because a room quoting itself at length crowds
 *  out the reads the answer actually needs. */
export interface BrainTurn {
  who: "banker" | "agent";
  text: string;
}

/** WHAT THIS ROUTE CAN AND CANNOT FILE. The relationship room refuses creates
 *  by name (CREATE_GAPS, OVERRIDE_NOT_FILEABLE) and the brain must refuse the
 *  same way rather than inventing a capability the org does not deploy. */
export interface BrainFileable {
  files: string[];
  cannot: Array<{ what: string; why: string }>;
}

/**
 * WHAT THE ROOM HANDS THE BRAIN.
 *
 * It carries the banker's line verbatim, where the room is standing, what it is
 * standing on, what it has already READ, the conversation so far, and a digest
 * of what is staged. It does NOT carry the grounding pack: that ships as the
 * plugin skill the session loads, and `grounding` names it so a session without
 * it says so rather than answering ungrounded.
 *
 * IT IS CAPPED. `capEnvelope` holds the serialised form under
 * {@link ENVELOPE_CAP_BYTES} and names in `omitted` whatever it had to drop, so
 * a trimmed envelope can never be read as an empty one.
 */
export interface BrainEnvelope {
  /** Protocol version. A session skill may refuse a shape it does not know.
   *  v2 added the read blocks, the thread digest and the fileable map. */
  v: 2;
  /** The banker's line, verbatim. Never rewritten, never summarised. */
  line: string;
  /** Which room is asking. The two rooms have different route vocabularies and
   *  different filing surfaces, and an answer must not confuse them. */
  room: "facility" | "relationship";
  relationship: string;
  /** The bound route, in the asking room's own vocabulary. "unbound" while the
   *  room is still asking which route this is. */
  route: string;
  /** TRUE while the route question is still open. A reply may then NAME the
   *  route (see `route` on the three shapes); binding still happens through the
   *  room's own router, and an ambiguous intent still asks. */
  routeOpen?: boolean;
  /** The legal route words, when the route question is open. */
  routeOptions?: string[];
  packageName: string;
  productPackageId: string | null;
  /** The facility the conversation is standing on, where one is selected. */
  selectedFacility: BrainFacility | null;
  /** The members a credit action can run against, so a proposal can name one. */
  facilities: BrainFacility[];
  /** The staged plan, digested. Titles, targets and the proposed reading only. */
  staged: Array<{ title: string; target: string; after: string }>;
  /** What the room has already read. Absent where it stands on no read. */
  reads?: BrainReadBlocks;
  /** The conversation so far, oldest first. This is what makes it chat. */
  thread?: BrainTurn[];
  fileable?: BrainFileable;
  /** Blocks dropped to hold the envelope under its cap. Named, never silent. */
  omitted?: string[];
  /** WHERE THE GROUNDING IS. The pack is not inlined; the skill carries it. */
  grounding: "plugin-skill:workroom-brain";
}

/* ------------------------------------------------------------------- the cap

   A PROMPT IS NOT A DATABASE. The read blocks are bounded by the package, but a
   long conversation is not, so the envelope is trimmed to a budget before it
   travels. THREAD HISTORY GOES FIRST: an answer without the last six exchanges
   is a worse conversation, and an answer without the covenant thresholds is a
   wrong one.                                                                 */

/** The serialised budget. Comfortably inside the completion door's headroom and
 *  well clear of the grounding pack the skill loads beside it. */
export const ENVELOPE_CAP_BYTES = 10_000;

/** Read blocks in the order they are given up. Exposure is last: it is four
 *  figures and it grounds nearly every question a banker asks. */
export const ENVELOPE_BLOCK_DROP_ORDER = ["pricing", "collateral", "involvements", "covenants", "exposure"] as const;

const sizeOf = (envelope: BrainEnvelope): number => JSON.stringify(envelope).length;

/**
 * THE ENVELOPE, TRIMMED TO ITS BUDGET, SAYING WHAT IT DROPPED.
 *
 * Thread turns go oldest-first, then whole read blocks in
 * {@link ENVELOPE_BLOCK_DROP_ORDER}. `omitted` names everything given up so a
 * reply can say "that is not in front of me" rather than "there is none", and
 * it is measured as it grows: a cap that ignored its own honesty field would
 * come back over budget by exactly the width of that field.
 *
 * THE BANKER'S LINE IS NEVER TRIMMED. Where the line alone is bigger than the
 * budget, the envelope travels over it with every block named as omitted: a
 * question cut in half is worse than a prompt that is long.
 */
export function capEnvelope(envelope: BrainEnvelope, cap: number = ENVELOPE_CAP_BYTES): BrainEnvelope {
  if (sizeOf(envelope) <= cap) return envelope;
  const out: BrainEnvelope = { ...envelope };
  const omit = (what: string) => {
    out.omitted = [...(out.omitted ?? []), what];
  };

  if (out.thread?.length) {
    const thread = [...out.thread];
    const before = thread.length;
    while (thread.length && sizeOf({ ...out, thread, omitted: [...(out.omitted ?? []), "earlier conversation"] }) > cap) {
      thread.shift();
    }
    out.thread = thread.length ? thread : undefined;
    if (thread.length !== before) omit("earlier conversation");
  }

  if (sizeOf(out) > cap && out.reads) {
    const reads: BrainReadBlocks = { ...out.reads };
    out.reads = reads;
    for (const block of ENVELOPE_BLOCK_DROP_ORDER) {
      if (sizeOf(out) <= cap) break;
      if (reads[block] === undefined) continue;
      delete reads[block];
      omit(block);
    }
  }
  return out;
}

/* --------------------------------------------------------- the three shapes */

/**
 * THE ROUTE A REPLY NAMES, where the room is still asking which route this is.
 *
 * It is the asking room's OWN vocabulary (`routeOptions` on the envelope), and
 * the ROOM decides whether the word is legal: a route the room does not know is
 * ignored and the question stands. Binding always runs through the room's own
 * router, so a named route can do nothing a chip could not.
 */
interface Routed {
  route?: string;
}

/** (a) An answer, rendered by the room's own read-card components. */
export interface BrainReadCard extends Routed {
  type: "read-card";
  /** The card style slug: involvements, covenants, collateral, fees, exposure,
   *  pricing, exceptions, history, decisions. Free text; the room maps it. */
  topic: string;
  /** One line, banker language, no question mark. */
  title: string;
  rows: Array<{ icon: string; label: string; value: string; sub?: string }>;
  /** ONE question, only where the read leads somewhere. Never two. */
  followUp?: string;
}

/** One entry of a change list. `targetLoanId` may be omitted where exactly one
 *  facility is selected; the room resolves it against the selection. */
interface Targeted {
  targetLoanId?: string;
}

export interface BrainScalarChange extends Targeted {
  key: "requestedAmount" | "requestedMaturityDate" | "requestedRate" | "requestedTermMonths";
  value: number | string;
}
export interface BrainCovenantAdd extends Targeted {
  typeName: string;
  threshold: number;
  operator: "<" | "<=" | "=" | ">=" | ">";
  frequency?: string;
  effectiveDate?: string;
}
export interface BrainInvolvementChange extends Targeted {
  op: "add" | "remove";
  role?: string;
  accountId?: string;
  accountName?: string;
  ownership?: number;
}
export interface BrainFieldChange extends Targeted {
  field: string;
  value: string | number | boolean;
}
export interface BrainFeeAdd extends Targeted {
  feeType: string;
  description?: string;
  calculationType: "Percentage" | "Flat Amount";
  percentage?: number;
  amount?: number;
  basisSource?: string;
  recordType?: string;
  paidBy?: string;
}
export interface BrainPledgeAdd extends Targeted {
  collateralId?: string;
  newCollateral?: { description: string; collateralType: string; value: number };
  advanceRate?: number;
  advanceRateReason?: string;
  amountPledged?: number;
  lienPosition?: string;
}
export interface BrainPolicyExceptionAdd extends Targeted {
  title: string;
  status: "Waived" | "Mitigated" | "Unmitigated";
  mitigationReasons?: string[];
  severity?: string;
  severityValue?: number;
  code?: string;
  type?: string;
}

/** The seven wire keys of `stage_loan_modification`, as the pack declares them. */
export interface BrainChanges {
  scalarChangesJson?: BrainScalarChange[];
  covenantAddsJson?: BrainCovenantAdd[];
  involvementChangesJson?: BrainInvolvementChange[];
  fieldChangesJson?: BrainFieldChange[];
  feeAddsJson?: BrainFeeAdd[];
  pledgeAddsJson?: BrainPledgeAdd[];
  policyExceptionAddsJson?: BrainPolicyExceptionAdd[];
}

/** (b) A proposed change. It never reaches a tool from here: it is restated as
 *  a sentence and re-enters the deterministic parser. */
export interface BrainDeltaProposal extends Routed {
  type: "delta-proposal";
  action: "loan-modification";
  /** REQUIRED by the tool, and by us: it is the credit reason on the ledger. */
  rationale: string;
  facilityIds?: string[];
  loanId?: string;
  changes: BrainChanges;
}

/** (c) An honest question, when intent is genuinely ambiguous. */
export interface BrainClarify extends Routed {
  type: "clarify";
  text: string;
  /** Present only where the legal answer set is closed and short. `say` is the
   *  sentence the chip types back, so a chip can do nothing the banker could
   *  not have typed. */
  options?: Array<{ label: string; say: string }>;
  /**
   * THIS CLARIFY IS A DEGRADE, not an answer.
   *
   * Set by this module and NEVER by a model reply (the validator strips it).
   * It is what lets the room fall back to today's parser reply instead of
   * showing a lane failure where the fast lane had a real answer to give.
   */
  degraded?: true;
}

/** TRUE where a reply is this module's own degrade rather than a desk answer. */
export function isDegrade(reply: BrainReply): boolean {
  return reply.type === "clarify" && reply.degraded === true;
}

export type BrainReply = BrainReadCard | BrainDeltaProposal | BrainClarify;

/* ----------------------------------------------------------- the validator */

/** Why a reply was not accepted. Rendered nowhere: it is for the console and
 *  for the tests. The banker gets the neutral clarify. */
export type BrainRejection =
  | "empty"
  | "not-json"
  | "not-an-object"
  | "unknown-type"
  | "bad-read-card"
  | "bad-delta"
  | "bad-clarify";

export type BrainParse = { ok: true; reply: BrainReply } | { ok: false; why: BrainRejection };

/** THE NEUTRAL DEGRADE. One sentence, no blame, and a route out that the fast
 *  lane can actually take. Every validation failure resolves to this. */
export const UNREADABLE_CLARIFY: BrainClarify = {
  type: "clarify",
  text: "I could not read that answer. Try asking directly, or say the change you want and I will put it up.",
  degraded: true,
};

/** The clarify a round trip that never came back resolves to. It names the
 *  delay rather than pretending the question was answered. */
export function timeoutClarify(seconds: number): BrainClarify {
  return {
    type: "clarify",
    text: `The desk has not come back within ${seconds} seconds, so I am not going to leave you waiting on it. Ask again, or say the change you want and I will put it up.`,
    degraded: true,
  };
}

/** The clarify a room with no bridge answers a routed line with. Honest, and
 *  it never hangs: there was nothing to wait for. */
export const NOT_CONNECTED_CLARIFY: BrainClarify = {
  type: "clarify",
  text: "This view is not connected to the bank's systems, so I cannot take that question to the desk. I can still change this package once a connector is added.",
  degraded: true,
};

const isRow = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const SCALAR_KEYS = new Set(["requestedAmount", "requestedMaturityDate", "requestedRate", "requestedTermMonths"]);
const OPERATORS = new Set(["<", "<=", "=", ">=", ">"]);
const EXCEPTION_STATUS = new Set(["Waived", "Mitigated", "Unmitigated"]);
const CHANGE_KEYS = [
  "scalarChangesJson",
  "covenantAddsJson",
  "involvementChangesJson",
  "fieldChangesJson",
  "feeAddsJson",
  "pledgeAddsJson",
  "policyExceptionAddsJson",
] as const;

/** Every entry of a change list must be an object, or the list is not one. */
function rows(v: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.every(isRow) ? (v as Record<string, unknown>[]) : null;
}

/** ONE entry of one change list, validated against its own required fields.
 *  An entry that fails takes its whole list with it: a half-read change list
 *  would stage some of what the brain proposed and silently drop the rest. */
function validEntry(key: (typeof CHANGE_KEYS)[number], e: Record<string, unknown>): boolean {
  if (e.targetLoanId !== undefined && !str(e.targetLoanId)) return false;
  switch (key) {
    case "scalarChangesJson":
      return str(e.key) && SCALAR_KEYS.has(e.key as string) && (num(e.value) || str(e.value));
    case "covenantAddsJson":
      return str(e.typeName) && num(e.threshold) && str(e.operator) && OPERATORS.has(e.operator as string);
    case "involvementChangesJson":
      return (e.op === "add" || e.op === "remove") && (str(e.accountName) || str(e.accountId));
    case "fieldChangesJson":
      return str(e.field) && (num(e.value) || str(e.value) || typeof e.value === "boolean");
    case "feeAddsJson":
      if (!str(e.feeType)) return false;
      if (e.calculationType === "Percentage") return num(e.percentage) && e.amount === undefined;
      if (e.calculationType === "Flat Amount") return num(e.amount) && e.percentage === undefined;
      return false;
    case "pledgeAddsJson": {
      const existing = str(e.collateralId);
      const fresh = isRow(e.newCollateral) && str(e.newCollateral.description) && str(e.newCollateral.collateralType);
      // EXACTLY ONE of the two shapes. Both, or neither, is not a pledge.
      return existing !== fresh;
    }
    case "policyExceptionAddsJson":
      return str(e.title) && str(e.status) && EXCEPTION_STATUS.has(e.status as string);
  }
}

/** A named route is a STRING or it is not there. Whether the word is a legal
 *  route is the ROOM's judgement, not the validator's: the two rooms have
 *  different vocabularies and neither one is knowable from here. */
const validRoute = (o: Record<string, unknown>): boolean => o.route === undefined || str(o.route);

function validDelta(o: Record<string, unknown>): boolean {
  if (o.action !== "loan-modification") return false;
  if (!validRoute(o)) return false;
  if (!str(o.rationale)) return false;
  // ONE SHAPE OR THE OTHER, never both: the tool refuses a request carrying
  // the package-anchored list and the single-facility back-compat field.
  if (o.facilityIds !== undefined && o.loanId !== undefined) return false;
  if (o.facilityIds !== undefined && !(Array.isArray(o.facilityIds) && o.facilityIds.length > 0 && o.facilityIds.every(str)))
    return false;
  if (o.loanId !== undefined && !str(o.loanId)) return false;
  if (!isRow(o.changes)) return false;

  let carried = 0;
  for (const key of CHANGE_KEYS) {
    const raw = (o.changes as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    const list = rows(raw);
    if (!list || !list.every((e) => validEntry(key, e))) return false;
    carried += list.length;
  }
  // A proposal with no change is refused by the tool, so it is refused here.
  return carried > 0;
}

function validReadCard(o: Record<string, unknown>): boolean {
  if (!str(o.topic) || !str(o.title) || !validRoute(o)) return false;
  const list = rows(o.rows);
  if (!list) return false;
  if (o.followUp !== undefined && !str(o.followUp)) return false;
  return list.every((r) => str(r.icon) && str(r.label) && str(r.value) && (r.sub === undefined || str(r.sub)));
}

function validClarify(o: Record<string, unknown>): boolean {
  if (!str(o.text) || !validRoute(o)) return false;
  // `degraded` is THIS MODULE'S word for its own fallback. A reply that claims
  // it would make the room replay the parser over a real desk answer, so it is
  // stripped rather than trusted.
  delete o.degraded;
  if (o.options === undefined) return true;
  const list = rows(o.options);
  return !!list && list.every((c) => str(c.label) && str(c.say));
}

/**
 * THE HARD VALIDATOR.
 *
 * A model reply is untrusted text. It is accepted only when it is exactly one
 * of the three shapes AND every required field of that shape is present and of
 * the right type. Anything else is rejected with a reason, and the caller
 * degrades to {@link UNREADABLE_CLARIFY}.
 *
 * The raw string may carry a fenced code block, a leading sentence or a
 * trailing one: models do that, and refusing on it would fail a reply that is
 * otherwise perfectly in contract. The FIRST balanced top-level object is
 * taken. Nothing else is tolerated.
 */
export function parseBrainReply(raw: string): BrainParse {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, why: "empty" };

  const json = extractObject(text);
  if (json === null) return { ok: false, why: "not-json" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, why: "not-json" };
  }
  if (!isRow(parsed)) return { ok: false, why: "not-an-object" };

  switch (parsed.type) {
    case "read-card":
      return validReadCard(parsed) ? { ok: true, reply: parsed as unknown as BrainReadCard } : { ok: false, why: "bad-read-card" };
    case "delta-proposal":
      return validDelta(parsed) ? { ok: true, reply: parsed as unknown as BrainDeltaProposal } : { ok: false, why: "bad-delta" };
    case "clarify":
      return validClarify(parsed) ? { ok: true, reply: parsed as unknown as BrainClarify } : { ok: false, why: "bad-clarify" };
    default:
      return { ok: false, why: "unknown-type" };
  }
}

/** The first balanced `{...}` at top level, string-aware so a brace inside a
 *  quoted value cannot close the object early. Null where there is none. */
function extractObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/* ------------------------------------------------------------- the restate

   A VALIDATED PROPOSAL BECOMES A SENTENCE, and the sentence goes back through
   the deterministic parser. That is the whole of how the brain reaches the
   staging path: it can do nothing a banker could not have typed, the org
   re-validates at stage time exactly as it always did, and the plan hash, the
   single-use token and the one human approval are untouched.

   Every phrasing below is one the parser's own suite already asserts
   (app/src/workroom/parseModify.test.ts). A shape with no proven phrasing is
   NOT invented one: `restateProposal` drops it and the caller says so.        */

/** The member label a `targetLoanId` names, for the parser to resolve on. */
export type FacilityNamer = (loanId: string | undefined) => string | null;

const money = (v: number | string): string =>
  typeof v === "number" ? `$${Math.round(v).toLocaleString("en-US")}` : String(v);

/** " on the Line of Credit", or nothing where no member is named. */
const on = (name: string | null) => (name ? ` on the ${name}` : "");

function scalarLine(c: BrainScalarChange, name: string | null): string | null {
  const target = name ?? "facility";
  switch (c.key) {
    case "requestedAmount":
      return `take the ${target} to ${money(c.value)}`;
    case "requestedMaturityDate":
      return str(c.value) ? `move the ${target} maturity to ${c.value}` : null;
    case "requestedRate":
      return `move the ${target} rate to ${typeof c.value === "number" ? `${c.value}%` : c.value}`;
    case "requestedTermMonths":
      return num(c.value) ? `give the ${target} a ${c.value} month term` : null;
  }
}

/**
 * THE PROPOSAL, SAID.
 *
 * One sentence per change, in landing order, each with the label the banker
 * reads on the chip. `dropped` counts what carried no proven phrasing, so the
 * room can say what it did not offer rather than swallowing it.
 */
export function restateProposal(
  proposal: BrainDeltaProposal,
  nameFor: FacilityNamer,
): { lines: Array<{ say: string; label: string }>; dropped: number } {
  const lines: Array<{ say: string; label: string }> = [];
  let dropped = 0;
  // A single-facility proposal names its member once; every entry inherits it.
  const fallbackId = proposal.loanId ?? (proposal.facilityIds?.length === 1 ? proposal.facilityIds[0] : undefined);
  const push = (say: string | null, label: string) => (say ? lines.push({ say, label }) : dropped++);
  const named = (e: Targeted) => nameFor(e.targetLoanId ?? fallbackId);

  for (const c of proposal.changes.scalarChangesJson ?? []) {
    const line = scalarLine(c, named(c));
    push(line, line ?? c.key);
  }
  for (const c of proposal.changes.covenantAddsJson ?? []) {
    push(
      `add a ${c.typeName} covenant ${c.operator} ${c.threshold}${on(named(c))}`,
      `Add ${c.typeName} ${c.operator} ${c.threshold}`,
    );
  }
  for (const c of proposal.changes.involvementChangesJson ?? []) {
    const who = c.accountName;
    if (!who) {
      // An id with no name is a record the banker cannot read on a chip, and
      // the parser resolves parties by NAME. Dropped rather than guessed at.
      dropped++;
      continue;
    }
    push(
      c.op === "add"
        ? `add ${who} as a ${c.role ?? "guarantor"}${on(named(c))}`
        : `remove ${who} from the ${named(c) ?? "package"}`,
      c.op === "add" ? `Add ${who}` : `Remove ${who}`,
    );
  }
  for (const c of proposal.changes.fieldChangesJson ?? []) {
    push(`set ${c.field} to ${c.value}${on(named(c))}`, `Set ${c.field} to ${c.value}`);
  }
  for (const c of proposal.changes.feeAddsJson ?? []) {
    push(
      c.calculationType === "Percentage"
        ? `add a ${c.percentage}% ${c.feeType} fee${on(named(c))}`
        : `add a ${money(c.amount ?? 0)} ${c.feeType} fee${on(named(c))}`,
      `Add ${c.feeType} fee`,
    );
  }
  for (const c of proposal.changes.pledgeAddsJson ?? []) {
    const name = named(c);
    push(
      c.newCollateral
        ? `add a new ${money(c.newCollateral.value)} ${c.newCollateral.collateralType} as collateral${on(name)}`
        : // An existing asset is pledged by the id the read gave us; the parser
          // resolves the deal's own assets by description, so an id with no
          // description carries no proven phrasing.
          null,
      c.newCollateral ? `Pledge ${c.newCollateral.description}` : "Pledge",
    );
  }
  for (const c of proposal.changes.policyExceptionAddsJson ?? []) {
    push(
      `log a policy exception: ${c.title}, ${c.status.toLowerCase()}${on(named(c))}`,
      `Log exception: ${c.title}`,
    );
  }
  return { lines, dropped };
}

/* --------------------------------------------------------------- the wire */

/** How long the room waits on the desk before it stops waiting out loud. */
export const BRAIN_TIMEOUT_MS = 25_000;

/**
 * IS THERE A BRAIN LANE AT ALL.
 *
 * The mcp capability is the only arm of the bridge that returns a reply. With
 * no capability the room keeps the fast lane and the existing loud notice, and
 * a routed line gets {@link NOT_CONNECTED_CLARIFY} rather than a hang.
 */
export function brainReachable(): boolean {
  return mcpAvailable();
}

/* ------------------------------------------------------- the doctrine, inline

   THE PACK NEVER ARRIVES, SO THE DOCTRINE TRAVELS IN THE PROMPT.

   The envelope has always declared `grounding: "plugin-skill:workroom-brain"`
   and the preamble has always said "obey it". No channel loads it. The
   completion door is a one-shot gateway call into a model that has never seen
   WORKROOM-BRAIN.md, so the instruction pointed at a document the responder
   could not read, and P3 of the 2026-09-01 drive degraded for exactly that
   reason: an unfed model handed a JSON contract with no doctrine complies
   inconsistently.

   WHAT TRAVELS IS THE SLICE, NOT THE PACK. Twenty-seven pages in every prompt
   would crowd out the envelope it is supposed to ground. So: the rules that
   produce a WRONG ANSWER when absent travel always, and the fences of a
   SURFACE travel when the line is about that surface. The marker in the
   envelope stays, because a session that HAS loaded the pack should still be
   told the pack is the authority; the prompt simply no longer depends on it.

   Sources, by section of brain/WORKROOM-BRAIN.md: 1.5 hard rules, 2.4
   covenants, 2.5 involvement roles, 2.6 collateral chain and advance rates,
   2.7 fees, 2.8 policy exceptions, 4.2 covenant families.                    */

/** What is wrong in EVERY answer when it is absent. Always sent. */
const DOCTRINE_CORE = [
  "DOCTRINE. These rules travel with this prompt and are binding on this reply.",
  "Never fabricate a figure, a record, a covenant, a correspondence or an id. Missing data is an answer.",
  "Figures come from the live read in CONTEXT, never from memory and never from an earlier turn.",
  "One or two sentences, then the card. Never a capability lecture. No em dashes.",
  "Bands are PROPOSAL guidance, offered and labelled as such. They are never stated as facts about this borrower.",
  "COVENANT BANDS (typical C&I, tested quarterly): DSCR minimum 1.20x to 1.25x. FCCR minimum 1.15x to 1.25x.",
  "Debt to tangible net worth maximum 3.00x. Total leverage 2.5x to 3.5x is typical middle market.",
  "A threshold comes from the approved credit agreement. Propose a band, never a threshold.",
];

/** The fences of one surface, sent when the line is about that surface. */
const DOCTRINE_SURFACE: Array<{ id: string; match: RegExp; lines: string[] }> = [
  {
    id: "covenant",
    match: /\b(covenants?|tests?|dscr|fccr|leverage|liquidity|debt service|debt to worth|current ratio|net worth|capex)\b/i,
    lines: [
      "COVENANTS. A covenant ADD is safe: it mints no compliance row, starts no approval and sends no email.",
      "Covenant AMEND and DETACH are REFUSED, because every junction field is non-updateable. Say so rather than proposing one.",
      "The effective date is set once at creation and is never updated. Getting a covenant right at creation is the whole game.",
      "An empty attachedLoans list means the covenant is relationship-level. That is an answer, not a gap.",
      'Exception alone is never a breach. Check reasonForException (Breached or Overdue) before you use the word "breach".',
    ],
  },
  {
    id: "collateral",
    match: /\b(collateral|security|pledges?|pledged|lien|advance rate|lendable|coverage|receivables?|inventory|equipment|real\s*estate|warehouse)\b/i,
    lines: [
      "COLLATERAL. The advance rate on a pledge is a formula and the lendable value is derived from it.",
      "Both resolve in-transaction. Never ask a banker for either and never invent a valuation.",
      "The chain has no shortcut: the asset, then the ownership junction that is its only link to the borrower, then the pledge.",
      "Hartwell liens are 1st position and flagged out of availability. Do not quietly treat an excluded lien as included.",
    ],
  },
  {
    id: "fee",
    match: /\bfees?\b|\bbasis points?\b|\bbps\b/i,
    lines: [
      "FEES. A fee is a percentage OR a fixed amount, never both. On a percentage fee the org computes the money from the commitment.",
      "Never state a money figure beside a percentage: it would contradict what the org works out.",
      "The fee-type list on this org is residential, so a commercial fee files as Other with the banker's own words as the label.",
    ],
  },
  {
    id: "involvement",
    match: /\b(borrowers?|guarantors?|co-?borrowers?|involvements?|parties|obligors?|ownership)\b/i,
    lines: [
      "INVOLVEMENT ROLES. Five are legal: Borrower, Co-Borrower, Guarantor, Limited Guarantor, Related Entity.",
      "Adding a party already on the deal stages a SECOND row rather than correcting the first. If a role is what changed, say so.",
    ],
  },
  {
    id: "exception",
    match: /\b(policy exceptions?|exceptions?|out of policy|waiver|mitigant)\b/i,
    lines: [
      "POLICY EXCEPTIONS. Status is Waived, Mitigated or Unmitigated, and an omitted status silently states a position.",
      "Every committed exception POSTs the whole record to an external endpoint. Surface that egress in the proposal.",
    ],
  },
];

/** The doctrine this line needs: the core, plus the fences of whatever surfaces
 *  it touches. Deterministic, so the suite can assert what a line carries. */
export function doctrineFor(line: string): string[] {
  const out = [...DOCTRINE_CORE];
  for (const surface of DOCTRINE_SURFACE) {
    if (surface.match.test(line)) out.push(...surface.lines);
  }
  return out;
}

/**
 * THE PROMPT THE ENVELOPE TRAVELS IN.
 *
 * The completion door takes a string, so the envelope is serialised into one.
 * The preamble states the CONTRACT, carries the doctrine slices the line needs,
 * and then hands over the envelope. The plugin-skill marker stays on the
 * envelope, but nothing here depends on the skill having been loaded any more.
 */
export function composeBrainPrompt(envelope: BrainEnvelope): string {
  return [
    "You are the credit brain of a relationship workroom, answering one banker line.",
    "The workroom-brain pack (WORKROOM-BRAIN.md) is the authority. The slices you need are below.",
    "",
    "Reply with EXACTLY ONE JSON object and no prose outside it. One of three shapes:",
    '  {"type":"read-card","topic":…,"title":…,"rows":[{"icon":…,"label":…,"value":…,"sub":…}],"followUp":…}',
    '  {"type":"delta-proposal","action":"loan-modification","rationale":…,"facilityIds":[…],"changes":{…}}',
    '  {"type":"clarify","text":…,"options":[{"label":…,"say":…}]}',
    "",
    "Never write. Never call an execute_ tool. Never fabricate a figure, a record or an id.",
    "If the read does not carry it, say the read does not carry it, in a clarify.",
    "",
    /* ------------------------------------------- THE GROUNDING FACTS CONTRACT
       The envelope is no longer blind, so an answer that ignores it is now a
       worse failure than one that refuses. These four lines are the whole of
       what changed for the model between v1 and v2. */
    "GROUNDING FACTS. CONTEXT.reads carries what this room has already read:",
    "covenants, involvements, collateral, exposure and pricing, formatted as the glass prints them.",
    "Answer READS from those blocks and state the figures as they stand there.",
    "CONTEXT.reads.notCarried names what no read on this cockpit holds, and CONTEXT.omitted names",
    "what was dropped to fit. Refuse those BY NAME. An absent block is never an empty fact.",
    "",
    "PRICING. This org stores a rate and, on floating facilities, a spread. IT STORES NO INDEX NAME.",
    'Never say "SOFR", "Prime", "LIBOR" or any other index, and never infer one from a rate.',
    "State the rate or the spread as stored, or say the index is not stored.",
    "",
    "CONTEXT.thread is the conversation so far, oldest first. Read it: this is one conversation.",
    "CONTEXT.fileable names what this route can and cannot file. Refuse what it cannot, by name,",
    "rather than proposing a change no deployed tool accepts.",
    'If CONTEXT.routeOpen is true you may add "route" to your reply, naming ONE of CONTEXT.routeOptions,',
    "where the line makes the intent plain. Where it does not, clarify and let the banker pick.",
    "",
    ...doctrineFor(envelope.line),
    "",
    "CONTEXT:",
    JSON.stringify(envelope),
  ].join("\n");
}

export interface BrainAskDeps {
  /** The completion door. Injected so the suite never touches a global. */
  send?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  /** The clock the timeout runs on. Injected for the same reason. */
  timeoutMs?: number;
}

/** The assist's own transport, verbatim: the gateway completion door through
 *  `window.claude.mcp`, unwrapped exactly as `askCopilot` unwraps it. */
async function sendThroughBridge(prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await callTool(SERVERS.gateway, TOOLS.llm, { prompt }, { read: true, signal });
  return unwrapLlm(res.payload).text;
}

/**
 * ASK THE BRAIN, AND COME BACK WITH SOMETHING RENDERABLE.
 *
 * This never rejects and never resolves to a shape the room cannot draw. Every
 * failure — no bridge, a timeout, a transport error, a malformed reply — comes
 * back as a clarify the room renders as an agent bubble.
 */
export async function askBrain(envelope: BrainEnvelope, deps: BrainAskDeps = {}): Promise<BrainReply> {
  const send = deps.send ?? sendThroughBridge;
  const timeoutMs = deps.timeoutMs ?? BRAIN_TIMEOUT_MS;
  if (!deps.send && !brainReachable()) return NOT_CONNECTED_CLARIFY;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    // THE BUDGET IS ENFORCED AT THE WIRE, not at the caller: every room that
    // builds an envelope gets the same cap without having to remember it.
    const prompt = composeBrainPrompt(capEnvelope(envelope));
    const raced = await Promise.race([send(prompt, controller.signal).catch(() => null), timeout]);
    if (raced === "timeout") {
      controller.abort();
      return timeoutClarify(Math.round(timeoutMs / 1000));
    }
    if (typeof raced !== "string") return UNREADABLE_CLARIFY;
    const parsed = parseBrainReply(raced);
    return parsed.ok ? parsed.reply : UNREADABLE_CLARIFY;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
