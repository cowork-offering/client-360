import { MANIFEST_GROUPS, type ManifestGroupId, type WorkroomDelta } from "./types";

/* =============================================================================
   THE MANIFEST RAIL.

   It starts EMPTY (law 8) and everything in it arrived by a confirm. That is
   why every figure the room shows is DERIVED from what is actually in the rail
   rather than accumulated as the room goes: a removal then walks the counts and
   the pro-forma figures back exactly as the landing walked them forward, with
   no separate undo path to keep in step.

   Nothing here touches the DOM or React. The rail is a list and a derivation,
   and both are testable on their own.
   ============================================================================= */

/** Where the room starts. The account door of `create` starts at zero, which is
 *  a legitimate baseline and not a missing read. */
export interface ManifestBaseline {
  committedMM: number;
  members: number;
  /** Singular and plural for one thing in the rail, from the mode vocabulary. */
  changeWord: [string, string];
}

/** The rail, in landing order. Removal is by delta id, so the order of what is
 *  left is the order it landed in. */
export function addEntry(entries: WorkroomDelta[], delta: WorkroomDelta): WorkroomDelta[] {
  if (entries.some((e) => e.id === delta.id)) return entries;
  return [...entries, delta];
}

export function removeEntry(entries: WorkroomDelta[], deltaId: string): WorkroomDelta[] {
  return entries.filter((e) => e.id !== deltaId);
}

/* ------------------------------------------------- the rail, from the chat
   W2: "the chat must speak about what is staged and accept amendments
   conversationally (not only the rail's ×)". Two moves and no more, because
   they are the two the rail itself offers: say what is in there, and take
   something out of it. AMENDING is deliberately not a third move — the room's
   answer to "make it 19 instead" is to remove the entry and say it again, so
   that every entry in the rail is one the parser produced from one sentence.  */

export type ManifestAddress =
  | { kind: "list"; entries: WorkroomDelta[] }
  | { kind: "remove"; entry: WorkroomDelta }
  /** Understood as a rail command, but it names nothing that is in there. */
  | { kind: "miss"; reason: string }
  /** Not a rail command at all. The line belongs to the parser. */
  | null;

const LIST_PHRASES = [
  "what is staged",
  "what's staged",
  "what have we staged",
  "what is in the manifest",
  "what's in the manifest",
  "read the manifest",
  "show the manifest",
  "what is on the modification",
  "what have i confirmed",
];

const REMOVE_PHRASES = ["remove", "drop", "take out", "take off", "undo", "forget", "cancel", "delete", "scrap"];

/** Does this line address something already in the rail? */
export function addressManifest(text: string, entries: WorkroomDelta[]): ManifestAddress {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  if (LIST_PHRASES.some((p) => lower.includes(p))) return { kind: "list", entries };

  const removal = REMOVE_PHRASES.find((p) => new RegExp(`(^|\\W)${p}(\\W|$)`).test(lower));
  if (!removal) return null;
  if (!entries.length) return { kind: "miss", reason: "Nothing is staged yet, so there is nothing to take out." };

  // Match on the words the RAIL shows — the entry's own title, its target and
  // the member it names — so the banker removes a thing by what they can see.
  const scored = entries
    .map((e) => {
      const tokens = [e.title, e.target, e.kind, e.after, e.before]
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9$.%]+/)
        .filter((w) => w.length > 2);
      const hits = new Set(tokens.filter((t) => lower.includes(t))).size;
      return { entry: e, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (!scored.length) {
    return {
      kind: "miss",
      reason: `Nothing in the manifest matches that. It holds ${entries.map((e) => e.title.toLowerCase()).join(", ")}.`,
    };
  }
  // A TIE IS AN AMBIGUITY, not a coin toss: taking the wrong entry out of a
  // change set the banker is about to sign is the one mistake that must not be
  // made quietly.
  if (scored.length > 1 && scored[0].hits === scored[1].hits) {
    return {
      kind: "miss",
      reason: `That could be ${scored
        .filter((s) => s.hits === scored[0].hits)
        .map((s) => `${s.entry.title} on ${s.entry.target}`)
        .join(" or ")}. Name one.`,
    };
  }
  return { kind: "remove", entry: scored[0].entry };
}

/** The rail grouped the way a credit committee reads it. Empty groups do not
 *  render, so the rail grows a heading only when it has something under it. */
export function groupEntries(entries: WorkroomDelta[]): { id: ManifestGroupId; label: string; entries: WorkroomDelta[] }[] {
  return MANIFEST_GROUPS.map((g) => ({ ...g, entries: entries.filter((e) => e.group === g.id) })).filter(
    (g) => g.entries.length > 0,
  );
}

export interface ManifestFigures {
  count: number;
  /** Distinct existing members the rail touches. */
  membersChanged: number;
  /** Members the rail ADDS. */
  newMembers: number;
  committedMM: number;
  committedLabel: string;
  /** Empty until a landed change moves the figure, then labelled pro forma. */
  committedNote: string;
  membersLabel: string;
  membersNote: string;
  covenantNote: string;
  /** The rail's own header line. */
  countLine: string;
  /** The sentence on the plan card above the approve action. */
  planSummary: string;
}

/** Every figure the room shows, derived from the rail and the baseline and from
 *  nothing else. Called on every add and every remove; there is no other path. */
export function figuresFor(entries: WorkroomDelta[], baseline: ManifestBaseline): ManifestFigures {
  const touched = new Set(entries.map((e) => e.member).filter(Boolean));
  const newMembers = entries.filter((e) => e.newMember).length;
  const covenants = entries.filter((e) => e.group === "covenants").length;
  const committedMM = entries.reduce((sum, e) => sum + (e.committedDeltaMM ?? 0), baseline.committedMM);
  const moved = committedMM !== baseline.committedMM;
  const members = baseline.members + newMembers;
  const [one, many] = baseline.changeWord;
  const noun = entries.length === 1 ? one : many;

  // "N of M members" wherever there is an M to count against. A package that
  // does not exist yet has no denominator, and inventing "0 of 0" would be a
  // count of nothing presented as a selection.
  const memberClause = baseline.members > 0 ? `${touched.size} of ${baseline.members} members` : null;
  const newClause = newMembers ? `${newMembers} new member${newMembers > 1 ? "s" : ""}` : null;

  const countLine = entries.length
    ? [`${entries.length} ${noun}`, memberClause, newClause].filter(Boolean).join(" · ")
    : "Nothing staged";

  const planSummary = entries.length
    ? [
        `${entries.length} ${noun} staged.`,
        memberClause ? `${touched.size} of ${baseline.members} members changed.` : null,
        newMembers ? `${newMembers} member${newMembers > 1 ? "s" : ""} added.` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "Nothing staged.";

  return {
    count: entries.length,
    membersChanged: touched.size,
    newMembers,
    committedMM,
    committedLabel: `$${committedMM.toFixed(1)}MM`,
    committedNote: moved ? `pro forma · was $${baseline.committedMM.toFixed(1)}MM` : "",
    membersLabel: String(members),
    membersNote: newMembers ? `+${newMembers} proposed` : "",
    covenantNote: covenants ? `${covenants} proposed` : "",
    countLine,
    planSummary,
  };
}
