/* =============================================================================
   THE ORG ARMS, WIRED INTO THE ROOM (2026-09-02).

   Three arms landed on `stage_loan_modification` when the founder's deploy went
   through (`design/proposals/org-arms-addendum.md`):

     covenantExclusionsJson   the new version does not carry a covenant junction
     pledgeExclusionsJson     the new version does not carry a pledge
     covenantAttachesJson     a junction-only create for a covenant that exists

   NOTHING HERE IS A DELETE, and the whole file exists to keep that true in the
   words as well as in the wire. A modification clones the parent and the carry
   replicates its junctions. An exclusion makes that carry write FEWER rows: the
   booked facility keeps everything it holds today and the clone starts without
   the named junction. That is the same mechanism the borrowing structure has
   used since 2026-08-30, and it is why this is possible at all while covenant
   DETACH and every delete stay fenced.

   WHY THE ARM RIDES A SENTINEL FIELD.

   `app/src/workroom/` is the fenced engine and `wirePayload` inside it maps the
   seven wire lists it shipped with. An arm delta therefore travels as a
   `fieldWire` carrying {@link ARM_FIELD}, a field name no org describe holds,
   and {@link armStage} lifts those entries back out of `fieldChangesJson`
   before the payload leaves the client, replacing them with the three arm keys.

   The sentinel is FAIL-CLOSED by construction, and it is worth being exact
   about WHICH thing on the org closes it. `StageLoanModification.cls` resolves
   every field change against the live describe of `LLC_BI__Loan__c`, by API
   name and by label, and throws on one it cannot resolve:

     No field named "__c360OrgArm" exists on the facility in this org, by API
     name or by label.

   That is the refusal, and it fires at stage time, before any write. It is NOT
   `C360WriteGuard`: the guard's field check is a NEGATIVE list, the fields it
   refuses to write, so a name no object holds is not on it and the guard would
   have nothing to say about the sentinel at all.

   Stripping the sentinel is therefore the only way an arm can travel. Bypass
   this wrapper and the plan is refused rather than written: a wiring mistake is
   a refusal, never a wrong write on a borrower's clone.
   ============================================================================= */

import type { StagePayloads } from "../../channel/writeTools";
import type { StagedOutput } from "../../actions/stagedPlan";
import type { ToolOutcome } from "../../channel/writeTools";
import type { WorkroomDelta, WorkroomMode } from "../../workroom/types";
import type { Book, BookAsset, BookCovenant, ElicitMember } from "./elicit";
import { clipTitle, readScope } from "./elicit";

/* --------------------------------------------------------------- the wire */

/** The three arms, in the org's own words. */
export type ArmKind = "covenantExclusion" | "pledgeExclusion" | "covenantAttach";

/** One arm entry, as it rides the delta and as it reaches the org. */
export interface ArmEntry {
  kind: ArmKind;
  /** The `LLC_BI__Covenant2__c` id, or the `LLC_BI__Collateral__c` id. Exactly
   *  one identifier per entry is the org's rule and this is it: the room always
   *  holds the RECORD the read returned, never the junction row. */
  recordId: string;
  targetLoanId: string;
}

/**
 * The field name an arm delta travels under inside the fenced engine.
 *
 * It is deliberately not a legal API name and deliberately not a label: the org
 * would have to invent this field for the sentinel to reach it, so a bypass of
 * {@link armStage} is refused by `StageLoanModification.cls`'s own describe
 * lookup instead of being written.
 */
export const ARM_FIELD = "__c360OrgArm";

/** At most ten of each, per plan. The org's cap, enforced here so the banker
 *  reads the eleventh as a sentence rather than as a refused plan. */
const ARM_CAP = 10;

/** The arm this delta carries, or null. */
export function armOf(delta: WorkroomDelta): ArmEntry | null {
  if (delta.fieldWire?.field !== ARM_FIELD) return null;
  return decodeArm(String(delta.fieldWire.value));
}

const encodeArm = (arm: ArmEntry): string => JSON.stringify(arm);

function decodeArm(value: string): ArmEntry | null {
  try {
    const raw = JSON.parse(value) as Partial<ArmEntry>;
    if (!raw || typeof raw.recordId !== "string" || typeof raw.targetLoanId !== "string") return null;
    if (raw.kind !== "covenantExclusion" && raw.kind !== "pledgeExclusion" && raw.kind !== "covenantAttach") return null;
    return { kind: raw.kind, recordId: raw.recordId, targetLoanId: raw.targetLoanId };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ the payload */

type ModificationPayload = StagePayloads["loan-modification"];
type FieldChange = { field: string; value: unknown; targetLoanId: string };

/** The plural of an arm, for a sentence about too many of them. */
const ARM_NOUN: Record<ArmKind, string> = {
  covenantExclusion: "covenant carry exclusions",
  pledgeExclusion: "pledge carry exclusions",
  covenantAttach: "covenant associations",
};

/** Thrown where the room has composed a plan the arm cannot carry. The room
 *  renders the message; nothing has been staged and nothing was written. */
export class ArmRefusal extends Error {}

/**
 * THE ARMS, LIFTED OUT OF THE PAYLOAD THE FENCED ENGINE BUILT.
 *
 * One transform, and the only place the sentinel is understood. Every arm entry
 * comes OUT of `fieldChangesJson` and the three arm keys go in; a payload with
 * no arms comes back byte-identical, which is what keeps every existing plan on
 * exactly the wire it has been filing on since August.
 */
export function armPayload(payload: ModificationPayload): ModificationPayload {
  const raw: FieldChange[] = payload.fieldChangesJson ? (JSON.parse(payload.fieldChangesJson) as FieldChange[]) : [];
  const armed = raw.filter((f) => f.field === ARM_FIELD);
  if (!armed.length) return payload;

  const plain = raw.filter((f) => f.field !== ARM_FIELD);
  const arms = armed
    .map((f) => decodeArm(String(f.value)))
    .filter((a): a is ArmEntry => a !== null);

  const of = (kind: ArmKind) => arms.filter((a) => a.kind === kind);
  for (const kind of ["covenantExclusion", "pledgeExclusion", "covenantAttach"] as ArmKind[]) {
    const count = of(kind).length;
    if (count > ARM_CAP) {
      throw new ArmRefusal(
        `This plan carries ${count} ${ARM_NOUN[kind]} and one modification takes at most ${ARM_CAP}. ` +
          "Take some off the manifest and file them as a second modification; nothing has been staged and nothing was written.",
      );
    }
  }

  /* ONE FACILITY NEEDS NO TARGET. Every arm takes `targetLoanId` as optional
     exactly when the plan selects one facility, like every other arm on this
     tool, and sending it anyway would be a second way of saying the same thing.
     Where the plan selects more than one it is REQUIRED and always sent. */
  const single = (payload.facilityIds ?? []).length === 1;
  const entry = (a: ArmEntry, key: "covenantId" | "pledgeId" | "collateralId") =>
    single ? { [key]: a.recordId } : { [key]: a.recordId, targetLoanId: a.targetLoanId };

  const exclusions = of("covenantExclusion").map((a) => entry(a, "covenantId"));
  const pledges = of("pledgeExclusion").map((a) => entry(a, "collateralId"));
  const attaches = of("covenantAttach").map((a) => entry(a, "covenantId"));

  const next: ModificationPayload = { ...payload };
  // The key exists on the wire only where it carries something. An emptied
  // `fieldChangesJson` is REMOVED rather than sent as "[]": the org counts the
  // lists that arrive, and an empty one is a change nobody asked for.
  if (plain.length) next.fieldChangesJson = JSON.stringify(plain);
  else delete next.fieldChangesJson;
  if (exclusions.length) next.covenantExclusionsJson = JSON.stringify(exclusions);
  if (pledges.length) next.pledgeExclusionsJson = JSON.stringify(pledges);
  if (attaches.length) next.covenantAttachesJson = JSON.stringify(attaches);
  return next;
}

/** The engine's own `stage` dependency, with the arms wired through it. */
export function armStage(
  stage: (payload: ModificationPayload) => Promise<ToolOutcome<StagedOutput>>,
): (payload: ModificationPayload) => Promise<ToolOutcome<StagedOutput>> {
  return (payload) => stage(armPayload(payload));
}

/* ------------------------------------------------------------- the deltas */

/**
 * An asset description runs to a paragraph in this org. The first sentence
 * names it; the exclusions inside it are the credit agreement's business.
 *
 * THE TRUNCATION MARK IS ONE CHARACTER AND IT IS NOT A FULL STOP. Three dots
 * are a sentence end to anything that splits on one, and this title travels
 * into {@link armConfirmSentence}, which drops the engine's opening clause by
 * splitting the engine's reply on its sentences. COL-000763 (129 characters),
 * COL-000765 (152) and COL-000764 (196) all truncate, and with "..." the
 * confirm read "... and nothing is deleted anywhere. on Purchase: pledged to
 * the booked facility ...": half the engine's own opening clause, spliced back
 * on after the arm's sentence. One ellipsis character cannot do that.
 *
 * AND THE CUT IS ON A WORD (2026-09-02). It was a bare character slice, so the
 * confirm and the manifest both read "First mortgage on the owner-occupied Fort
 * Wayne manufacturing c… on Construction". `clipTitle` is the one rule now, and
 * every shortener in the room uses it.
 */
function assetPhrase(label: string): string {
  const first = label.split(/(?<=\.)\s+/)[0].replace(/\.$/, "").trim() || label;
  return clipTitle(first, 64);
}

interface DeltaArgs {
  facilityId: string;
  /** The member's own display label, as every sentence in the room names it. */
  facilityLabel: string;
}

/**
 * THE COVENANT THE NEW VERSION WILL NOT CARRY (P2, founder 2026-09-02).
 *
 * "Remove the Minimum Liquidity covenant from the 15M line of credit" used to be
 * answered with the covenant-detach fence. It is not a detach: the booked
 * facility keeps its junction and the covenant record is not touched, and the
 * only thing that changes is that the CLONE starts without that junction.
 */
export function covenantExclusionDelta(covenant: BookCovenant, args: DeltaArgs): WorkroomDelta {
  const arm: ArmEntry = { kind: "covenantExclusion", recordId: covenant.id!, targetLoanId: args.facilityId };
  return {
    id: `covenant.exclude:${args.facilityId}:${covenant.id}`,
    group: "covenants",
    op: "remove",
    kind: "Covenant carry exclusion",
    badge: `${covenant.type} will not carry`,
    title: covenant.type,
    target: args.facilityLabel,
    before: "on the booked facility, and carried onto the clone today",
    after: "not carried onto the new version",
    member: args.facilityId,
    map: [
      ["Object", "LLC_BI__Loan_Covenant__c"],
      ["Field", "none. The junction is not written on the clone"],
      [
        "Written as",
        "A carry exclusion. The booked facility keeps its own junction, the covenant record is not touched, and the new version simply starts without it.",
      ],
    ],
    fields: ["LLC_BI__Loan_Covenant__c"],
    fileable: true,
    fieldWire: {
      field: ARM_FIELD,
      label: "Covenant carry exclusion",
      value: encodeArm(arm),
      display: `${covenant.type} is left off the new version of ${args.facilityLabel}`,
      facilityId: args.facilityId,
    },
    filed: {
      recordId: "no record is written",
      verification: "Proved on both sides: the clone reads no junction for it and the booked facility still reads its own.",
    },
  };
}

/** THE PLEDGE THE NEW VERSION WILL NOT CARRY. Collateral language throughout
 *  (P4): the asset and the borrower's ownership of it are relationship records
 *  and are never touched, and what fails to travel is the per-facility pledge. */
export function pledgeExclusionDelta(asset: BookAsset, args: DeltaArgs): WorkroomDelta {
  const said = assetPhrase(asset.label);
  const arm: ArmEntry = { kind: "pledgeExclusion", recordId: asset.id, targetLoanId: args.facilityId };
  return {
    id: `collateral.exclude:${args.facilityId}:${asset.id}`,
    group: "security",
    op: "remove",
    kind: "Pledge carry exclusion",
    kindTone: "collateral",
    badge: `${said} will not carry`,
    title: said,
    target: args.facilityLabel,
    before: "pledged to the booked facility, and carried onto the clone today",
    after: "not carried onto the new version",
    member: args.facilityId,
    map: [
      ["Object", "LLC_BI__Loan_Collateral2__c"],
      ["Field", "none. The pledge is not written on the clone"],
      [
        "Written as",
        "A carry exclusion. The asset and the borrower's ownership of it are relationship records and are not touched; the booked facility keeps its pledge and the new version starts without it.",
      ],
    ],
    fields: ["LLC_BI__Loan_Collateral2__c"],
    fileable: true,
    fieldWire: {
      field: ARM_FIELD,
      label: "Pledge carry exclusion",
      value: encodeArm(arm),
      display: `${said} is left off the new version of ${args.facilityLabel}`,
      facilityId: args.facilityId,
    },
    filed: {
      recordId: "no record is written",
      verification: "Proved on both sides: the clone reads no pledge for it and the booked facility still reads its own.",
    },
  };
}

/** THE COVENANT THE BOOK ALREADY CARRIES, ASSOCIATED TO THIS FACILITY (P1).
 *  A junction-only create for an existing record: nothing about the covenant
 *  itself is written, so the threshold and the schedule stay as they are. */
export function covenantAttachDelta(covenant: BookCovenant, args: DeltaArgs): WorkroomDelta {
  const arm: ArmEntry = { kind: "covenantAttach", recordId: covenant.id!, targetLoanId: args.facilityId };
  const terms = [
    covenant.threshold !== null ? `at ${covenant.threshold}` : null,
    covenant.frequency ? `tested ${covenant.frequency.toLowerCase()}` : null,
  ].filter((t): t is string => Boolean(t));
  return {
    id: `covenant.associate:${args.facilityId}:${covenant.id}`,
    group: "covenants",
    op: "add",
    kind: "Associate a covenant",
    badge: `${covenant.type} → associated`,
    title: covenant.type,
    target: args.facilityLabel,
    before: "on the book, with no junction to this facility",
    after: terms.length ? `associated to this facility, ${terms.join(", ")}` : "associated to this facility",
    member: args.facilityId,
    map: [
      ["Object", "LLC_BI__Loan_Covenant__c"],
      ["Field", "the junction alone"],
      [
        "Written as",
        "A junction-only create for the covenant the borrower already holds. No covenant is inserted and no covenant field is written, so the threshold, the frequency and the schedule stay exactly as they are.",
      ],
    ],
    fields: ["LLC_BI__Loan_Covenant__c"],
    fileable: true,
    fieldWire: {
      field: ARM_FIELD,
      label: "Covenant association",
      value: encodeArm(arm),
      display: `${covenant.type} is associated to ${args.facilityLabel} by junction`,
      facilityId: args.facilityId,
    },
    filed: {
      recordId: "assigned by the org on execution",
      verification: "The junction is re-queried on the clone and the covenant record is read back unchanged.",
    },
  };
}

/* ------------------------------------------------- the confirm, in its words */

/**
 * WHAT THE CONFIRM SAYS ABOUT AN ARM.
 *
 * The engine composes every confirm as "staged on the clone", which is true of
 * an add and says nothing about an exclusion. A banker signing a removal is
 * entitled to read, on the confirm itself, that the booked loan is untouched.
 * So the arm's own sentence replaces the engine's opening clause and the rest of
 * the engine's reply, the package figure and the next move, is kept verbatim.
 */
export function armConfirmSentence(delta: WorkroomDelta, reply: string): string {
  const arm = armOf(delta);
  if (!arm) return reply;
  /* A RUN OF DOTS IS NOT A SENTENCE END. The engine opens its reply with the
     entry's own title, and a truncated asset title used to carry "..." into it,
     so the split cut the engine's opening clause in half and the second half was
     spliced back on after the arm's sentence. The mark is one character now and
     this boundary refuses a doubled full stop as well, so neither alone can put
     the engine's "staged on the clone" back into a removal's confirm. */
  const rest = reply.split(/(?<=[^.]\.)\s+/).slice(1).join(" ");
  const lede =
    arm.kind === "covenantAttach"
      ? `${delta.title} is associated to the ${delta.target} on the new version. The covenant record itself is not touched: the threshold, the frequency and the schedule stay exactly as the borrower holds them, and what this authors is the junction alone.`
      : arm.kind === "pledgeExclusion"
        ? `${delta.title} will not carry onto the new version of ${delta.target}. The booked facility keeps the pledge exactly as it holds it today, the asset and the borrower's ownership of it are not touched, and nothing is deleted anywhere.`
        : `${delta.title} will not carry onto the new version of ${delta.target}. The booked loan keeps it, the covenant record itself is not touched, and the clone simply starts without that junction.`;
  return rest ? `${lede} ${rest}` : lede;
}

/* --------------------------------------------------- reading a removal line */

/** What the room does with a removal line naming something on the book. */
export type ArmRead =
  | { kind: "exclusion"; delta: WorkroomDelta; said: string }
  /** The book carries it, and not on that facility. Nothing is staged. */
  | { kind: "refusal"; text: string }
  /** The line named no facility and the room holds none to stand on. */
  | { kind: "ask"; text: string; options: Array<{ label: string; say: string }> }
  | null;

/** Which facility a removal line is about: the one it names, else the one the
 *  room is standing on, else the only one there is. */
function facilityFor(
  line: string,
  members: ElicitMember[],
  focused: ElicitMember | null,
): { id: string; label: string } | null {
  const scope = readScope(line, members);
  if (scope.ids.length === 1) {
    const named = members.find((m) => m.id === scope.ids[0]);
    if (named) return { id: named.id, label: named.label };
  }
  if (!scope.ids.length && focused) return { id: focused.id, label: focused.label };
  if (!scope.ids.length && members.length === 1) return { id: members[0].id, label: members[0].label };
  return null;
}

/** Where the book carries this covenant, said the way a banker would say it. */
function covenantWhere(matches: BookCovenant[], label: (id: string) => string): string {
  const attached = matches.flatMap((c) => c.loanIds);
  if (attached.length) {
    const named = [...new Set(attached)].map(label);
    return `This book carries it on ${named.join(" and ")}.`;
  }
  if (matches.some((c) => c.accountLevel)) {
    return "This book carries it at the relationship level, with no loan junction on it at all, which is exactly why it is not on this facility.";
  }
  return "This read does not carry a loan junction for it anywhere on the package.";
}

export interface ArmContext {
  line: string;
  /** What the removal named, and which fence answered it before the arms. */
  scope: "covenant" | "pledge";
  name: string;
  book: Book;
  members: ElicitMember[];
  focused: ElicitMember | null;
  mode: WorkroomMode;
}

/**
 * A REMOVAL, ROUTED TO THE ARM THAT FILES IT.
 *
 * Null hands the line back to the fence, and that is the honest answer on two
 * routes and one shape: a renewal and a new facility file neither exclusion, and
 * a covenant the read carries no id for cannot be named on the wire.
 *
 * THE BOOK IS CHECKED FIRST. An exclusion is meaningless where the facility does
 * not carry the junction, and the org says so by name, so the room says it
 * first, with where the covenant actually is, rather than sending a plan up to
 * be refused.
 */
export function readArmRemoval(ctx: ArmContext): ArmRead {
  if (ctx.mode !== "modify") return null;
  const label = (id: string) => ctx.members.find((m) => m.id === id)?.label ?? "that facility";

  const where = facilityFor(ctx.line, ctx.members, ctx.focused);
  if (!where) {
    const subject = ctx.scope === "covenant" ? ctx.name : assetPhrase(ctx.name);
    return {
      kind: "ask",
      text: `Which facility should the new version leave ${subject} off? A carry exclusion is per facility: the others keep it.`,
      options: ctx.members.map((m) => ({
        label: m.label,
        say: `remove the ${subject} ${ctx.scope === "covenant" ? "covenant" : "pledge"} from the ${m.shortName ?? m.label}`,
      })),
    };
  }

  if (ctx.scope === "covenant") {
    const matches = ctx.book.covenants.filter((c) => c.type === ctx.name);
    const here = matches.filter((c) => c.loanIds.includes(where.id));
    if (!here.length) {
      return {
        kind: "refusal",
        text:
          `${ctx.name} is not attached to the ${where.label}, so there is nothing there for the new version to leave behind. ` +
          `${covenantWhere(matches, label)} A covenant reaches a facility through its loan junction, and an exclusion takes one junction off the clone. ` +
          "Nothing has been staged and nothing has come off the manifest.",
      };
    }
    const covenant = here.find((c) => c.id) ?? null;
    if (!covenant) return null;
    return {
      kind: "exclusion",
      delta: covenantExclusionDelta(covenant, { facilityId: where.id, facilityLabel: where.label }),
      said:
        `${ctx.name} will not carry onto the new version of ${where.label}; the booked loan keeps it. ` +
        "Nothing is deleted: the covenant record stays exactly as it is and the booked facility keeps its own junction.",
    };
  }

  const assets = ctx.book.assets.filter((a) => a.label === ctx.name || a.name === ctx.name);
  const here = assets.filter((a) => a.loanIds.includes(where.id));
  const said = assetPhrase(ctx.name);
  if (!here.length) {
    const elsewhere = [...new Set(assets.flatMap((a) => a.loanIds))].map(label);
    return {
      kind: "refusal",
      text:
        `${said} is not pledged to the ${where.label}, so there is nothing there for the new version to leave behind. ` +
        (elsewhere.length
          ? `This book pledges it to ${elsewhere.join(" and ")}.`
          : "This read carries no pledge of it on the package at all.") +
        " Nothing has been staged and nothing has come off the manifest.",
    };
  }
  return {
    kind: "exclusion",
    delta: pledgeExclusionDelta(here[0], { facilityId: where.id, facilityLabel: where.label }),
    said:
      `${said} will not carry onto the new version of ${where.label}; the booked loan keeps the pledge. ` +
      "The asset and the borrower's ownership of it are relationship records and are not touched.",
  };
}

/* ------------------------------------------ associating an existing covenant */

export type AttachRead =
  | { kind: "attach"; delta: WorkroomDelta }
  /** The org would refuse this one, and by name. Nothing is staged. */
  | { kind: "refusal"; why: string }
  | null;

/**
 * THE THIRD INSTRUMENT, WIRED (P1, founder 2026-09-02).
 *
 * When a test is on the book and NOT on this loan there are three honest ways
 * through it: a new covenant on the loan, ASSOCIATING the existing record to the
 * loan, or a different test. The third chip used to stage a handoff, because
 * `covenantAddsJson` names a covenant TYPE and sending an associate down it
 * would mint a second covenant of the same type and report it as an association.
 * `covenantAttachesJson` is the junction-only arm, so it is a real card now.
 *
 * Null hands it back to the handoff, which is still the honest answer on a
 * renewal and on a new facility: neither of those tools carries the arm.
 *
 * THE TWO REFUSALS ARE THE ORG'S OWN. It refuses a covenant already attached to
 * the facility (the per-loan dedupe, enforced server-side) and a covenant
 * belonging to another relationship. Both are worth saying HERE rather than
 * sending a plan up to have them said: a refusal at the confirm gate is a
 * refusal the banker reads after signing.
 */
export function readCovenantAttach(args: {
  covenantId: string | null | undefined;
  test: string | undefined;
  book: Book;
  facilityId: string;
  facilityLabel: string;
  mode: WorkroomMode;
}): AttachRead {
  if (args.mode !== "modify") return null;
  const named = args.test ?? "that covenant";
  if (!args.covenantId) return null;

  const covenant = args.book.covenants.find((c) => c.id === args.covenantId);
  if (!covenant) {
    return {
      kind: "refusal",
      why:
        `${named} is not a covenant this relationship holds, and a covenant is not moved between relationships by a junction. ` +
        "Associating one means attaching a record the borrower on this package already carries; a test from somewhere else has to be created here as a new covenant.",
    };
  }
  if (covenant.loanIds.includes(args.facilityId)) {
    return {
      kind: "refusal",
      why:
        `${named} is already associated to the ${args.facilityLabel}, and the carry brings that junction onto the clone by itself. ` +
        "There is nothing to author. A second junction for the same covenant on the same facility is a duplicate, and the org refuses one by name.",
    };
  }
  return {
    kind: "attach",
    delta: covenantAttachDelta(covenant, { facilityId: args.facilityId, facilityLabel: args.facilityLabel }),
  };
}

/* ============================================================== the write-back

   THE PLAN NAMES EACH ARM AS ITS OWN STEP PAIR, and the org's numbering is the
   order the arms travelled in:

     covenant_exclusion_{i}   / covenant_exclusion_verify_{i}
     pledge_exclusion_{i}     / pledge_exclusion_verify_{i}
     covenant_associate_{i}   / covenant_associate_verify_{i}

   THE VERIFY STEP IS THE WHOLE POINT ON AN EXCLUSION. An exclusion writes no
   record, so there is no record id to report: what proves it is a re-query on
   BOTH sides, the clone reading zero and the parent still reading one. A removal
   nobody can see is indistinguishable from a removal that did not happen.     */

/** The org's step prefix for each arm. */
const ARM_STEP: Record<ArmKind, string> = {
  covenantExclusion: "covenant_exclusion",
  pledgeExclusion: "pledge_exclusion",
  covenantAttach: "covenant_associate",
};

/** The banker's word for what an arm does, for a sentence about a set of them. */
const ARM_DID: Record<ArmKind, [string, string]> = {
  covenantExclusion: ["covenant left off the new version", "covenants left off the new version"],
  pledgeExclusion: ["pledge left off the new version", "pledges left off the new version"],
  covenantAttach: ["existing covenant associated by junction", "existing covenants associated by junction"],
};

/** One staged arm and the two plan steps that report on it. */
export interface ArmStepPair {
  deltaId: string;
  kind: ArmKind;
  title: string;
  target: string;
  writeStepId: string;
  verifyStepId: string;
}

/**
 * WHICH PLAN STEPS BELONG TO WHICH STAGED ARM.
 *
 * The index is the arm's position among its OWN kind, in the order the payload
 * sent them, which is the order the manifest holds them. That is the same
 * ordering the org numbers by, and it is the only correspondence there is: an
 * exclusion writes no record, so there is no id to match on afterwards.
 */
export function armStepPairs(deltas: WorkroomDelta[]): ArmStepPair[] {
  const seen: Record<ArmKind, number> = { covenantExclusion: 0, pledgeExclusion: 0, covenantAttach: 0 };
  const out: ArmStepPair[] = [];
  for (const delta of deltas) {
    const arm = armOf(delta);
    if (!arm) continue;
    const i = seen[arm.kind];
    seen[arm.kind] += 1;
    out.push({
      deltaId: delta.id,
      kind: arm.kind,
      title: delta.title,
      target: delta.target,
      writeStepId: `${ARM_STEP[arm.kind]}_${i}`,
      verifyStepId: `${ARM_STEP[arm.kind]}_verify_${i}`,
    });
  }
  return out;
}

/** Is this plan step one of the arms', whatever the org labelled it? */
export function isArmStep(stepId: string): boolean {
  return /^(covenant_exclusion|pledge_exclusion|covenant_associate)(_verify)?_\d+$/.test(stepId);
}

/**
 * ONE ARM STEP, IN BANKER LANGUAGE.
 *
 * The ORG's own label wins wherever it sent one: the exclusion step labels carry
 * the banker sentence already ("Carry the covenants of <facility> WITHOUT
 * COV-000662 ...") and paraphrasing the bank's own account of its own write is
 * how a room starts drifting from what actually ran. This composes a sentence
 * only where the label is missing, so a step never reads as a raw id.
 */
export function armStepSentence(step: { id: string; label?: string; state?: string }): string | null {
  if (!isArmStep(step.id)) return null;
  if (step.label?.trim()) return step.label.trim();
  const verify = step.id.includes("_verify_");
  if (step.id.startsWith("covenant_exclusion")) {
    return verify
      ? "Prove the covenant came off: the clone reads no junction for it and the booked facility still reads its own."
      : "Carry the facility's covenants without the named one. Nothing is deleted; the clone starts without that junction.";
  }
  if (step.id.startsWith("pledge_exclusion")) {
    return verify
      ? "Prove the pledge came off: the clone reads no pledge for it and the booked facility still reads its own."
      : "Carry the facility's collateral without the named pledge. The asset and the borrower's ownership of it are not touched.";
  }
  return verify
    ? "Prove the association: the junction reads on the clone and the covenant record reads back unchanged."
    : "Author the loan-covenant junction for the covenant the borrower already holds. No covenant is inserted.";
}

/** `n thing` / `n things`, in banker language. */
const counted = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

/**
 * WHAT THE ARMS DID, FOR THE TRAIL AND FOR THE PLAN SUMMARY.
 *
 * Null where the manifest carries none, so every plan that files nothing new
 * reads exactly as it read before the arms existed. Where it carries some, the
 * sentence counts them apart. A banker reads one set of covenants on the new
 * version whoever authored each record, and the association and the net-new are
 * not the same act.
 */
export function armSummary(deltas: WorkroomDelta[]): string | null {
  const arms = deltas.map(armOf).filter((a): a is ArmEntry => a !== null);
  if (!arms.length) return null;
  const parts: string[] = [];
  for (const kind of ["covenantExclusion", "pledgeExclusion", "covenantAttach"] as ArmKind[]) {
    const n = arms.filter((a) => a.kind === kind).length;
    if (n) parts.push(counted(n, ARM_DID[kind]));
  }
  const excluded = arms.some((a) => a.kind !== "covenantAttach");
  return `${parts.join(", ")}.${excluded ? " Nothing is deleted: the booked facilities keep everything they hold today." : ""}`;
}

/** The case-safe half of a Salesforce id. A read may carry the 15-character
 *  form and a refusal the 18-character one; the shorter is a prefix of the
 *  longer, so matching on it is matching on the record. */
const ID_PREFIX = /^[a-z0-9]{15}/;

/** A step state the org uses for a step that did NOT do what it says. */
const ARM_STEP_FAILED = /^(failed|ambiguous|skipped|refused|not_)/i;

/**
 * WHAT THE ARMS DID, FOR THE TRAIL, READ OFF THE ORG'S OWN PLAN STEPS.
 *
 * {@link armSummary} counts the MANIFEST, which is the right sentence in front
 * of the approval: it says what the plan is being sent to do. It is the wrong
 * sentence afterwards. The engine builds its filed list from the deltas that
 * carry a wire, so an arm is reported as filed whether or not the org ever
 * planned it, and the trail then asserted "1 covenant left off the new version"
 * about a plan with no such step in it.
 *
 * So the trail counts the STEPS. An arm whose write step came back in the plan
 * is one the org took; an arm with no step is named as one the org did not
 * plan, and a step the org marked failed is named as one that did not land.
 * Null where the manifest carries no arm, so every plan that filed before the
 * arms existed reads exactly as it did.
 */
export function armTrailSummary(
  deltas: WorkroomDelta[],
  steps: Array<{ id: string; state?: string }>,
): string | null {
  const pairs = armStepPairs(deltas);
  if (!pairs.length) return null;
  const byId = new Map(steps.map((s) => [s.id, s]));

  const took: ArmStepPair[] = [];
  const unplanned: ArmStepPair[] = [];
  const failed: ArmStepPair[] = [];
  for (const pair of pairs) {
    const step = byId.get(pair.writeStepId);
    if (!step) unplanned.push(pair);
    else if (ARM_STEP_FAILED.test(step.state ?? "")) failed.push(pair);
    else took.push(pair);
  }

  const where = (set: ArmStepPair[]) => set.map((p) => `${p.title} on ${p.target}`).join(", ");
  const said: string[] = [];
  const counts: string[] = [];
  for (const kind of ["covenantExclusion", "pledgeExclusion", "covenantAttach"] as ArmKind[]) {
    const n = took.filter((p) => p.kind === kind).length;
    if (n) counts.push(counted(n, ARM_DID[kind]));
  }
  if (counts.length) {
    said.push(`${counts.join(", ")}.`);
    if (took.some((p) => p.kind !== "covenantAttach")) {
      said.push("Nothing is deleted: the booked facilities keep everything they hold today.");
    }
  }
  if (unplanned.length) {
    said.push(
      `The plan carried no step for ${where(unplanned)}, so the org never planned ${unplanned.length === 1 ? "it" : "them"} and the new version carries ${unplanned.length === 1 ? "it" : "them"} as before.`,
    );
  }
  if (failed.length) {
    said.push(`The org's own step for ${where(failed)} did not verify, so nothing about ${failed.length === 1 ? "it" : "them"} is proved.`);
  }
  return said.join(" ");
}

/**
 * THE ORG REFUSED, AND THE ROOM SAYS SO IN THE ORG'S OWN WORDS.
 *
 * A stage refusal is the ORG's sentence about a precondition, and paraphrasing
 * one has already cost a live session. What the room adds is the part the org
 * cannot know: WHICH entry on this manifest it is about, and that the rest of
 * the plan is exactly where the banker left it. Staging writes nothing, so a
 * refusal here has cost nothing but the round trip.
 *
 * Where nothing on the manifest matches, the org's sentence is returned alone
 * rather than attached to a guess.
 */
export function armStageRefusal(message: string, deltas: WorkroomDelta[]): string {
  const lower = message.toLowerCase();
  /* THE ORG NAMES THE RECORD, NOT THE TITLE. Its refusals read "Covenant
     a3Bbb000000S0bNEAS is not attached to Line of Credit ...": the id it was
     sent, because the id is the only thing the room and the org both hold. A
     title match found the entry only where the covenant type happened to appear
     in the sentence too, and never on a pledge. The id is matched on its first
     fifteen characters so a 15-character read and an 18-character refusal are
     the same record, which is the org's own rule about its own ids. */
  const named = deltas.filter((d) => {
    const arm = armOf(d);
    if (!arm) return false;
    const id = arm.recordId.toLowerCase();
    return lower.includes(ID_PREFIX.exec(id)?.[0] ?? id);
  });
  const rest = deltas.length - named.length;
  if (!named.length) return message;
  const one = named[0];
  return (
    `${message} That is ${one.title} on ${one.target}. Take it off the manifest and the plan goes up without it` +
    `${rest > 0 ? `; the other ${rest === 1 ? "entry is" : `${rest} entries are`} exactly where you left ${rest === 1 ? "it" : "them"}` : ""}. ` +
    "Staging writes nothing, so nothing has been filed and nothing has come off the manifest."
  );
}

/**
 * WHAT THE PLAN SAYS IT WILL DO ABOUT EACH ARM, on the card the approval is
 * taken on.
 *
 * An exclusion writes no record, so its plan STEP is the only thing that says
 * the org took it, and a banker signing a removal should be able to read that
 * before signing rather than after. The ORG's own label wins wherever it sent
 * one; the composed sentence is the fallback for a label that did not arrive,
 * so a step never reads to a banker as a raw id.
 *
 * Empty where the plan carries no arm, which is every plan that filed before
 * the arms existed.
 */
export function armPlanLines(deltas: WorkroomDelta[], steps: Array<{ id: string; label?: string }>): string[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out: string[] = [];
  for (const pair of armStepPairs(deltas)) {
    const step = byId.get(pair.writeStepId);
    if (!step) continue;
    const said = armStepSentence(step);
    if (said) out.push(said);
  }
  return out;
}
