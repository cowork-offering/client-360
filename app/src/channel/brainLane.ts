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

export type BrainRoute = "modify" | "renew" | "create";

/** One member of the package, named tersely enough for a proposal to target it. */
export interface BrainFacility {
  loanId: string;
  label: string;
  /** The commitment as the room prints it. Pre-formatted; never re-derived. */
  commitment: string;
}

/**
 * WHAT THE ROOM HANDS THE BRAIN. Compact by design.
 *
 * It carries the banker's line verbatim, where the room is standing, what it is
 * standing on, and a digest of what is already staged. It does NOT carry the
 * grounding pack: that ships as the plugin skill the session loads, and
 * `grounding` names it so a session without it says so rather than answering
 * ungrounded.
 */
export interface BrainEnvelope {
  /** Protocol version. A session skill may refuse a shape it does not know. */
  v: 1;
  /** The banker's line, verbatim. Never rewritten, never summarised. */
  line: string;
  relationship: string;
  route: BrainRoute;
  packageName: string;
  productPackageId: string | null;
  /** The facility the conversation is standing on, where one is selected. */
  selectedFacility: BrainFacility | null;
  /** The members a credit action can run against, so a proposal can name one. */
  facilities: BrainFacility[];
  /** The staged plan, digested. Titles, targets and the proposed reading only. */
  staged: Array<{ title: string; target: string; after: string }>;
  /** WHERE THE GROUNDING IS. The pack is not inlined; the skill carries it. */
  grounding: "plugin-skill:workroom-brain";
}

/* --------------------------------------------------------- the three shapes */

/** (a) An answer, rendered by the room's own read-card components. */
export interface BrainReadCard {
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
export interface BrainDeltaProposal {
  type: "delta-proposal";
  action: "loan-modification";
  /** REQUIRED by the tool, and by us: it is the credit reason on the ledger. */
  rationale: string;
  facilityIds?: string[];
  loanId?: string;
  changes: BrainChanges;
}

/** (c) An honest question, when intent is genuinely ambiguous. */
export interface BrainClarify {
  type: "clarify";
  text: string;
  /** Present only where the legal answer set is closed and short. `say` is the
   *  sentence the chip types back, so a chip can do nothing the banker could
   *  not have typed. */
  options?: Array<{ label: string; say: string }>;
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
};

/** The clarify a round trip that never came back resolves to. It names the
 *  delay rather than pretending the question was answered. */
export function timeoutClarify(seconds: number): BrainClarify {
  return {
    type: "clarify",
    text: `The desk has not come back within ${seconds} seconds, so I am not going to leave you waiting on it. Ask again, or say the change you want and I will put it up.`,
  };
}

/** The clarify a room with no bridge answers a routed line with. Honest, and
 *  it never hangs: there was nothing to wait for. */
export const NOT_CONNECTED_CLARIFY: BrainClarify = {
  type: "clarify",
  text: "This view is not connected to the bank's systems, so I cannot take that question to the desk. I can still change this package once a connector is added.",
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

function validDelta(o: Record<string, unknown>): boolean {
  if (o.action !== "loan-modification") return false;
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
  if (!str(o.topic) || !str(o.title)) return false;
  const list = rows(o.rows);
  if (!list) return false;
  if (o.followUp !== undefined && !str(o.followUp)) return false;
  return list.every((r) => str(r.icon) && str(r.label) && str(r.value) && (r.sub === undefined || str(r.sub)));
}

function validClarify(o: Record<string, unknown>): boolean {
  if (!str(o.text)) return false;
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
    const name = named(c);
    push(scalarLine(c, name), scalarLine(c, name) ?? "change");
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

/**
 * THE PROMPT THE ENVELOPE TRAVELS IN.
 *
 * The completion door takes a string, so the envelope is serialised into one.
 * The preamble states the CONTRACT and points at the grounding; it does not
 * restate the pack. Where the session has loaded the plugin skill, the skill is
 * the authority and this is a reminder; where it has not, the reply will fail
 * validation and the banker gets the neutral clarify rather than an ungrounded
 * answer wearing a card's clothes.
 */
export function composeBrainPrompt(envelope: BrainEnvelope): string {
  return [
    "You are the credit brain of a relationship workroom, answering one banker line.",
    "Your grounding is the workroom-brain plugin skill (WORKROOM-BRAIN.md). Obey it.",
    "",
    "Reply with EXACTLY ONE JSON object and no prose outside it. One of three shapes:",
    '  {"type":"read-card","topic":…,"title":…,"rows":[{"icon":…,"label":…,"value":…,"sub":…}],"followUp":…}',
    '  {"type":"delta-proposal","action":"loan-modification","rationale":…,"facilityIds":[…],"changes":{…}}',
    '  {"type":"clarify","text":…,"options":[{"label":…,"say":…}]}',
    "",
    "Never write. Never call an execute_ tool. Never fabricate a figure, a record or an id.",
    "If the read does not carry it, say the read does not carry it, in a clarify.",
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

  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    const raced = await Promise.race([send(composeBrainPrompt(envelope), controller?.signal).catch(() => null), timeout]);
    if (raced === "timeout") {
      controller?.abort();
      return timeoutClarify(Math.round(timeoutMs / 1000));
    }
    if (typeof raced !== "string") return UNREADABLE_CLARIFY;
    const parsed = parseBrainReply(raced);
    return parsed.ok ? parsed.reply : UNREADABLE_CLARIFY;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
