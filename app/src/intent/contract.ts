/* =============================================================================
   THE INTENT CONTRACT.

   An INTENT is a conversation that happened somewhere else — a mail the banker
   forwarded into a chat, a meeting note, a line typed at the main Claude
   session — written into this artifact's store as one document so the cockpit
   can open the right room already staged on it.

   THE WRITER IS ANY CLAUDE SESSION with the Artifact tool's write_db. That is
   the whole point, and it is also why NOTHING here trusts what it reads. A
   document is DATA: strings are clipped, unknown routes and rooms are dropped,
   a line that is not a string is not a line, and an intent that does not name a
   Salesforce account id is not an intent. No field of it is ever executed, and
   the lines it carries travel through exactly the same dispatch the banker's
   own typing goes through — where the room's own refusals, gates and questions
   still apply, one at a time.

   THE SHAPE IS DOCUMENTED FOR AUTHORS in design/proposals/
   intent-handoff-addendum.md. Keep the two in step by hand.
   ============================================================================= */

export const INTENT_COLLECTION = "intents";

export type IntentRoom = "facility" | "relationship";

/** The routes the two rooms bind. The first three are the facility room's
 *  engines; the last six are the relationship room's, five reviews and the
 *  intake that authors. */
export type IntentRoute =
  | "modify"
  | "renew"
  | "create"
  | "annual"
  | "covenant"
  | "valuation"
  | "rating"
  | "service"
  | "intake";

export type IntentStatus = "pending" | "opened" | "done";

export interface IntentSource {
  kind: "email" | "chat" | "meeting";
  id?: string;
  subject?: string;
  from?: string;
  received?: string;
}

export interface IntentContext {
  summary: string;
  source: IntentSource;
}

export interface IntentDoc {
  /** The document id the writer chose. ULID-ish, and treated as opaque. */
  id: string;
  accountId: string;
  accountName: string;
  room: IntentRoom;
  route: IntentRoute;
  /** Banker-language instructions in the room's own grammar, one per change. */
  lines: string[];
  context: IntentContext;
  createdAt: string;
  status: IntentStatus;
  openedAt?: string;
  openedBy?: string;
}

const FACILITY_ROUTES: IntentRoute[] = ["modify", "renew", "create"];
const RELATIONSHIP_ROUTES: IntentRoute[] = ["annual", "covenant", "valuation", "rating", "service", "intake"];
const SOURCE_KINDS = ["email", "chat", "meeting"];

/** Caps. A document that arrives longer than this is clipped, never refused:
 *  a writer being verbose is not a reason to drop a banker's instruction. */
export const MAX_LINES = 12;
export const MAX_LINE_CHARS = 400;
export const MAX_SUMMARY_CHARS = 600;
export const MAX_FIELD_CHARS = 200;

const text = (v: unknown, cap: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const line = v.replace(/\s+/g, " ").trim();
  if (!line) return undefined;
  return line.length <= cap ? line : `${line.slice(0, cap).trim()}...`;
};

/** A Salesforce account id: the Account key prefix and nothing but
 *  alphanumerics after it, 15 to 18 characters. Anything else names no
 *  relationship this cockpit can open, and a document carrying one is not an
 *  intent — better a silent refusal than a room opened on a guess. */
const ACCOUNT_ID = /^001[A-Za-z0-9]{12,15}$/;

/**
 * Read one store document as an intent, or refuse it.
 *
 * EVERY REFUSAL IS SILENT AND TOTAL. A malformed document is not half-read and
 * it is not reported to the banker: it simply is not an intent, and the cockpit
 * behaves as if the collection were empty.
 */
export function readIntentDoc(id: string, raw: unknown): IntentDoc | null {
  if (typeof id !== "string" || !id.trim()) return null;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;

  const accountId = typeof d.accountId === "string" ? d.accountId.trim() : "";
  if (!ACCOUNT_ID.test(accountId)) return null;

  const room = d.room === "facility" || d.room === "relationship" ? d.room : null;
  if (!room) return null;

  const route = typeof d.route === "string" ? (d.route as IntentRoute) : null;
  if (!route) return null;
  const allowed = room === "facility" ? FACILITY_ROUTES : RELATIONSHIP_ROUTES;
  if (!allowed.includes(route)) return null;

  const accountName = text(d.accountName, MAX_FIELD_CHARS);
  if (!accountName) return null;

  const lines = Array.isArray(d.lines)
    ? d.lines.map((l) => text(l, MAX_LINE_CHARS)).filter((l): l is string => !!l).slice(0, MAX_LINES)
    : [];
  if (!lines.length) return null;

  const ctx = (typeof d.context === "object" && d.context !== null ? d.context : {}) as Record<string, unknown>;
  const summary = text(ctx.summary, MAX_SUMMARY_CHARS) ?? "";
  const rawSource = (typeof ctx.source === "object" && ctx.source !== null ? ctx.source : {}) as Record<string, unknown>;
  const kind = typeof rawSource.kind === "string" && SOURCE_KINDS.includes(rawSource.kind)
    ? (rawSource.kind as IntentSource["kind"])
    : "chat";

  const source: IntentSource = { kind };
  const sid = text(rawSource.id, MAX_FIELD_CHARS);
  const subject = text(rawSource.subject, MAX_FIELD_CHARS);
  const from = text(rawSource.from, MAX_FIELD_CHARS);
  const received = text(rawSource.received, MAX_FIELD_CHARS);
  if (sid) source.id = sid;
  if (subject) source.subject = subject;
  if (from) source.from = from;
  if (received) source.received = received;

  const status: IntentStatus =
    d.status === "opened" || d.status === "done" || d.status === "pending" ? d.status : "pending";

  const doc: IntentDoc = {
    id,
    accountId,
    accountName,
    room,
    route,
    lines,
    context: { summary, source },
    createdAt: text(d.createdAt, MAX_FIELD_CHARS) ?? "",
    status,
  };
  const openedAt = text(d.openedAt, MAX_FIELD_CHARS);
  const openedBy = text(d.openedBy, MAX_FIELD_CHARS);
  if (openedAt) doc.openedAt = openedAt;
  if (openedBy) doc.openedBy = openedBy;
  return doc;
}

/** The room's own word for a route, for the whisper's one sentence. */
export const ROUTE_WORD: Record<IntentRoute, string> = {
  modify: "modification",
  renew: "renewal",
  create: "new facility",
  annual: "annual review",
  covenant: "covenant review",
  valuation: "collateral valuation",
  rating: "risk-rating review",
  service: "service request",
  intake: "relationship intake",
};

/** Where the intent came from, in the whisper's grammar. */
export function sourcePhrase(source: IntentSource): string {
  const where = source.kind === "email" ? "the mail" : source.kind === "meeting" ? "the meeting" : "the chat";
  return source.received ? `${where} of ${source.received}` : where;
}

/**
 * THE ONE SENTENCE THE WHISPER SAYS.
 *
 * The room's own language, and only what the document actually carries: the
 * relationship, where it came from, the first instruction, and the room being
 * offered. Nothing is inferred and no figure is derived — every word here is
 * the writer's, clipped.
 */
export function whisperLine(intent: IntentDoc): string {
  const short = intent.accountName.split(/\s+/).slice(0, 2).join(" ");
  const gist = intent.context.summary || intent.lines[0];
  return `An intent for ${short} from ${sourcePhrase(intent.context.source)}: ${gist} Open the ${ROUTE_WORD[intent.route]}?`;
}
