import type { BrainMail } from "../channel/brainLane";
import { bindRelRoute, openRelationshipRoom } from "../components/relationship/relSession";
import { bindFacilityRoute, openFacilityRoom } from "../components/workroom/roomSession";
import { flyName } from "../components/nameFlight";
import type { RelRoute } from "../components/relationship/relRoute";
import type { WorkroomMode } from "../workroom/types";
import { stageFeed } from "./feed";
import { consumedIntent, consumeIntent, markDone, markOpened } from "./store";
import { sourcePhrase, type IntentDoc } from "./contract";

/* =============================================================================
   TAKING AN INTENT.

   FIVE MOVES, IN ORDER, AND NONE OF THEM IS NEW MACHINERY:

     1. the intent leaves the offer list and is stamped `opened` in the store;
     2. the cockpit navigates to the relationship, by the name flight the
        worklist row already uses, so nothing teleports (rule 58);
     3. the room opens on that relationship through its OWN opener, and the
        route is bound through its OWN binder — the same two calls the FAB's
        arc and the command palette make;
     4. the lines are staged on the feed, which the room drains through its own
        `say`;
     5. the context rides the greeting as a mail-shaped block, so the room's
        opening sentence names where the instruction came from.

   NOTHING HERE STAGES, WRITES OR CONFIRMS ANYTHING AT THE ORG. An intent opens
   a room with the work typed into it. Every gate between that and a write is
   exactly where it was.
   ============================================================================= */

const FACILITY_ROUTES = new Set<string>(["modify", "renew", "create"]);

/**
 * THE ELEMENT THE NAME FLIES OUT OF.
 *
 * The worklist row for this relationship, where the banker is standing on the
 * landing and the row is on screen. Absent — a relationship not in the queue, a
 * whisper taken from the account view — the navigation is a plain one, which is
 * what `flyName` itself falls back to.
 */
export function flightSourceFor(accountId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  /* `CSS.escape` is not present in every DOM this code runs in (jsdom among
     them), and an account id is alphanumeric by contract anyway — so anything
     that is not is refused rather than escaped. A selector is never built from
     an unchecked string. */
  if (!/^[A-Za-z0-9]+$/.test(accountId)) return null;
  return document.querySelector<HTMLElement>(`[data-open="${accountId}"] .who b`);
}

/**
 * Open the room an intent names, staged on its lines.
 *
 * @param navigate the cockpit's own OPEN_ACCOUNT dispatch, so this module never
 *                 reaches into the provider.
 */
export function openIntent(args: {
  intent: IntentDoc;
  navigate: (accountId: string) => void;
  /** The viewer, for the store's `openedBy`. Display name only. */
  openedBy?: string;
}): void {
  const { intent, navigate } = args;
  consumeIntent(intent);
  void markOpened(intent, args.openedBy);

  const src = flightSourceFor(intent.accountId);
  const open = () => navigate(intent.accountId);
  if (src) flyName(src, open);
  else open();

  /* THE ROOM OPENS AFTER THE VIEW HAS. The room is a full-surface overlay and
     does not need the account view, but the banker sees the cockpit land on the
     relationship before the glass comes over it — which is the whole reason the
     flight exists. One frame is enough; the flight's own 520ms runs underneath. */
  const raise = () => {
    if (intent.room === "facility" && FACILITY_ROUTES.has(intent.route)) {
      openFacilityRoom({ accountId: intent.accountId, accountName: intent.accountName, opening: null });
      bindFacilityRoute(intent.route as WorkroomMode, { say: null });
    } else {
      openRelationshipRoom({ accountId: intent.accountId, accountName: intent.accountName, opening: null });
      bindRelRoute(intent.route as RelRoute);
    }
    stageFeed({
      room: intent.room,
      accountId: intent.accountId,
      lines: intent.lines,
      intentId: intent.id,
    });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(raise);
  else raise();
}

/**
 * THE CONTEXT, AS A MAIL BLOCK.
 *
 * The greeting envelope already carries the client's own message in a shape the
 * model reads well: who, when, about what, and the gist. An intent's context is
 * the same fact arriving by a different door, so it travels in the same block
 * rather than in a second one the pack has never seen.
 *
 * `source: "intent"` is the honest label. NOTHING here is a mailbox read, and
 * nothing in it is a figure the room may print: it is what someone said,
 * exactly as the swept and live notes are.
 */
export function intentMailNote(intent: IntentDoc | null): BrainMail | null {
  if (!intent) return null;
  const { summary, source } = intent.context;
  const note: BrainMail = { source: "intent" };
  if (source.from) note.from = source.from;
  if (source.received) note.received = source.received;
  note.subject = source.subject ?? `Carried in from ${sourcePhrase(source)}`;
  if (summary) note.gist = summary;
  if (intent.room === "facility") note.route = intent.route as BrainMail["route"];
  return note;
}

/** The intent this room is standing on, where it is this relationship's. */
export function intentFor(accountId: string | null | undefined): IntentDoc | null {
  const intent = consumedIntent();
  return intent && accountId && intent.accountId === accountId ? intent : null;
}

/** A plan was filed on this relationship. If it came from an intent, the intent
 *  is spent. Fire-and-forget: a failed stamp never touches the dossier. */
export function noteFiled(accountId: string | null | undefined): void {
  const intent = intentFor(accountId);
  if (intent) void markDone(intent);
}
