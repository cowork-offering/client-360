/* =============================================================================
   THE PARSER STAGES, THE MODEL SPEAKS.

   FOUNDER, AFTER DRIVING THE PLAN-FIXES BUILD: "it does not read the room or the
   relationship, it does not know the relationship inside out, it feels VERY
   scripted, it does not think, it pops up with answers."

   He is right, and the ladder is the reason: rungs 0 and 1 answer with NO model,
   and the deterministic layer composes the SENTENCE as well as the card.
   Instant, and canned.

   SO THE CARD STAYS DETERMINISTIC AND THE SENTENCE BECOMES THE MODEL'S. The room
   stages exactly as it does today, at exactly today's speed, and then hands the
   session a NARRATE envelope: the line, what the room just did, the reads, the
   plan, and the doctrine slices this surface needs. The reply streams in under
   the card a second or two later, with the whole book in view.

   THE REPLY IS PROSE. It is not a shape, it cannot stage, amend or un-stage
   anything, and it never reaches a tool. The validator has nothing to refuse and
   the write fence is untouched. A degrade leaves the deterministic sentence
   exactly where it was: nothing is ever worse than today.

   NOT CHROME. A bare confirm, a "one decision at a time", a two-word
   acknowledgement: a colleague does not comment on those, so neither does this.
   ============================================================================= */

import type { BrainEnvelope } from "./brainLane";
import { composeDoctrine } from "./doctrine";

/* ------------------------------------------------------------ the subject */

/** What the room just did, as the model is told about it. */
export type NarrateAct = "staged" | "refused" | "answered" | "greeting" | "mail" | "filed";

export interface NarrateSubject {
  act: NarrateAct;
  /** The deterministic sentence already on the glass. The model is writing
   *  BESIDE it, never instead of it, so it must know what was said. */
  sentence: string;
  /** The card the room staged, refused over or answered with, digested to what
   *  a remark could be about. Absent where the act carried no card. */
  card?: { title: string; rows: Array<{ label: string; value: string; sub?: string }> };
  /**
   * A ROUTINE CONFIRM (founder drive, 2026-09-02: "a lot of chat coming through,
   * like two chats simultaneously").
   *
   * A plain scalar term change with no advisory on it says the whole of what
   * there is to say on the chip itself: the field, the facility, before and
   * after. A colleague does not comment on one, so neither does the model, and
   * the room's own sentence is then the only voice under the card.
   */
  routine?: boolean;
}

/* ------------------------------------------------------------- the fence

   NARRATION IS FOR WHAT A COLLEAGUE WOULD COMMENT ON. Everything below is a
   sentence that is already exact, already short, and already the whole of what
   there is to say. Consulting the model on one would spend a round trip to
   restate a confirm.                                                        */

const CHROME: RegExp[] = [
  /one at a time\b/i,
  /^that is \d+ changes/i,
  /^confirm/i,
  /^discarded\b/i,
  /^nothing (is )?staged/i,
  /^done\b/i,
  /^(ok|okay|right)\b[.,]?$/i,
];

/** The floor under which a sentence with no card is chrome by length alone. */
const CHROME_CHARS = 40;

/** SHOULD THE MODEL BE CONSULTED AT ALL. Deterministic, so the suite can assert
 *  what gets a remark and what does not. */
export function shouldNarrate(subject: NarrateSubject): boolean {
  const sentence = subject.sentence.trim();
  if (!sentence) return false;
  /* ONE VOICE PER MOMENT. A routine confirm is chrome of the same kind: the
     chip already carries the field, the facility and the two figures, and a
     remark under it is the room saying the same thing twice. */
  if (subject.routine) return false;
  /* ============ A QUESTION ON STAGE MEANS THE MODEL IS SILENT (founder, 2026-09-03)

     Clicking a facility chip put the engine's focus prompt AND a model remark
     narrating the whole plan on the glass in the same frame. The founder read
     it as two chats.

     THE RULE IS GENERAL, not a patch on the focus prompt: the model never
     speaks at the same moment as a deterministic prompt that ASKS SOMETHING.
     A question is an invitation to the banker, and a paragraph underneath it is
     the room answering itself before they have had a turn. The model speaks
     under cards, reads, refusals and the greeting - all of which are statements
     - and nowhere else.

     A CARD IS NOT A QUESTION. `subject.card` is present exactly where the room
     has put a fact on the glass, and the card's own follow-up ("shall I stage
     it?") is a tail on a statement rather than the moment itself. */
  if (!subject.card && /\?\s*$/.test(sentence)) return false;
  if (CHROME.some((rx) => rx.test(sentence))) return false;
  if (!subject.card && sentence.length < CHROME_CHARS) return false;
  return true;
}

/* -------------------------------------------------------------- the prompt */

/** How the remark is written. The founder's addendum, as instruction: light
 *  structure is allowed, a memo is not, and raw markdown never reaches glass. */
const HOW_TO_WRITE = [
  "HOW TO WRITE IT.",
  "THREE PARTS, IN THIS ORDER. A lead line of at most eighteen words. Then nothing, or up to three line items. Then nothing, or one closing line.",
  "TWO SENTENCES OF PROSE IN ALL, the lead line and the closing line, and nothing beyond them. The line items are not sentences and are not counted. A third sentence is cut on the glass, so write two.",
  "A LINE ITEM IS ONE HYPHEN BULLET THAT OPENS ON A NAME, like this: - **Line of Credit ($15.0MM)**: one sentence about it.",
  "COPY THE NAME EXACTLY AS CONTEXT PRINTS IT: a label from CONTEXT.facilities, a name from CONTEXT.reads.covenants, a party from CONTEXT.reads.involvements, an asset from CONTEXT.reads.collateral, or a title from CONTEXT.staged. A name you cannot copy verbatim reads as a plain bullet, so guessing costs you the row.",
  "THE ROOM PRINTS THAT ENTITY'S OWN FIGURES BESIDE YOUR LINE ITEM. Do not restate them in your words. Bold a figure only where it is one the row cannot carry, written **like this**.",
  "Nothing else is bold. No headings, no tables, no links, no code.",
  "Do not mix line items and plain bullets in one run. Write all of one, then all of the other.",
  "EVERY FIGURE YOU WRITE MUST ALREADY BE ON THE CARD OR IN CONTEXT.reads. Copy it, digit for digit, with its own unit.",
  "NEVER DERIVE A FIGURE. No lendable value from an advance rate, no headroom from a threshold, no percentage the card does not carry, no total you added up yourself. The arithmetic is the bank's.",
  "If you are unsure of a number, name the CARD's figure instead of writing one of your own. A remark with the card's figure in it is always right; a remark with a figure nobody read is wrong even when it happens to be close.",
  "No em dashes. Never repeat the sentence the room already said; add what it could not.",
  "Name what your remark is based on. If there is nothing worth saying, write the lead line and stop.",
  "IF IT RUNS LONG, CUT IN THIS ORDER. The third line item first. Then the closing line, whenever the chips on the glass or the card's own follow-up already carry the ask. Then a line item's trailing clause. Never the lead line, and never a figure.",
];

/**
 * WHAT THE REMARK IS ALLOWED TO WEIGH, per act.
 *
 * Keyed like {@link ACT_LINE} and printed under it, so the model sees the budget
 * for the act it is writing and no other. A greeting is the banker's first look
 * at the whole book and earns three line items; a refusal has already been made
 * by name on the card and earns one.
 */
const ACT_BUDGET: Record<NarrateAct, string> = {
  greeting:
    "ABOUT NINETY WORDS in all. Three line items is the default here, not the exception: this is the banker's first look at the whole book.",
  answered:
    "ABOUT SEVENTY-FIVE WORDS in all: a lead line, the line items, and at most one closing line. No paragraphs.",
  staged:
    "ABOUT THIRTY-FIVE WORDS in all, and two short sentences at most. The card beside you already carries the field, the facility and both figures: say only what it does NOT show. Never restate a figure, an entry, or the plan.",
  refused: "ONE SENTENCE, about twenty-five words. The card already carries the reason by name. Then stop.",
  mail: "ABOUT FIFTY-FIVE WORDS in all. One line item at most. Say what the message asks and offer the move.",
  filed: "ABOUT FORTY-FIVE WORDS in all. The dossier already lists what landed. One line item at most, then stop.",
};

/**
 * WHERE THE ROUTE STANDS, in one line the doctrine cannot take away.
 *
 * The room stands on a PROVISIONAL engine while the route question is open, so
 * an envelope that simply printed its mode would tell the model this is a
 * modification before the banker has said any such thing. That is the leak the
 * founder read in the greeting ("which facility or facilities move"). The line
 * travels on every narrate prompt, under the budget, and is undroppable by
 * construction because it is not a doctrine block.
 */
const routeLine = (envelope: BrainEnvelope): string =>
  envelope.routeOpen
    ? `THE ROUTE IS NOT BOUND YET. The banker has not chosen between: ${(envelope.routeOptions ?? []).join(", ")}.`
    : `THE ROUTE IS BOUND: this is a ${envelope.route}. Write in that route's terms and in no other's.`;

const cardDigest = (subject: NarrateSubject): string[] => {
  if (!subject.card) return [];
  const rows = subject.card.rows
    .slice(0, 12)
    .map((r) => `  ${r.label}: ${r.value}${r.sub ? ` (${r.sub})` : ""}`);
  return [`THE CARD ON THE GLASS: ${subject.card.title}`, ...rows];
};

const ACT_LINE: Record<NarrateAct, string> = {
  staged: "The room STAGED a change. It is on the plan and waiting for the banker's confirm.",
  refused: "The room REFUSED something, by name, and named the route that does exist.",
  answered: "The room ANSWERED a read from the book it is already holding.",
  greeting: "The room has just OPENED on this relationship and greeted the banker.",
  mail: "The client's message arrived AFTER the room greeted the banker. Say what it asks and offer the move, in one short remark.",
  /* THE SECOND ROOM'S OWN ACT. A relationship review is FILED, not staged: the
     token is spent, the org has written, and the dossier is the org's own
     account of it. Calling that "staged and waiting for the confirm" would tell
     a banker the write had not happened. The facility room emits no `filed`
     item, so its remarks are unchanged by construction. */
  filed: "The room FILED a governance record and the org accepted it. The dossier beside you is the org's own account of what landed. Say what follows, never what was written.",
};

/**
 * THE NARRATE ENVELOPE.
 *
 * Everything the model needs to say the one thing the card cannot: the line, the
 * act, the sentence already said, the card, the doctrine for this surface, and
 * the whole book underneath. It is the reply prompt's twin, minus the shape
 * contract and the wire schema, because a narration may never emit either.
 */
export function composeNarratePrompt(envelope: BrainEnvelope, subject: NarrateSubject): string {
  /* THE TWO SLICES THE LINE CANNOT ASK FOR. A greeting's line is EMPTY, so a
     mail block or a route-open block gated on a word would never travel on the
     one call that carries consent. The envelope knows; the line does not. */
  /* AND THE ROUTE-OPEN ARM IS PER ROOM. `route-open` names the facility room's
     three routes by name; the relationship room has five and none of them is a
     modification. Selecting the wrong arm would tell the model to choose
     between routes this room does not offer. */
  const include = [
    envelope.mail ? "mail" : null,
    envelope.routeOpen ? (envelope.room === "relationship" ? "route-open-relationship" : "route-open") : null,
  ].filter((id): id is string => id !== null);
  const doctrine = composeDoctrine(envelope.line || subject.sentence, {
    mode: "narrate",
    room: envelope.room,
    include,
  });
  return [
    "You are the credit brain of a relationship workroom, writing ONE short remark under a card.",
    "The workroom-brain pack (WORKROOM-BRAIN.md) is the authority. The slices you need are below.",
    "",
    "THE ROOM HAS ALREADY ACTED. The card is a FACT, filed by the deterministic engines a moment ago.",
    "You are writing the sentence beside it: what you noticed, what it means, what follows.",
    "You cannot stage, amend or un-stage anything. Nothing you write reaches a tool or the org.",
    "Reply with PROSE only. Never JSON, never a shape, never a form.",
    "",
    `THE BANKER SAID: ${envelope.line || "(the room opened)"}`,
    ACT_LINE[subject.act],
    ACT_BUDGET[subject.act],
    routeLine(envelope),
    `THE ROOM SAID: ${subject.sentence}`,
    ...cardDigest(subject),
    "",
    ...HOW_TO_WRITE,
    "",
    "GROUNDING FACTS. CONTEXT.reads carries what this room has already read, formatted as the glass",
    "prints it. Speak from those figures. CONTEXT.reads.notCarried names what no read on this cockpit",
    "holds and CONTEXT.staged is the plan so far. Refuse what is not carried BY NAME.",
    "",
    ...doctrine.lines,
    "",
    "CONTEXT:",
    JSON.stringify(envelope),
  ].join("\n");
}

/* -------------------------------------------------- the tiny markdown subset

   NEVER RAW MARKDOWN ON THE GLASS. The model is asked for plain sentences with
   at most three bullets and bold on figures, and it is a model: it will
   occasionally reach for a heading, a table or a link anyway. So the page parses
   the subset it asked for into the room's OWN elements and STRIPS the rest,
   rather than printing asterisks at a credit officer.                        */

export interface NarrationSpan {
  text: string;
  bold?: true;
}

/**
 * A LINE ITEM: an entity named, a sentence about it, and the BOOK'S OWN FIGURE
 * beside it.
 *
 * The founder's ask, in one shape: "showing XYZ covenant as a line item with
 * text around it". The model writes the name and the clause; the ROOM writes
 * `value`, resolved out of the envelope by {@link resolveEntities}. They cannot
 * disagree about a number because they are not the same source.
 *
 * NO `value` IS NOT AN ERROR. An entity the envelope does not carry keeps its
 * label, its colon and its sentence, and reads on the glass as a bullet whose
 * first words happen to be bold.
 */
export interface NarrationRow {
  /** The bold head, already span-parsed. Rendered inside one `<b>`. */
  label: NarrationSpan[];
  /** The clause after the colon. */
  spans: NarrationSpan[];
  /** The BOOK'S figure, resolved from the envelope. Absent = unresolved. */
  value?: string;
  tone?: "warn" | "bad";
}

export type NarrationBlock =
  | { kind: "line"; spans: NarrationSpan[] }
  | { kind: "bullets"; items: NarrationSpan[][] }
  | { kind: "entity"; rows: NarrationRow[] }
  /** THE QUIET MARK. Not the model's, and never parsed out of its text: the
   *  room's own note that a figure in the remark above is on no read it holds.
   *  See {@link guardFigures}. */
  | { kind: "mark"; text: string };

/** A remark is a remark. Four blocks and three bullets is already generous for
 *  something a colleague says while pointing at a card. */
export const NARRATION_MAX_BLOCKS = 4;
export const NARRATION_MAX_BULLETS = 3;
/**
 * TWO SENTENCES PLUS ROWS (founder drive, 2026-09-02).
 *
 * The prose in a remark is capped at two sentences in all, across every plain
 * line the remark carries. The rows are not prose and are not counted: they are
 * the entity list the founder asked for and they carry the room's own figures.
 * A remark that runs past this is cut at the sentence, not mid-clause.
 */
export const NARRATION_MAX_SENTENCES = 2;
/**
 * THE GREETING IS THE ONE ACT THAT EARNS A THIRD.
 *
 * Its shape is the greeting-v2 addendum's own: a lead line, the rows, and a
 * close that may have to say what the client's message asks BEFORE it hands the
 * three routes back. Variant (e) is exactly that and it is signed-off copy, so
 * the cap that quiets a card's remark does not cut the room's opening.
 */
export const GREETING_MAX_SENTENCES = 3;

/* ============================================== THE WORD BUDGET (founder, 2026-09-03)

   "Even a single bubble is too much text to read." The sentence cap held the
   PROSE to two sentences and said nothing at all about how long a sentence, or
   how many rows hang under it. A two-sentence remark with three rows and a
   trailing clause on each of them is still a paragraph.

   SO THE BUDGET IS WORDS, PER ACT, AND IT IS ENFORCED TWICE: it is printed in
   the prompt under {@link ACT_LINE}, and it is CLIPPED on the finished remark by
   {@link clipBudget}. The prompt is how the model is asked; the clip is how the
   glass is guaranteed. A model that ignores the ask costs the banker nothing.

   THE CUT IS ALWAYS AT A WHOLE UNIT: a sentence, a bullet, a row. Nothing on
   this glass is ever truncated mid-clause. */
export const ACT_WORDS: Record<NarrateAct, number> = {
  /* The banker's first look at the whole book: a lead, three rows, one ask. */
  greeting: 90,
  /* A read answer: the lead line, the entity rows, one close. */
  answered: 75,
  /* THE CARD ALREADY SAYS THE CHANGE. Two short sentences of consequence. */
  staged: 35,
  /* The card already carries the reason by name. One sentence. */
  refused: 25,
  mail: 55,
  filed: 45,
};

/** The words in a run of spans. Whitespace-only spans are separators. */
const wordsIn = (spans: NarrationSpan[]): number =>
  spans
    .map((s) => s.text)
    .join("")
    .split(/\s+/)
    .filter(Boolean).length;

const blockWords = (block: NarrationBlock): number => {
  if (block.kind === "line") return wordsIn(block.spans);
  if (block.kind === "bullets") return block.items.reduce((n, item) => n + wordsIn(item), 0);
  if (block.kind === "entity") return block.rows.reduce((n, r) => n + wordsIn(r.label) + wordsIn(r.spans), 0);
  return 0;
};

/**
 * THE REMARK, HELD TO ITS ACT'S WORD BUDGET.
 *
 * Blocks are spent in order, so the lead line is never the thing that goes. A
 * line that would overrun keeps the sentences that fit; a bullet list or an
 * entity list keeps the rows that fit. The room's own mark (`kind: "mark"`)
 * costs nothing: it is not the model's words.
 */
export function clipBudget(blocks: NarrationBlock[], budget: number): NarrationBlock[] {
  let left = budget;
  const out: NarrationBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "mark") {
      out.push(block);
      continue;
    }
    if (left <= 0) continue;
    const cost = blockWords(block);
    if (cost <= left) {
      left -= cost;
      out.push(block);
      continue;
    }
    if (block.kind === "line") {
      const kept: NarrationSpan[][] = [];
      for (const sentence of sentencesOf(block.spans)) {
        const n = wordsIn(sentence);
        if (n > left) break;
        kept.push(sentence);
        left -= n;
      }
      if (!kept.length) {
        left = 0;
        continue;
      }
      const spans: NarrationSpan[] = [];
      kept.forEach((sentence, i) => {
        if (i) spans.push({ text: " " });
        spans.push(...sentence);
      });
      out.push({ kind: "line", spans });
      continue;
    }
    if (block.kind === "bullets") {
      const items: NarrationSpan[][] = [];
      for (const item of block.items) {
        const n = wordsIn(item);
        if (n > left) break;
        items.push(item);
        left -= n;
      }
      if (items.length) out.push({ kind: "bullets", items });
      continue;
    }
    const rows: NarrationRow[] = [];
    for (const row of block.rows) {
      const n = wordsIn(row.label) + wordsIn(row.spans);
      if (n > left) break;
      rows.push(row);
      left -= n;
    }
    if (rows.length) out.push({ kind: "entity", rows });
  }
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
/**
 * A BULLET THAT OPENS ON A NAME. `- **Line of Credit ($15.0MM)**: it moves.`
 *
 * CANDIDACY IS STRICT AND DELIBERATELY SO. Only a bullet whose FIRST span is
 * bold AND is immediately followed by a colon is a line item. Bold anywhere
 * else in a bullet is a FIGURE and stays prose bold, which is what keeps the
 * old grammar exactly as it was.
 *
 * STREAM-SAFE BY CONSTRUCTION: "- **Debt Serv" has no closing marker and
 * "- **Debt Service Coverage**" has no colon yet, so both read as plain bullets
 * until the whole head has arrived. The only mid-stream event is the value
 * column appearing; nothing reflows twice.
 */
const LEAD_LABEL = /^(\*\*|__)([^\n]+?)\1\s*:\s+(.+)$/;
/** A head shorter than this is punctuation; longer than this is a sentence. */
const LABEL_MIN = 2;
const LABEL_MAX = 72;
/** The clause beside a name. Longer than this and the row is a paragraph. */
const CLAUSE_MAX = 120;
/** The figure in the rail. Longer than this and it is not a figure. */
const VALUE_MAX = 24;
const FENCE = /^\s*```/;
const DROP = [
  /^\s*#{1,6}\s/, // a heading
  /^\s*\|/, // a table row
  /^\s*>/, // a block quote
  /^\s*[-=]{3,}\s*$/, // a rule, or a table's underline
];

/** `**bold**` and `__bold__` become spans; every other markdown character is
 *  stripped, so nothing decorative survives as punctuation. */
function spansOf(text: string): NarrationSpan[] {
  const clean = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // an image, gone entirely
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // a link keeps its words
    .replace(/`+/g, "")
    .replace(/[—–]/g, ", ") // an em dash the model slipped in
    .trim();

  const out: NarrationSpan[] = [];
  const rx = /(\*\*|__)(.+?)\1/g;
  let last = 0;
  for (let m = rx.exec(clean); m !== null; m = rx.exec(clean)) {
    if (m.index > last) push(out, clean.slice(last, m.index));
    push(out, m[2], true);
    last = m.index + m[0].length;
  }
  if (last < clean.length) push(out, clean.slice(last));
  return out;
}

function push(out: NarrationSpan[], raw: string, bold?: true): void {
  const text = raw.replace(/[*_#]/g, "");
  if (!text.trim() && !out.length) return;
  if (!text) return;
  out.push(bold ? { text, bold } : { text });
}

/**
 * THE REMARK, PARSED INTO THE ROOM'S OWN ELEMENTS.
 *
 * Streams safely: it is called on every partial text, so a half-written `**`
 * simply reads as text until its pair arrives.
 */
export function parseNarration(raw: string, sentences: number = NARRATION_MAX_SENTENCES): NarrationBlock[] {
  const blocks: NarrationBlock[] = [];
  let bullets: NarrationSpan[][] | null = null;
  /** The line-item run, beside the bullet run. Both close on the same events,
   *  and each closes when the OTHER starts: a mixed run splits into two blocks
   *  rather than pretending a bullet is a row. */
  let rows: NarrationRow[] | null = null;
  // A fence takes its CONTENTS with it. Dropping the ``` lines alone would leave
  // the code on the glass, which is the one thing a fence guarantees is not prose.
  let fenced = false;

  const closeBullets = () => {
    if (bullets?.length) blocks.push({ kind: "bullets", items: bullets.slice(0, NARRATION_MAX_BULLETS) });
    bullets = null;
  };
  const closeRows = () => {
    if (rows?.length) blocks.push({ kind: "entity", rows: rows.slice(0, NARRATION_MAX_BULLETS) });
    rows = null;
  };
  const closeRuns = () => {
    closeBullets();
    closeRows();
  };

  for (const line of (raw ?? "").split(/\r?\n/)) {
    if (blocks.length >= NARRATION_MAX_BLOCKS) break;
    if (FENCE.test(line)) {
      fenced = !fenced;
      closeRuns();
      continue;
    }
    if (fenced) continue;
    if (!line.trim()) {
      closeRuns();
      continue;
    }
    if (DROP.some((rx) => rx.test(line))) continue;

    const bullet = BULLET.exec(line);
    if (bullet) {
      const row = rowOf(bullet[1]);
      if (row) {
        closeBullets();
        (rows ??= []).push(row);
      } else {
        closeRows();
        const spans = spansOf(bullet[1]);
        if (spans.length) (bullets ??= []).push(spans);
      }
      continue;
    }
    closeRuns();
    if (blocks.length >= NARRATION_MAX_BLOCKS) break;
    const spans = spansOf(line);
    if (spans.length) blocks.push({ kind: "line", spans });
  }
  closeRuns();
  return capSentences(blocks.slice(0, NARRATION_MAX_BLOCKS), sentences);
}

/** One span run, split into the sentences it carries, with the bold flags kept
 *  where they fall. A span that ends mid-sentence keeps the sentence open, so a
 *  bolded figure inside a sentence never splits it. */
export function sentencesOf(spans: NarrationSpan[]): NarrationSpan[][] {
  const out: NarrationSpan[][] = [];
  let current: NarrationSpan[] = [];
  for (const span of spans) {
    const parts = span.text.split(/(?<=[.!?])\s+/);
    parts.forEach((part, i) => {
      if (part) current.push(span.bold ? { text: part, bold: true } : { text: part });
      if (i < parts.length - 1 && current.length) {
        out.push(current);
        current = [];
      }
    });
  }
  if (current.length) out.push(current);
  return out;
}

/** THE PROSE, HELD TO {@link NARRATION_MAX_SENTENCES}. Rows and bullets are the
 *  remark's structure rather than its prose and pass through untouched. */
function capSentences(blocks: NarrationBlock[], max: number): NarrationBlock[] {
  let left = max;
  const out: NarrationBlock[] = [];
  for (const block of blocks) {
    if (block.kind !== "line") {
      out.push(block);
      continue;
    }
    if (left <= 0) continue;
    const sentences = sentencesOf(block.spans);
    if (sentences.length <= left) {
      left -= sentences.length;
      out.push(block);
      continue;
    }
    /* THE SEPARATOR IS PUT BACK. `sentencesOf` splits ON the whitespace, so a
       naive flatten would run two sentences into one word. */
    const spans: NarrationSpan[] = [];
    sentences.slice(0, left).forEach((sentence, i) => {
      if (i) spans.push({ text: " " });
      spans.push(...sentence);
    });
    out.push({ kind: "line", spans });
    left = 0;
  }
  return out;
}

/** A bullet read as a line item, or null where it is an ordinary bullet. */
function rowOf(text: string): NarrationRow | null {
  const lead = LEAD_LABEL.exec(text.trim());
  if (!lead) return null;
  const label = lead[2].trim();
  if (label.length < LABEL_MIN || label.length > LABEL_MAX) return null;
  const clause = clipWords(lead[3].trim(), CLAUSE_MAX);
  if (!clause) return null;
  const head = spansOf(label);
  const spans = spansOf(clause);
  if (!head.length || !spans.length) return null;
  return { label: head, spans };
}

/** Clipped on a word boundary, so a long clause ends on a word. The cut point
 *  is computed from the first {@link CLAUSE_MAX} characters and therefore does
 *  not move as the rest of the clause streams in. */
function clipWords(text: string, cap: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= cap) return line;
  const cut = line.slice(0, cap);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > cap / 2 ? cut.slice(0, lastSpace) : cut).trim()}...`;
}

/* --------------------------------------------------- the book, beside the row

   THE VALUE COMES FROM THE ENVELOPE, NEVER FROM THE MODEL'S TEXT. The model
   writes the name and the clause; the room writes the number. They cannot
   disagree about a figure because they are not the same source, which is the
   whole reason a line item is safer than a bolded figure in prose.            */

/** One resolvable entity, as the lookup holds it. */
interface Resolved {
  value: string;
  tone?: "warn" | "bad";
}

/**
 * A NAME, REDUCED TO ITS WORDS.
 *
 * Token multiset equality, so `facilityLabel`'s "$15.0MM Line of Credit" and the
 * model's "Line of Credit ($15.0MM)" are the same facility. That is not a
 * nicety: it is the founder's own example, and without it the shared-key form
 * the room prints would never match the form a banker writes.
 */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

const spanText = (spans: NarrationSpan[]): string => spans.map((s) => s.text).join("").trim();

/** One lookup, built once per envelope. FIRST WRITER WINS per key, in rank
 *  order, so a staged title beats the covenant of the same name. */
class EntityBook {
  private exact = new Map<string, Resolved>();
  private loose = new Map<string, Resolved>();
  /**
   * A NORMALISED KEY TWO ENTRIES IN ONE TABLE BOTH PRODUCE IS NEVER GUESSED AT.
   *
   * This package carries TWO Lines of Credit. Printing one facility's
   * commitment beside the other's name is the failure that staged a reduction
   * on the wrong line in the 2026-09-01 evening drive. An ambiguous key
   * resolves to nothing, for good; it must never be weakened into a fuzzy
   * match.
   */
  private ambiguous = new Set<string>();

  /** One rank of the lookup. Ambiguity is judged WITHIN the table. */
  add(entries: Array<{ name: string | undefined; value: string | undefined; tone?: "warn" | "bad" }>): void {
    const seen = new Map<string, number>();
    for (const e of entries) {
      const name = (e.name ?? "").trim();
      if (!name) continue;
      const key = norm(name);
      if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) if (count > 1) this.ambiguous.add(key);

    for (const e of entries) {
      const name = (e.name ?? "").trim();
      const value = (e.value ?? "").trim().slice(0, VALUE_MAX).trim();
      if (!name || !value) continue;
      const hit: Resolved = e.tone ? { value, tone: e.tone } : { value };
      if (!this.exact.has(name)) this.exact.set(name, hit);
      const key = norm(name);
      if (key && !this.ambiguous.has(key) && !this.loose.has(key)) this.loose.set(key, hit);
    }
  }

  find(label: string): Resolved | undefined {
    const name = label.trim();
    if (!name) return undefined;
    const exact = this.exact.get(name);
    if (exact) return exact;
    const key = norm(name);
    if (!key || this.ambiguous.has(key)) return undefined;
    return this.loose.get(key);
  }
}

/** breach is loud, watch is quiet, and a clean test takes no colour at all. */
const toneOf = (severity: string | undefined): "warn" | "bad" | undefined =>
  severity === "breach" ? "bad" : severity === "watch" ? "warn" : undefined;

/**
 * THE ROWS, WITH THE BOOK'S FIGURES BESIDE THEM.
 *
 * Pure, and called from the hook rather than the component, so the renderer
 * stays a renderer and the parser stays envelope-free.
 *
 * PRICING IS NOT A SOURCE. `pricing[].facility` is produced by the same
 * `nameOf()` that produces `facilities[].label`, so every pricing key is already
 * shadowed at the facility rank. Including it would be dead code whose only
 * effect, if the ranks were ever reordered, is a RATE printed beside a
 * COMMITMENT. A rate stays prose bold.
 */
export function resolveEntities(blocks: NarrationBlock[], envelope: BrainEnvelope): NarrationBlock[] {
  if (!blocks.some((b) => b.kind === "entity")) return blocks;
  const book = new EntityBook();

  book.add(envelope.staged.map((s) => ({ name: s.title, value: s.after })));
  book.add(
    (envelope.reads?.covenants ?? []).map((c) => ({
      name: c.name,
      value: [c.measured, c.threshold].filter(Boolean).join(" vs "),
      tone: toneOf(c.severity),
    })),
  );
  book.add(
    [...(envelope.selectedFacility ? [envelope.selectedFacility] : []), ...envelope.facilities].map((f) => ({
      name: f.label,
      value: f.commitment,
    })),
  );
  book.add((envelope.reads?.involvements ?? []).map((i) => ({ name: i.name, value: i.role })));
  book.add((envelope.reads?.collateral ?? []).map((c) => ({ name: c.asset, value: c.lendable ?? c.pledged })));
  /* THE LAST RANK, and the only one a room fills by hand. The relationship
     room's greeting names the grade on file and the reviews already filed, and
     no read block carries either. Every rank above already had first refusal on
     the name, so this can only fill what nothing else claimed. */
  book.add(envelope.entities ?? []);

  return blocks.map((block) => {
    if (block.kind !== "entity") return block;
    return {
      kind: "entity",
      rows: block.rows.map((row) => {
        const hit = book.find(spanText(row.label));
        if (!hit) return { label: row.label, spans: row.spans };
        return hit.tone
          ? { label: row.label, spans: row.spans, value: hit.value, tone: hit.tone }
          : { label: row.label, spans: row.spans, value: hit.value };
      }),
    };
  });
}

/* ================================= THE FIGURE GUARD (founder drive 2026-09-02)

   THE CARD SAID CRE-AR-01 IS 75 PERCENT APPROVED AGAINST A 65 PERCENT
   GUIDELINE. The remark under it said "80 percent advance, above the bank's 70
   percent construction guideline" and then computed "$5.2MM lendable value".
   Four figures, none of them on the card, one of them arithmetic the model did
   itself. A banker reading that reads the bank's own record.

   THE PROMPT SAYS SO NOW, and the prompt is a request. This is the check.

   WHAT IS GROUNDED. A figure that appears in the CARD's own rows, or anywhere
   in the envelope the model was handed: the reads, the facilities, the staged
   plan, the banker's own line, the sentence the room already said. That is the
   whole of what the model was given, so a figure outside it came from nowhere a
   reader could follow.

   WHAT HAPPENS TO AN UNGROUNDED ONE. It is rendered WITHOUT EMPHASIS and the
   remark carries a quiet mark naming it. It is NOT dropped, and that is a
   deliberate call: cutting a clause out of a sentence the model wrote leaves
   prose that reads as though the room agreed with the rest of it, and a banker
   who can see the figure and the mark beside it can check the card. Silence
   would be the room editing the model's account of itself.

   COMPARISON IS BY VALUE AND UNIT, not by string. "80 percent" and "80%" are
   the same figure; "$5.2MM" and "$5,200,000" are the same figure. Getting that
   wrong in the strict direction would mark the card's own numbers.           */

/** What a figure IS, for this purpose. Three kinds, because they are the three
 *  a credit remark carries and they do not compare across kinds: a 1.25x and a
 *  125% are not the same thing said twice. */
type FigureKind = "pct" | "money" | "multiple";

const MAGNITUDE_WORDS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

/** A percentage, a multiple, then money. Ordered so "1.25x" is never read as a
 *  bare 1.25 and "$5.2MM" is never read as 5.2. */
const FIGURE_PATTERNS: Array<{ kind: FigureKind; re: RegExp }> = [
  { kind: "pct", re: /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b|percent\b)/gi },
  { kind: "multiple", re: /(\d+(?:\.\d+)?)\s*x\b/gi },
  {
    kind: "money",
    re: /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(mm|m|k|bn|b|million|thousand|billion)?\b|(\d[\d,]*(?:\.\d+)?)\s*(mm|million|bn|billion|thousand)\b/gi,
  },
];

/** One figure, as it is compared. `text` is what the reader saw. */
interface Figure {
  key: string;
  text: string;
}

/** Every figure in a piece of text, keyed by kind and VALUE so two spellings of
 *  one number are one key. */
function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  const seen = new Set<string>();
  for (const { kind, re } of FIGURE_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const digits = m[1] ?? m[3];
      if (digits === undefined) continue;
      const suffix = (m[2] ?? m[4] ?? "").toLowerCase();
      const base = Number(digits.replace(/,/g, ""));
      if (!Number.isFinite(base)) continue;
      const value = kind === "money" ? base * (MAGNITUDE_WORDS[suffix] ?? 1) : base;
      const key = `${kind}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, text: m[0].trim() });
    }
  }
  return out;
}

/** Everything the model was actually given, as one string. The envelope is
 *  serialised whole: the reads, the facilities, the staged plan and the line
 *  are all in it, and a figure outside all of that is a figure from nowhere. */
function groundedText(envelope: BrainEnvelope, subject: NarrateSubject): string {
  const card = subject.card
    ? [subject.card.title, ...subject.card.rows.map((r) => `${r.label} ${r.value} ${r.sub ?? ""}`)].join(" ")
    : "";
  return `${card} ${subject.sentence} ${JSON.stringify(envelope)}`;
}

/** The mark, in the room's own words. */
export const FIGURE_MARK = "figure not on the card";

export interface GuardedNarration {
  blocks: NarrationBlock[];
  /** The figures the remark carried that no read holds, as the reader saw them. */
  ungrounded: string[];
}

/**
 * THE REMARK, WITH EVERY FIGURE HELD AGAINST WHAT THE MODEL WAS GIVEN.
 *
 * Pure, and returns the ungrounded figures beside the blocks so a caller (and
 * the suite) can assert on them rather than reading them back out of the mark.
 */
export function guardFigures(
  blocks: NarrationBlock[],
  envelope: BrainEnvelope,
  subject: NarrateSubject,
): GuardedNarration {
  const grounded = new Set(figuresIn(groundedText(envelope, subject)).map((f) => f.key));
  const loose: string[] = [];

  /* A ROW'S `value` IS THE ROOM'S OWN and is never checked: it was resolved out
     of the envelope by `resolveEntities`, so checking it would be the room
     marking its own figure. Only what the MODEL wrote is held to this. */
  const check = (spans: NarrationSpan[]): NarrationSpan[] =>
    spans.map((span) => {
      const bad = figuresIn(span.text).filter((f) => !grounded.has(f.key));
      if (!bad.length) return span;
      for (const f of bad) if (!loose.includes(f.text)) loose.push(f.text);
      // WITHOUT EMPHASIS. The words stay; the room's endorsement of them does not.
      return { text: span.text };
    });

  const next: NarrationBlock[] = blocks.map((block) => {
    if (block.kind === "line") return { kind: "line", spans: check(block.spans) };
    if (block.kind === "bullets") return { kind: "bullets", items: block.items.map(check) };
    if (block.kind === "entity") {
      return {
        kind: "entity",
        rows: block.rows.map((row) => ({ ...row, label: check(row.label), spans: check(row.spans) })),
      };
    }
    return block;
  });

  if (loose.length) next.push({ kind: "mark", text: `${FIGURE_MARK}: ${loose.join(", ")}` });
  return { blocks: next, ungrounded: loose };
}

/* ================================= THE CLAIM GUARD (founder drive 2026-09-02)

   THE CARD SAID "COMMITMENT AMOUNT $15M -> $1". The remark under it said "the
   banker moved the first payment date forward two months to Oct 1, 2026". The
   date had not moved, nobody had asked for it to move, and no card on the glass
   carried it. A figure guard cannot catch that: every number in the sentence
   was in the envelope. What was invented was the SUBJECT.

   SO THE ROOM HOLDS THE REMARK TO ITS SUBJECT. The narration doctrine now says
   the remark describes the card on the glass and nothing else, and the prompt
   is a request. This is the check.

   A SMALL ALLOWLIST, DELIBERATELY. Only the fields and entity kinds this room
   actually writes are policed, and one of them is policed only where the card,
   the plan, the room's own sentence and the banker's line all fail to mention
   it. Ordinary prose names none of them and passes through untouched, which is
   what keeps this from becoming a censor of sentences it does not understand.

   A NAMED FIELD NOBODY IS TALKING ABOUT IS A CLAIM, AND A CLAIM IS DROPPED.
   Not de-emphasised, as an ungrounded figure is: a figure the reader can hold
   against the card is checkable, and a sentence about a change that never
   happened is not. There is nothing for the banker to check.                */

/**
 * THE FIELDS AND ENTITY KINDS THIS ROOM WRITES, each with the words a banker
 * writes it in, and each with the source that entitles a remark to name it.
 *
 * A `field` is something a CARD moves. Naming one the card does not carry is
 * the claim itself, so its only allowance is the card, the plan, the sentence
 * the room already said and the line the banker typed.
 *
 * An `entity` is something the BOOK carries. A colleague legitimately mentions
 * the covenants or the guarantors while pointing at a commitment change, so
 * these are allowed the reads as well. The distinction is what keeps the guard
 * from censoring the greeting, which is a remark about the whole book.
 */
const CLAIM_TERMS: Array<{ id: string; kind: "field" | "entity"; says: RegExp }> = [
  { id: "first payment date", kind: "field", says: /\bfirst payment date\b/i },
  { id: "amortisation term", kind: "field", says: /\bamorti[sz](?:ation|sed|zed)\s+term\b/i },
  { id: "commitment", kind: "field", says: /\bcommitments?\b/i },
  { id: "maturity", kind: "field", says: /\bmaturity\b/i },
  { id: "interest rate", kind: "field", says: /\b(?:interest\s+rate|repric\w+)\b/i },
  { id: "advance rate", kind: "field", says: /\badvance rate\b/i },
  { id: "risk rating", kind: "field", says: /\brisk (?:rating|grade)\b/i },
  { id: "covenant", kind: "entity", says: /\bcovenants?\b/i },
  { id: "collateral", kind: "entity", says: /\b(?:collateral|pledges?|liens?)\b/i },
  { id: "fee", kind: "entity", says: /\bfees?\b/i },
  { id: "guarantor", kind: "entity", says: /\bguarant(?:or|ors|y|ee)\b/i },
  { id: "borrower", kind: "entity", says: /\bborrowers?\b/i },
  { id: "policy exception", kind: "entity", says: /\bpolicy exceptions?\b/i },
];

/** The terms this remark may name, as ids. */
function allowedTerms(envelope: BrainEnvelope, subject: NarrateSubject): Set<string> {
  const card = subject.card
    ? [subject.card.title, ...subject.card.rows.map((r) => `${r.label} ${r.value} ${r.sub ?? ""}`)].join(" ")
    : "";
  const plan = envelope.staged.map((s) => `${s.title} ${s.target} ${s.after}`).join(" ");
  const onTheGlass = `${card} ${plan} ${subject.sentence} ${envelope.line ?? ""}`;
  const inTheBook = `${onTheGlass} ${JSON.stringify(envelope.reads ?? {})}`;
  return new Set(
    CLAIM_TERMS.filter((t) => t.says.test(t.kind === "field" ? onTheGlass : inTheBook)).map((t) => t.id),
  );
}

/** The term a piece of text claims that it was not allowed to, or "". */
function claimedTerm(text: string, allowed: Set<string>): string {
  const hit = CLAIM_TERMS.find((t) => !allowed.has(t.id) && t.says.test(text));
  return hit ? hit.id : "";
}

/** The mark, in the room's own words. */
export const CLAIM_MARK = "not on the card";

export interface GuardedClaims extends GuardedNarration {
  /** The terms the remark named that the card and the plan do not carry. */
  claimed: string[];
}

/**
 * THE REMARK, HELD TO ITS SUBJECT AND TO ITS FIGURES.
 *
 * Runs {@link guardFigures} first, so a sentence that survives the claim guard
 * still has its ungrounded figures stripped of emphasis and marked. Pure, and
 * returns what it dropped so the suite can assert on it.
 */
/* ================================== THE CARD SAYS IT ONCE (founder, 2026-09-03)

   "No sentence may repeat a figure that is visible on the card or on the
   manifest rail directly above it."

   The card carries the field, the facility, the before and the after, in the
   room's own typography, eight pixels above the remark. A sentence that prints
   one of those figures again is the model reading the card out loud to somebody
   who is looking at it.

   THE FIGURE IS THE TEST, NOT THE WORD. Only a card VALUE (and the `sub` a row
   prints beside it) counts: a row's LABEL is the field's name, and a remark is
   allowed - encouraged - to say which field it is talking about.

   THE ENTITY ROW'S OWN RAIL IS EXEMPT BY CONSTRUCTION. `resolveEntities` writes
   `value` from the envelope, not from the model, so it is the ROOM printing the
   figure and is exactly the grammar the greeting addendum signed off. Only the
   model's own spans are checked. */

/** Every figure printed on the card. A value that is not a figure (a status
 *  word, a facility name) is not one of these: repeating "confirmed" is not the
 *  failure this rule is about. */
function cardFigures(subject: NarrateSubject): string[] {
  if (!subject.card) return [];
  const out: string[] = [];
  for (const row of subject.card.rows) {
    for (const raw of [row.value, row.sub]) {
      const value = (raw ?? "").trim();
      if (value.length < 2 || !/\d/.test(value)) continue;
      if (!out.includes(value)) out.push(value);
    }
  }
  return out;
}

/* ============= A REMARK MAY NOT CONTRADICT ITS OWN CARD (founder, 2026-09-03)

   His transcript: the card staged a rate move to 7.25% and a commitment move to
   $20M, and the remark under it said the line "moves to 7.25% all-in, HOLDING
   THE EXISTING PRICING through the commitment increase". Both halves cannot be
   true, and the half the banker can act on is the card.

   THIS IS NOT THE CLAIM GUARD. That one drops a sentence naming a field NOBODY
   staged. This one drops a sentence naming a field the card DID stage and then
   saying it did not move. The two failures look nothing alike from inside the
   sentence, and both of them reached the glass.

   IT READS THE CARD'S OWN ROWS, so it cannot drift from what is staged: a row
   whose label names the rate means the rate moved, and from that moment "the
   existing pricing" is a false sentence about this card whatever else is in
   it. */

interface Contradiction {
  /** The row label that means this field is moving. */
  moved: RegExp;
  /** The phrase that says it is not. */
  says: RegExp;
}

/** The ways a sentence says "this did not move". */
const HOLDS = "hold|holds|holding|keep|keeps|keeping|unchanged|untouched";

const CONTRADICTIONS: Contradiction[] = [
  {
    // A staged rate change against any claim that the pricing stands.
    moved: /\b(rate|pricing|coupon)\b/i,
    says: new RegExp(
      "\\b(?:" + HOLDS + "|stays? the same|as it (?:is|stands))\\b[^.?!]*\\b(?:rate|pricing|coupon)\\b" +
        "|\\b(?:rate|pricing|coupon)\\b[^.?!]*\\b(?:" + HOLDS + "|stays? the same)\\b",
      "i",
    ),
  },
  {
    // A staged commitment change against any claim that the amount holds.
    moved: /\b(commitment|amount)\b/i,
    says: new RegExp(
      "\\b(?:commitment|amount|exposure|line)\\b[^.?!]*\\b(?:" + HOLDS +
        "|holds? at|stays? (?:at|the same)|is not moving|does not move)\\b" +
        "|\\b(?:" + HOLDS + "|holds? at)\\b[^.?!]*\\b(?:commitment|amount|exposure)\\b",
      "i",
    ),
  },
];

/* ============ THE ROUTE IS THE ROUTE (founder, 2026-09-03)

   On a MODIFICATION the remark said the line reprices "effective with the
   staged renewal". There was no renewal: the banker was three clicks into a
   modification, and the sentence named a credit action nobody had opened.

   THE ROOM ALREADY TELLS THE MODEL WHICH ROUTE IS BOUND, in `routeLine`, and
   the model wrote past it. So the guard reads the envelope's own route and
   strips any sentence naming a DIFFERENT one. It is a claim about what the
   banker is doing, and a banker cannot check it against the card, which is
   exactly the kind of claim this file exists to remove.

   THE ROUTE'S OWN WORDS ARE NOT BANNED. "modification" under a modification is
   the sentence orienting itself, and it stays. */

const ROUTE_WORDS: Record<string, RegExp> = {
  modify: /\b(modifications?|amendments?)\b/i,
  renew: /\b(renewals?|renewing|re-?new)\b/i,
  create: /\b(new facilit(?:y|ies)|new loans?|origination)\b/i,
};

/** The route words that do NOT belong to the bound route. */
function foreignRouteWords(envelope: BrainEnvelope): RegExp[] {
  /* WHILE THE ROUTE IS OPEN NO WORD IS FOREIGN. The greeting's whole job is to
     offer the three routes, and the client's mail asking for a renewal is the
     most useful thing it can say. The rule is about a BOUND room writing past
     the route the banker chose. */
  if (envelope.routeOpen) return [];
  const bound = typeof envelope.route === "string" ? envelope.route : "";
  if (!ROUTE_WORDS[bound]) return [];
  return Object.entries(ROUTE_WORDS)
    .filter(([route]) => route !== bound)
    .map(([, rx]) => rx);
}

/** Does this run of spans name a credit action nobody opened? */
const namesAnotherRoute = (spans: NarrationSpan[], foreign: readonly RegExp[]): boolean => {
  if (!foreign.length) return false;
  const text = spans.map((s) => s.text).join("");
  return foreign.some((rx) => rx.test(text));
};

/** The contradictions this card is capable of, given what it staged. */
function contradictionsFor(subject: NarrateSubject): RegExp[] {
  if (!subject.card) return [];
  const labels = subject.card.rows.map((r) => `${r.label} ${r.sub ?? ""}`).join(" | ");
  return CONTRADICTIONS.filter((c) => c.moved.test(labels)).map((c) => c.says);
}

/** Does this run of spans say the card did not do what the card did? */
const contradictsCard = (spans: NarrationSpan[], says: readonly RegExp[]): boolean => {
  if (!says.length) return false;
  const text = spans.map((s) => s.text).join("");
  return says.some((rx) => rx.test(text));
};

/** Does this run of spans print a figure the card already carries? */
const echoesCard = (spans: NarrationSpan[], figures: readonly string[]): boolean => {
  if (!figures.length) return false;
  const text = spans.map((s) => s.text).join("");
  return figures.some((f) => text.includes(f));
};

/* ============ AND THE ROWS' OWN RAILS COUNT TOO (founder, 2026-09-03)

   "all four financial covenants remain compliant as of the June 30 test, with
   DSCR at 1.38x and leverage at 2.42x" - printed as prose, above rows whose
   rails the ROOM had already filled with 1.38x and 2.42x out of the book.

   THE CARD IS NOT THE ONLY THING ON THE GLASS. A row's rail is the room's own
   figure, eight pixels to the right of the sentence repeating it, and the
   greeting-v2 grammar exists precisely so the model does NOT have to write
   those numbers. A figure a row is already printing is a figure the prose may
   not print. */
/**
 * ONE RAIL FIGURE IS A REFERENCE. TWO IS THE RAIL READ ALOUD.
 *
 * "James asked to renew the $8.0MM equipment loan; open the renewal?" names the
 * facility the way a colleague would, and the commitment in it is how the
 * banker knows WHICH facility. Dropping that sentence to save one repeated
 * figure would cost the close line the greeting exists to write.
 *
 * "all four covenants remain compliant, with DSCR at 1.38x and leverage at
 * 2.42x" is the rows recited. Two figures the rails already print, in one
 * sentence, is the failure the founder read.
 */
const RAIL_ECHO_MIN = 2;

const recitesRails = (spans: NarrationSpan[], rails: readonly string[]): boolean => {
  if (rails.length < RAIL_ECHO_MIN) return false;
  const text = spans.map((s) => s.text).join("");
  const hit = new Set(rails.filter((f) => text.includes(f)));
  return hit.size >= RAIL_ECHO_MIN;
};

function railFigures(blocks: NarrationBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind !== "entity") continue;
    for (const row of block.rows) {
      const value = (row.value ?? "").trim();
      if (value.length < 2 || !/\d/.test(value)) continue;
      // A rail is often a pair ("1.38x vs >= 1.25x"); each half is a figure the
      // prose may not repeat.
      for (const part of value.split(/\s+(?:vs\.?|against)\s+/i)) {
        const f = part.trim();
        if (f.length >= 2 && /\d/.test(f) && !out.includes(f)) out.push(f);
      }
    }
  }
  return out;
}

/* ============================= THE PLAN IS NOT A REMARK (founder, 2026-09-03)

   Under the focus prompt the model listed the whole staged plan back: the
   commitment, the two pledges coming off, the fee, the maturity. Every one of
   those rows is already a row on the manifest rail, two hundred pixels to the
   right, and the banker put them there.

   A LIST OF WHAT IS STAGED IS THE RAIL'S JOB. The model may write it only when
   the banker ASKED for the plan, which is the one card whose whole content is
   the plan itself. */

/** The card the banker gets when they ask what is on the plan. Matched on the
 *  lede the room composes for it, which is the only card whose subject IS the
 *  manifest. */
const PLAN_READ = /^The manifest holds \d+/;

const namesPlanEntry = (spans: NarrationSpan[], staged: BrainEnvelope["staged"]): boolean => {
  const text = spans.map((s) => s.text).join("").toLowerCase();
  return staged.some((e) => e.title && text.includes(e.title.toLowerCase()));
};

/**
 * DROP A REMARK THAT RESTATES THE PLAN.
 *
 * A bullet or entity run whose rows all name staged entries is the rail said
 * again in prose. Kept only under the plan read-back card.
 */
export function cutPlanRestatement(
  blocks: NarrationBlock[],
  envelope: BrainEnvelope,
  subject: NarrateSubject,
): NarrationBlock[] {
  const staged = envelope.staged ?? [];
  if (staged.length < 2) return blocks;
  if (subject.card && PLAN_READ.test(subject.card.title)) return blocks;
  return blocks.filter((block) => {
    if (block.kind === "bullets") return !block.items.every((item) => namesPlanEntry(item, staged));
    if (block.kind === "entity") return !block.rows.every((r) => namesPlanEntry(r.label, staged));
    return true;
  });
}

/** The two rules that hold with no card in front of them, applied on their own. */
function stripLoose(blocks: NarrationBlock[], foreign: readonly RegExp[], rails: readonly string[]): NarrationBlock[] {
  const keep = (spans: NarrationSpan[]) => !namesAnotherRoute(spans, foreign) && !recitesRails(spans, rails);
  const out: NarrationBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "line") {
      const spans: NarrationSpan[] = [];
      sentencesOf(block.spans)
        .filter(keep)
        .forEach((sentence, i) => {
          if (i) spans.push({ text: " " });
          spans.push(...sentence);
        });
      if (spans.length) out.push({ kind: "line", spans });
      continue;
    }
    if (block.kind === "bullets") {
      const items = block.items.filter(keep);
      if (items.length) out.push({ kind: "bullets", items });
      continue;
    }
    if (block.kind === "entity") {
      const rows = block.rows.filter((r) => keep(r.spans));
      if (rows.length) out.push({ kind: "entity", rows });
      continue;
    }
    out.push(block);
  }
  return out;
}

export function guardClaims(
  blocks: NarrationBlock[],
  envelope: BrainEnvelope,
  subject: NarrateSubject,
): GuardedClaims {
  /* NO CARD, NOTHING TO BE "NOT ON". The rule is that the remark describes THE
     CARD ON THE GLASS, so a remark with no card in front of it (the greeting,
     the late-mail note) is not held to it: the greeting is a remark about the
     whole book by design, and policing it against a card that does not exist
     would delete the sentences it exists to write. The figure guard still runs. */
  /* THE ROUTE RULE AND THE RAIL RULE DO NOT NEED A CARD. The greeting has no
     card and is exactly where a stray "renewal" and a repeated 1.38x do most
     harm, so the no-card arm runs them before it hands over to the figure
     guard. Only the CLAIM rule needs a card to be a claim about. */
  if (!subject.card) {
    const foreignOnly = foreignRouteWords(envelope);
    const rails = railFigures(blocks);
    const kept = foreignOnly.length || rails.length ? stripLoose(blocks, foreignOnly, rails) : blocks;
    return { ...guardFigures(kept, envelope, subject), claimed: [] };
  }
  const allowed = allowedTerms(envelope, subject);
  const figures = cardFigures(subject);
  const rails = railFigures(blocks);
  const contradictions = contradictionsFor(subject);
  const foreign = foreignRouteWords(envelope);
  const claimed: string[] = [];
  const note = (term: string) => {
    if (!claimed.includes(term)) claimed.push(term);
  };

  const keptSpans = (spans: NarrationSpan[]): NarrationSpan[] => {
    const sentences = sentencesOf(spans);
    const kept = sentences.filter((sentence) => {
      /* THE CARD SAYS IT ONCE. A sentence that reprints a figure already on the
         card goes silently: it is not a CLAIM the room has to warn about, it is
         a repetition, and marking it would put a second thing on the glass to
         solve there being too much on the glass. */
      if (echoesCard(sentence, figures)) return false;
      // AND A SENTENCE THAT RECITES THE ROWS BESIDE IT.
      if (recitesRails(sentence, rails)) return false;
      /* AND A SENTENCE THAT DENIES THE CARD GOES WITH IT. It is not marked
         "not on the card": it IS on the card, backwards, and a mark under it
         would leave the banker two readings to reconcile. */
      if (contradictsCard(sentence, contradictions)) return false;
      /* AND A SENTENCE NAMING ANOTHER CREDIT ACTION. "Effective with the staged
         renewal" on a modification is a claim the banker cannot check against
         anything on the glass. */
      if (namesAnotherRoute(sentence, foreign)) return false;
      const term = claimedTerm(sentence.map((s) => s.text).join(""), allowed);
      if (term) note(term);
      return !term;
    });
    if (kept.length === sentences.length) return spans;
    const out: NarrationSpan[] = [];
    kept.forEach((sentence, i) => {
      if (i) out.push({ text: " " });
      out.push(...sentence);
    });
    return out;
  };

  const held: NarrationBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "line") {
      const spans = keptSpans(block.spans);
      if (spans.length) held.push({ kind: "line", spans });
      continue;
    }
    if (block.kind === "bullets") {
      const items = block.items.filter((item) => {
        if (echoesCard(item, figures)) return false;
        if (recitesRails(item, rails)) return false;
        if (contradictsCard(item, contradictions)) return false;
        if (namesAnotherRoute(item, foreign)) return false;
        const term = claimedTerm(item.map((s) => s.text).join(""), allowed);
        if (term) note(term);
        return !term;
      });
      if (items.length) held.push({ kind: "bullets", items });
      continue;
    }
    if (block.kind === "entity") {
      const rows = block.rows.filter((row) => {
        // The row's own rail is the ROOM's figure and is never checked; the
        // model's clause beside it is.
        if (echoesCard(row.spans, figures)) return false;
        if (contradictsCard(row.spans, contradictions)) return false;
        if (namesAnotherRoute(row.spans, foreign)) return false;
        const term = claimedTerm(`${spanText(row.label)} ${row.spans.map((s) => s.text).join("")}`, allowed);
        if (term) note(term);
        return !term;
      });
      if (rows.length) held.push({ kind: "entity", rows });
      continue;
    }
    held.push(block);
  }

  const guarded = guardFigures(held, envelope, subject);
  if (claimed.length) guarded.blocks.push({ kind: "mark", text: `${CLAIM_MARK}: ${claimed.join(", ")}` });
  return { ...guarded, claimed };
}

/** The plain text of a parsed remark, with every span joined. What a reader
 *  actually sees, once the markup is gone. */
export function narrationText(blocks: NarrationBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "line") return b.spans.map((s) => s.text).join("");
      if (b.kind === "bullets") return b.items.map((i) => i.map((s) => s.text).join("")).join(" ");
      if (b.kind === "mark") return b.text;
      return b.rows
        .map((r) => `${spanText(r.label)}: ${r.spans.map((s) => s.text).join("")}${r.value ? ` ${r.value}` : ""}`)
        .join(" ");
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------- what the room just did

   ONE MAPPING, TWO ROOMS. Both rooms keep their own thread-item union, and
   neither is imported here: this reads the STRUCTURE they share, so the
   integration in each room stays a single effect rather than a narration call
   sprinkled through twenty staging sites.                                   */

export interface NarratableItem {
  kind: string;
  text?: string;
  options?: unknown[];
  card?: {
    lede: string;
    groups: Array<{ heading: string; rows: Array<{ label: string; value: string; detail?: string }> }>;
  };
  chips?: Array<{
    delta?: {
      title: string;
      target: string;
      after: string;
      /** The manifest heading the entry files under. "terms" is a scalar. */
      group?: string;
      /** Absent reads as "change", which is what a scalar move is. */
      op?: string;
    };
    refusal?: { title: string; target: string; reason: string };
  }>;
  /** THE CHECK UNDER THE CARD. A card carrying one is never routine: the
   *  advisory is the thing a colleague would talk about. */
  advisories?: unknown[];
  /** THE ROOM SAYS THIS MOMENT IS CHROME. Stamped by the room on a line that
   *  answers a SELECTION - focusing a facility, picking a member off the strip
   *  - which is the banker pointing rather than the room acting. */
  routine?: boolean;
  /* ---- the relationship room's own shapes. Structural, like everything above:
         neither room's item union is imported here. */
  /**
   * WHICH ROOM APPENDED THIS ITEM, and the ONLY thing that may open a
   * relationship arm below.
   *
   * The two rooms share `notice` and `dossier` by name AND by shape: the
   * facility room's notice is `{kind:"notice", title, body}` and its dossier is
   * `{kind:"dossier", dossier}`, exactly what the relationship room appends. A
   * structural read ("has a title and a body") therefore cannot tell them
   * apart, and reading them the same way would narrate the facility room's
   * chrome and, worse, its filed dossier, where the room has always said
   * nothing. Only the relationship room sets this field; the facility room
   * never has and must never start.
   */
  room?: string;
  /** A create the room composed and cannot file. */
  gap?: { what: string; line: string; orgGap: string };
  /** The no-connector notice. */
  title?: string;
  body?: string;
  /** The result dossier, built from the org's own execute result. */
  dossier?: { title: string; footer: string; rows: Array<{ label: string; value: string }> };
}

/**
 * THE SUBJECT OF A REMARK, or null where there is nothing to remark on.
 *
 * `said` is the sentence the room put up just before this item, which is what
 * the model is writing beside. A clarify carrying option chips is NOT narrated:
 * the chips are the interaction, and a remark under them would talk over the
 * question the room just asked.
 */
export function subjectFor(item: NarratableItem, said?: string): NarrateSubject | null {
  if (item.kind === "read" && item.card) {
    return {
      act: "answered",
      sentence: item.card.lede,
      card: {
        title: item.card.lede,
        rows: item.card.groups.flatMap((g) =>
          g.rows.map((r) => ({ label: r.label, value: r.value, sub: r.detail })),
        ),
      },
    };
  }

  if (item.kind === "chips" && item.chips?.length) {
    const deltas = item.chips.filter((c) => c.delta).map((c) => c.delta!);
    const refusals = item.chips.filter((c) => c.refusal).map((c) => c.refusal!);
    const rows = [
      ...deltas.map((d) => ({ label: d.title, value: d.after, sub: d.target })),
      ...refusals.map((r) => ({ label: r.title, value: "refused", sub: r.reason })),
    ];
    if (!rows.length) return null;
    /* A PLAIN SCALAR CHANGE WITH NO ADVISORY IS ROUTINE. A create, a removal, a
       covenant, a pledge, a party or a refusal is not: those are the cards a
       colleague comments on, and they are exactly where the model earns its
       sentence. */
    const routine =
      deltas.length > 0 &&
      !refusals.length &&
      !item.advisories?.length &&
      deltas.every((d) => d.group === "terms" && (d.op === undefined || d.op === "change"));
    return {
      act: deltas.length ? "staged" : "refused",
      sentence: said ?? rows.map((r) => r.label).join("; "),
      card: { title: deltas.length ? "On the plan" : "Refused", rows },
      routine,
    };
  }

  // An agent line with chips attached is a question, and a question the room
  // already asked well. Everything else is a sentence a colleague might add to.
  if (item.kind === "agent" && item.text && !item.options?.length) {
    /* A SELECTION IS ROUTINE (founder, 2026-09-03). Focusing a facility is the
       banker pointing at something, not the room doing something: the prompt
       that answers it is a question, and the model has nothing to add to a
       question. The room STAMPS it rather than this reading it off the prose,
       so the rule is a fact about the moment and not a guess about the words. */
    return { act: "answered", sentence: item.text, routine: item.routine };
  }

  /* ------------------------------------------- THE RELATIONSHIP ROOM'S KINDS

     Five item kinds this mapping used to answer `null` for, so the second
     room's most interesting moments were never narrated at all. Three of them
     speak; two deliberately do not, and the reason is written down rather than
     left as an omission a later reader would "fix".                          */

  /* THE OPENING IS NOT NARRATED FROM HERE, EVER. The greeting is the ONE call
     that carries the platform's consent dialog and it is claimed by
     `narration.open` on the room's own greeting effect. A subject returned here
     would let the generic item effect reach the same id first, through `ask`
     rather than `prime`, and the consent moment would land on whatever the room
     said next instead of on the greeting the banker opened it for. */
  if (item.kind === "opening") return null;

  /* THE BRIEF IS THE ROOM'S OWN SCOPE STATEMENT, read once, immediately above
     the first question. A remark under it talks over the question. */
  if (item.kind === "brief") return null;

  /* A CREATE THE ROOM CANNOT FILE. The refusal is already on the card by name;
     the remark says what the banker can do instead. */
  if (item.kind === "gap" && item.gap) {
    return {
      act: "refused",
      sentence: item.gap.line,
      card: { title: item.gap.what, rows: [{ label: "not filed", value: "no deployed tool", sub: item.gap.orgGap }] },
    };
  }

  /* THE ROOM REACHED NO ORG. Loud on the glass, and worth one sentence about
     what the banker can still do from here. GATED ON THE ROOM, not on the
     shape: the facility room's own no-connector notice is the same three
     fields, and it has never been narrated. */
  if (item.kind === "notice" && item.room === "relationship" && item.title && item.body) {
    return { act: "refused", sentence: `${item.title} ${item.body}`.trim() };
  }

  /* THE FILING LANDED. The dossier is the ORG'S account of it, so the rows are
     the card and the model writes only what follows from them. GATED ON THE
     ROOM: the facility room's filing dossier is the same shape and is the last
     item of its own demo, where the room says nothing. */
  if (item.kind === "dossier" && item.room === "relationship" && item.dossier) {
    return {
      act: "filed",
      sentence: item.dossier.footer,
      card: {
        title: item.dossier.title,
        rows: item.dossier.rows.map((r) => ({ label: r.label, value: r.value })),
      },
    };
  }
  return null;
}
