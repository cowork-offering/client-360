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
export type NarrateAct = "staged" | "refused" | "answered" | "greeting";

export interface NarrateSubject {
  act: NarrateAct;
  /** The deterministic sentence already on the glass. The model is writing
   *  BESIDE it, never instead of it, so it must know what was said. */
  sentence: string;
  /** The card the room staged, refused over or answered with, digested to what
   *  a remark could be about. Absent where the act carried no card. */
  card?: { title: string; rows: Array<{ label: string; value: string; sub?: string }> };
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
  if (CHROME.some((rx) => rx.test(sentence))) return false;
  if (!subject.card && sentence.length < CHROME_CHARS) return false;
  return true;
}

/* -------------------------------------------------------------- the prompt */

/** How the remark is written. The founder's addendum, as instruction: light
 *  structure is allowed, a memo is not, and raw markdown never reaches glass. */
const HOW_TO_WRITE = [
  "HOW TO WRITE IT.",
  "Plain sentences, at most three. This is a colleague's remark beside a card, not a memo.",
  "At most three bullets when you are listing, each one line, each starting with a hyphen.",
  "Bold only for a figure, written **like this**. No headings, no tables, no links, no code.",
  "No em dashes. Never repeat the sentence the room already said; add what it could not.",
  "Name what your remark is based on. If there is nothing worth saying, say the one thing that is and stop.",
];

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
  const doctrine = composeDoctrine(envelope.line || subject.sentence, { mode: "narrate" });
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

export type NarrationBlock =
  | { kind: "line"; spans: NarrationSpan[] }
  | { kind: "bullets"; items: NarrationSpan[][] };

/** A remark is a remark. Four blocks and three bullets is already generous for
 *  something a colleague says while pointing at a card. */
export const NARRATION_MAX_BLOCKS = 4;
export const NARRATION_MAX_BULLETS = 3;

const BULLET = /^\s*[-*•]\s+(.*)$/;
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
export function parseNarration(raw: string): NarrationBlock[] {
  const blocks: NarrationBlock[] = [];
  let bullets: NarrationSpan[][] | null = null;
  // A fence takes its CONTENTS with it. Dropping the ``` lines alone would leave
  // the code on the glass, which is the one thing a fence guarantees is not prose.
  let fenced = false;

  const closeBullets = () => {
    if (bullets?.length) blocks.push({ kind: "bullets", items: bullets.slice(0, NARRATION_MAX_BULLETS) });
    bullets = null;
  };

  for (const line of (raw ?? "").split(/\r?\n/)) {
    if (blocks.length >= NARRATION_MAX_BLOCKS) break;
    if (FENCE.test(line)) {
      fenced = !fenced;
      closeBullets();
      continue;
    }
    if (fenced) continue;
    if (!line.trim()) {
      closeBullets();
      continue;
    }
    if (DROP.some((rx) => rx.test(line))) continue;

    const bullet = BULLET.exec(line);
    if (bullet) {
      const spans = spansOf(bullet[1]);
      if (spans.length) (bullets ??= []).push(spans);
      continue;
    }
    closeBullets();
    if (blocks.length >= NARRATION_MAX_BLOCKS) break;
    const spans = spansOf(line);
    if (spans.length) blocks.push({ kind: "line", spans });
  }
  closeBullets();
  return blocks.slice(0, NARRATION_MAX_BLOCKS);
}

/** The plain text of a parsed remark, with every span joined. What a reader
 *  actually sees, once the markup is gone. */
export function narrationText(blocks: NarrationBlock[]): string {
  return blocks
    .map((b) =>
      b.kind === "line"
        ? b.spans.map((s) => s.text).join("")
        : b.items.map((i) => i.map((s) => s.text).join("")).join(" "),
    )
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
    delta?: { title: string; target: string; after: string };
    refusal?: { title: string; target: string; reason: string };
  }>;
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
    return {
      act: deltas.length ? "staged" : "refused",
      sentence: said ?? rows.map((r) => r.label).join("; "),
      card: { title: deltas.length ? "On the plan" : "Refused", rows },
    };
  }

  // An agent line with chips attached is a question, and a question the room
  // already asked well. Everything else is a sentence a colleague might add to.
  if (item.kind === "agent" && item.text && !item.options?.length) {
    return { act: "answered", sentence: item.text };
  }
  return null;
}
