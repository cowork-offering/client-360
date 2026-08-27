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
