import { describe, expect, it } from "vitest";
import {
  MAIL_GIST_CHARS,
  MAIL_SUBJECT_CHARS,
  mailNoteFromBundle,
  mailNoteFromHits,
} from "./clientMail";
import type { BorrowerBundle } from "../../data/contract";
import type { MailHit } from "../../channel/cockpitTools";

/* =============================================================================
   THE CLIENT'S MAIL, ON THE ENVELOPE.

   THE MAIL IS ANY MAIL. A renewal, a new facility, covenant relief, a
   valuation, a question, a complaint, a notice with no credit action in it at
   all: the block carries what was written and the route word only where the
   room's own reader finds one. It never carries a figure as a fact, it never
   carries a second message's text, and it never infers a person.
   ============================================================================= */

const ACCOUNT = "Hartwell Precision Manufacturing LLC";
const BOOK = "2026-07-25T21:04:49Z";

const hit = (over: Partial<MailHit>): MailHit => ({
  id: "m1",
  subject: "Hartwell facilities",
  from: "james@hartwellprecision.com",
  receivedAt: "2026-07-20T09:00:00Z",
  ...over,
});

describe("the mail a sweep already landed, read off the bundle", () => {
  /** The Sterling-shaped block the sync sweep patches onto a bundle. */
  const swept = {
    requests: [
      {
        id: "req-1",
        channel: "email",
        receivedAt: "2026-07-22T02:21:49Z",
        summary: "Hartwell requests an increase to the Line of Credit from $15.0M to $20.0M.",
        ask: { type: "facility_increase", from: 15_000_000, to: 20_000_000, facilityName: "Line of Credit" },
        reference: { kind: "m365-message", id: "MSG-1" },
        status: "under_review",
      },
    ],
    activity: [
      {
        id: "act-1",
        ts: "2026-07-22T02:21:49Z",
        kind: "REQUEST_RECEIVED",
        title: "Line increase request received",
        summary: "Asked to raise the Line of Credit ahead of a building programme.",
        actor: "James Hartwell",
        reference: { kind: "m365-message", id: "MSG-1" },
      },
    ],
  } as unknown as BorrowerBundle;

  it("joins the request and its activity entry: subject, date, sender and gist", () => {
    const note = mailNoteFromBundle(swept, BOOK)!;
    expect(note.source).toBe("swept");
    expect(note.from).toBe("James Hartwell");
    expect(note.received).toBe("Jul 22, 2026");
    expect(note.subject).toContain("increase to the Line of Credit");
    expect(note.gist).toContain("building programme");
  });

  it("labels the client's figure as THEIRS, and carries no book figure at all", () => {
    const note = mailNoteFromBundle(swept, BOOK)!;
    expect(note.asked).toEqual({ from: "$15M", to: "$20M", facility: "Line of Credit" });
    // Nothing on the block is a read. The room's own figures live in `reads`.
    expect(Object.keys(note)).not.toContain("measured");
  });

  it("is null where the bundle carries no request at all", () => {
    expect(mailNoteFromBundle({} as BorrowerBundle, BOOK)).toBeNull();
    expect(mailNoteFromBundle(null, BOOK)).toBeNull();
  });
});

describe("the mail a live read found", () => {
  it("takes the most recent match and COUNTS the rest, never their text", () => {
    const note = mailNoteFromHits(
      [
        hit({ id: "a", subject: "Hartwell covenant certificate", receivedAt: "2026-07-10T09:00:00Z" }),
        hit({ id: "b", subject: "Hartwell equipment loan", receivedAt: "2026-07-20T09:00:00Z" }),
        hit({ id: "c", subject: "Piedmont pricing", receivedAt: "2026-07-24T09:00:00Z" }),
      ],
      ACCOUNT,
      BOOK,
    )!;
    expect(note.subject).toBe("Hartwell equipment loan");
    expect(note.more).toBe(1);
    expect(JSON.stringify(note)).not.toContain("covenant certificate");
    // "Piedmont pricing" belongs to nobody here: the matcher never took it.
    expect(JSON.stringify(note)).not.toContain("Piedmont");
  });

  it("KEEPS a message newer than the book, and says the read predates it", () => {
    // The founder's own seeded mail is dated a day after `meta.generatedAt`.
    // The old tier discarded it, which is why it rendered nothing at all.
    const note = mailNoteFromHits([hit({ receivedAt: "2026-07-26T23:29:36Z" })], ACCOUNT, BOOK)!;
    expect(note.arrivedAfterBook).toBe(true);
    expect(mailNoteFromHits([hit({ receivedAt: "2026-07-20T09:00:00Z" })], ACCOUNT, BOOK)!.arrivedAfterBook).toBeUndefined();
  });

  it("reads the ROUTE the message points at, and none where it points at nothing", () => {
    const renewal = mailNoteFromHits(
      [hit({ subject: "Hartwell equipment loan", preview: "Can we renew the equipment loan when it matures?" })],
      ACCOUNT,
      BOOK,
    )!;
    expect(renewal.route).toBe("renew");

    const created = mailNoteFromHits(
      [hit({ subject: "Hartwell", preview: "We would like a new facility for the second site." })],
      ACCOUNT,
      BOOK,
    )!;
    expect(created.route).toBe("create");

    // A QUESTION IS NOT A CREDIT ACTION. No route, and the model is told to
    // mention it and stop rather than offer a move nobody asked for.
    const asked = mailNoteFromHits(
      [hit({ subject: "Hartwell", preview: "Could you send a copy of the June covenant certificate?" })],
      ACCOUNT,
      BOOK,
    )!;
    expect(asked.route).toBeUndefined();
  });

  it("never invents a sender, a date or a body it was not given", () => {
    const bare = mailNoteFromHits([{ id: "x", subject: "Hartwell" }], ACCOUNT, BOOK)!;
    expect(bare.from).toBeUndefined();
    expect(bare.received).toBeUndefined();
    expect(bare.gist).toBeUndefined();
    expect(bare.subject).toBe("Hartwell");
  });

  it("is null on an empty mailbox and on hits that belong to nobody", () => {
    expect(mailNoteFromHits([], ACCOUNT, BOOK)).toBeNull();
    expect(mailNoteFromHits([hit({ subject: "precision components pricing", from: "x@y.z" })], ACCOUNT, BOOK)).toBeNull();
  });

  it("clips the subject and the gist to their caps, on a word boundary", () => {
    const note = mailNoteFromHits(
      [hit({ subject: `Hartwell ${"word ".repeat(60)}`, preview: `Hartwell ${"clause ".repeat(120)}` })],
      ACCOUNT,
      BOOK,
    )!;
    expect(note.subject!.length).toBeLessThanOrEqual(MAIL_SUBJECT_CHARS + 3);
    expect(note.gist!.length).toBeLessThanOrEqual(MAIL_GIST_CHARS + 3);
    expect(note.subject).toMatch(/\.\.\.$/);
  });
});
