import type { BrainEnvelope, BrainFacility, BrainFileable, BrainMail, BrainTurn } from "../../channel/brainLane";
import { capEnvelope } from "../../channel/brainLane";
import type { Facility } from "../../data/contract";
import { facilityProduct } from "../../data/facilityStage";
import { fmtMoney } from "../../data/format";
import { isActiveFacility } from "../../data/worklist";
import { buildReadBlocks, threadDigest } from "../workroom/readBlocks";
import type { ReadSource } from "../workroom/readCard";
import { relEntities, type RelBook } from "./relBook";
import { CREATE_GAPS, DUAL_RATING_NOT_CARRIED, OVERRIDE_NEEDS_A_REASON, type RelContext } from "./reviewFlows";
import { FACILITY_HANDOFF, REL_ROUTE_WORD, type RelRoute } from "./relRoute";

/* =============================================================================
   THE RELATIONSHIP ROOM'S ENVELOPE.

   The same v2 envelope the facility room sends, in this room's own vocabulary:
   five routes rather than three, a governance ritual rather than a change set,
   and a FILEABLE MAP that matters more here than anywhere else.

   THE REFUSALS ARE THE POINT. This room's honesty is that it names what the org
   cannot file (a standalone covenant on the relationship, an owned but
   unpledged asset, a grade override with no observed wire name) instead of
   composing a payload nobody deployed. A desk answering for this room must
   refuse the SAME things BY NAME, so the map travels with every line. A brain
   that invented one of these capabilities would be worse than the deterministic
   room it replaced.
   ============================================================================= */

/** The five routes, as words a reply may NAME while the question is open. */
export const REL_ROUTE_WORDS = new Set<string>(["annual", "covenant", "valuation", "rating", "service"]);

/** What each review produces, in the org's own terms. Read from the room's own
 *  route vocabulary rather than written a second time. */
const PRODUCES: Record<RelRoute, string> = {
  annual: "an annual review assessment against the product package",
  covenant: "an assessment on covenants that already exist",
  valuation: "a valuation on collateral that already exists",
  rating: "a risk-rating review against the relationship",
  service: "a service request case",
};

/** The facilities the relationship carries, scoped to its package. The same
 *  scoping every read in the room uses, so the envelope and the glass agree. */
function facilitiesOf(ctx: RelContext): BrainFacility[] {
  return (ctx.bundle?.exposure?.facilities ?? [])
    .filter(isActiveFacility)
    .filter((f: Facility) => !ctx.productPackageId || f.productPackageId === ctx.productPackageId)
    .filter((f: Facility) => Boolean(f.loanId))
    .map((f: Facility) => ({
      loanId: f.loanId as string,
      label: facilityProduct(f, ctx.accountName) || "Facility",
      commitment: typeof f.committed === "number" ? fmtMoney(f.committed) : "not carried",
    }));
}

/** WHAT THIS ROUTE CAN AND CANNOT FILE, verbatim from the room's own gaps. */
function relFileable(route: RelRoute | null): BrainFileable {
  const cannot: BrainFileable["cannot"] = [
    { what: "any change to a facility", why: FACILITY_HANDOFF },
  ];
  if (route === "covenant" || route === null) {
    cannot.push({ what: CREATE_GAPS.covenant.what, why: CREATE_GAPS.covenant.line });
  }
  if (route === "valuation" || route === null) {
    cannot.push({ what: CREATE_GAPS.collateral.what, why: CREATE_GAPS.collateral.line });
  }
  /* THE OVERRIDE IS OFF THIS LIST. It was on it, on the reasoning that the
     input's wire name had never been observed; it is deployed and tested, so
     the room collects it. What the desk must still refuse BY NAME is an
     override with no written reason, and a dual rating this org does not hold. */
  if (route === "rating" || route === null) {
    cannot.push({ what: "a grade override with no written reason", why: OVERRIDE_NEEDS_A_REASON });
    cannot.push({ what: "a probability of default or loss given default", why: DUAL_RATING_NOT_CARRIED });
  }
  return {
    files: route ? [PRODUCES[route]] : Object.values(PRODUCES),
    cannot,
  };
}

export function buildRelEnvelope(args: {
  line: string;
  route: RelRoute | null;
  ctx: RelContext;
  reads?: ReadSource;
  thread?: BrainTurn[];
  /** What the review has collected so far: the question, and the answer given. */
  collected: Array<{ title: string; target: string; after: string }>;
  /** THE CLIENT'S OWN MESSAGE, where this room found one. Top level on the
   *  envelope, never inside `reads`: it is a request, not a read, and no figure
   *  the room prints ever comes from it. */
  mail?: BrainMail | null;
  /** The book this relationship already carries, for the greeting's own rail. */
  book?: RelBook | null;
}): BrainEnvelope {
  const routeOpen = args.route === null;
  const mail = args.mail ?? undefined;
  const entities = args.book ? relEntities(args.book) : [];
  return capEnvelope({
    v: 2,
    line: args.line,
    room: "relationship",
    relationship: args.ctx.accountName,
    route: args.route ? REL_ROUTE_WORD[args.route] : "unbound",
    routeOpen: routeOpen || undefined,
    routeOptions: routeOpen ? [...REL_ROUTE_WORDS] : undefined,
    // This room is anchored on the RELATIONSHIP; the package is what its bulk
    // tools file against, and it is named rather than given a label of its own.
    packageName: args.ctx.productPackageId ? "the relationship's product package" : "no product package on this relationship",
    productPackageId: args.ctx.productPackageId,
    // NOTHING IS "SELECTED" IN A REVIEW. The ritual runs over the relationship,
    // and a facility named here would read as a target it does not have.
    selectedFacility: null,
    facilities: facilitiesOf(args.ctx),
    staged: args.collected,
    /* `hasMail` adds the one line to `notCarried` that lets a reply refuse a
       THREAD by name: this room reads one message, never a conversation. */
    reads: buildReadBlocks(args.reads, Boolean(mail)),
    mail,
    entities: entities.length ? entities : undefined,
    thread: args.thread ? threadDigest(args.thread) : undefined,
    fileable: relFileable(args.route),
    grounding: "plugin-skill:workroom-brain",
  });
}
