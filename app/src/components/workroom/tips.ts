import { useEffect, useState } from "react";
import type { BorrowerBundle, Covenant } from "../../data/contract";
import { dayDiff } from "../../data/time";
import { mcpAvailable } from "../../channel/mcp";
import { matchesAccount, searchMailbox } from "../../channel/cockpitTools";

/* =============================================================================
   THE TWO QUIET TIERS UNDER THE CONVERSATION.

   The founder opened the room expecting to be told what was already wrong with
   the deal, and the room led on the renewal clock and nothing else. Two sources
   it was not using:

     1. OVERDUE COVENANT TESTS. `deriveNextMove` excludes them ON PURPOSE - its
        opener leads on what is COMING, not on what was missed, and that rule is
        right for the opener. But a test that is late is a fact the room holds
        and was not saying. So it is derived HERE, in the room layer, off the
        same covenant rows the engine reads. `app/src/workroom/nextMove.ts` is
        not touched, and there is no second copy of its ranking here: this is a
        tier the opener deliberately does not have.

     2. THE CLIENT'S UNANSWERED MAIL. The artifact declares the Microsoft 365
        connector and the cockpit already has one mail reader (`searchMailbox`).
        The room asks it once, in the background.

   HONEST STATES ARE THE WHOLE DESIGN. No channel, no signal, an error, a
   relationship whose name yields no distinctive token: NOTHING renders. No
   placeholder, no spinner, no "checking your mailbox". A suggestion that
   appears whether or not there is anything to suggest is decoration, and this
   room has none.

   ONE OF EACH, AT MOST. The deal-derived tier leads; the mail is the quiet
   second voice. Never a list.
   ============================================================================= */

export interface Tip {
  /** The one line, stated as a fact. */
  line: string;
  /** What the chip says, and the instruction it SAYS on the banker's behalf.
   *  The instruction goes through the room's own path exactly as a typed line
   *  does, so a chip can do nothing the banker could not have said. */
  chip: { label: string; say: string };
}

/* -------------------------------------------------------- overdue covenants */

/** How late a test is, in days, or null where the read cannot say. Negative
 *  days on `nextEvaluationDate` IS the overdue signal: the schedule has passed
 *  and no completed assessment moved it on. */
function daysOverdue(c: Covenant, today: string): number | null {
  const d = dayDiff(c.nextEvaluationDate, today);
  return d !== null && d < 0 ? -d : null;
}

/**
 * THE MOST OVERDUE TEST ON THE PACKAGE, or null.
 *
 * Ties favour the covenant type name alphabetically, which is the same
 * deterministic tiebreak `nextMove`'s own covenant tier uses over no other
 * signal to break on. A WAIVED test is excluded: a waiver is a decision not to
 * enforce, and reporting it as overdue would contradict the decision.
 */
export function overdueCovenantTip(args: {
  bundle: BorrowerBundle | null;
  /** `meta.generatedAt`. Nothing here reaches a clock. */
  today: string;
}): Tip | null {
  if (!args.today) return null;
  const candidates = (args.bundle?.covenants?.covenants ?? [])
    .map((c) => ({ c, late: daysOverdue(c, args.today) }))
    .filter((x): x is { c: Covenant; late: number } => x.late !== null)
    .filter((x) => (x.c.latestComplianceStatus ?? x.c.covenantStatus ?? "").toLowerCase() !== "waived");
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.late - a.late || (a.c.covenantType ?? "").localeCompare(b.c.covenantType ?? ""));
  const { c, late } = candidates[0];
  const type = (c.covenantType ?? "").trim();
  const subject = type ? `${type} test` : "covenant test";
  return {
    line: `The ${subject} is ${late === 1 ? "1 day" : `${late} days`} overdue.`,
    // THE CHIP IS A READ, NOT A CURE. What an overdue test needs is a decision
    // this room does not make for anyone - a waiver, an amended threshold, a
    // chased document are three different answers. So the chip opens the
    // covenants the room CAN show, and the card's own follow-up carries on into
    // the amend op. A chip that proposed one of the three would be the room
    // deciding.
    chip: { label: "Show the covenants", say: "show me the covenants" },
  };
}

/* ------------------------------------------------------- unanswered client mail

   THE ROOM ASKS THE CHANNEL, ONCE, IN THE BACKGROUND. `searchMailbox` is the
   cockpit's one mail reader and `matchesAccount` is its one matcher; a second
   copy of either here is a second way for a message to attach to the wrong
   relationship, which is the failure that actually costs someone something.  */

/** Past this a message is not "recent correspondence" any more. */
const RECENT_DAYS = 30;

/**
 * The mail signal, resolved from hits the matcher already accepted.
 *
 * Pure, so the shaping is testable without a channel. Null on no hits, on hits
 * that belong to nobody, and on hits with no readable date — an "awaiting a
 * reply for ? days" line is worse than no line.
 */
export function mailTipFrom(args: {
  hits: Array<{ from?: string; receivedAt?: string; subject?: string }>;
  accountName: string;
  today: string;
}): Tip | null {
  if (!args.today) return null;
  const ages = args.hits
    .filter((h) => matchesAccount(h, args.accountName))
    .map((h) => dayDiff(h.receivedAt, args.today))
    .filter((d): d is number => d !== null && d <= 0 && -d <= RECENT_DAYS)
    .map((d) => -d);
  if (!ages.length) return null;
  const oldest = Math.max(...ages);
  const count = ages.length;
  // THE NAME THE BANKER USES, not the legal one. The card above already says
  // which relationship this is; the line is about the mail.
  const who = args.accountName.split(/\s+/)[0];
  return {
    line: `${count} ${count === 1 ? "email" : "emails"} from ${who} ${count === 1 ? "awaits" : "await"} a reply, oldest ${oldest === 1 ? "1 day" : `${oldest} days`}.`,
    chip: {
      label: "Open the thread",
      say: `Summarise the recent correspondence from ${args.accountName} and what it is asking for.`,
    },
  };
}

/**
 * THE MAIL TIP, OR NOTHING.
 *
 * One read per room, on mount, discarded if the room closes first. Every
 * failure path is SILENT to the banker: no connector, no distinctive token, a
 * refused call, an empty mailbox — the hook stays null and the room renders one
 * line fewer. The banker is never told the room went looking.
 */
export function useMailTip(args: { accountName: string; today: string }): Tip | null {
  const [tip, setTip] = useState<Tip | null>(null);
  const { accountName, today } = args;

  useEffect(() => {
    // NO CHANNEL IS NOT AN ERROR STATE, it is the common one. The room asks
    // nothing and says nothing.
    if (!accountName || !today || !mcpAvailable()) return;
    let live = true;
    void (async () => {
      try {
        const { hits } = await searchMailbox(accountName);
        if (live) setTip(mailTipFrom({ hits, accountName, today }));
      } catch {
        // Silent by contract. A banker who is told the mailbox could not be
        // reached learns nothing they can act on inside a credit workroom.
      }
    })();
    return () => {
      live = false;
    };
  }, [accountName, today]);

  return tip;
}
