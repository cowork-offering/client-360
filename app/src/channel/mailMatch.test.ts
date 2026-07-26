import { describe, expect, it } from "vitest";
import type { BorrowerBundle, C360Data } from "../data/contract";
import { distinctiveToken, mailboxQuery, matchesAccount, readSender } from "./cockpitTools";
import { unwrapMail } from "./mcp";
import live from "../../../artifact/live-data.json";
import sample from "../../../artifact/sample-data.json";

/* =============================================================================
   THE FOUNDER'S TEST EMAIL NEVER SURFACED.

   The mailbox was queried with the FULL legal name and a hit only counted when
   that whole cleaned name appeared as a contiguous substring. "Test for
   Hartwell" cannot contain "hartwell precision manufacturing", so a message
   written the way a human writes one matched nothing.

   The fix has to widen the net WITHOUT attaching mail to the wrong
   relationship, which is the failure that actually costs someone something. So
   both directions are tested: the real message attaches, and the generic one
   attaches to nobody.
   ============================================================================= */

const FILES: Array<[string, C360Data]> = [
  ["live-data.json", live as unknown as C360Data],
  ["sample-data.json", sample as unknown as C360Data],
];

const everyBorrower: Array<[string, string]> = FILES.flatMap(([file, data]) =>
  Object.values(data.borrowers ?? {}).map(
    (b) => [file, (b as BorrowerBundle).snapshot?.name ?? ""] as [string, string],
  ),
).filter(([, name]) => name);

const hit = (subject: string, preview = "", from = "") => ({ subject, preview, from });

describe("the founder's message, on the real account", () => {
  const HARTWELL = "Hartwell Precision Manufacturing LLC";

  it("queries the distinctive token, not the legal name", () => {
    expect(mailboxQuery(HARTWELL)).toBe("hartwell");
    expect(mailboxQuery("Piedmont Precision Components, Inc.")).toBe("piedmont");
  });

  it("attaches a subject a human would actually write", () => {
    expect(matchesAccount(hit("Test for Hartwell"), HARTWELL)).toBe(true);
    expect(matchesAccount(hit("Re: Hartwell covenant question"), HARTWELL)).toBe(true);
    expect(matchesAccount(hit("Quick question", "Following up on the Hartwell facility"), HARTWELL)).toBe(true);
  });

  it("attaches on the sender when the subject says nothing", () => {
    expect(matchesAccount(hit("Docs attached", "", "cfo@hartwell.com"), HARTWELL)).toBe(true);
  });

  it("still attaches the full legal name", () => {
    expect(matchesAccount(hit("Hartwell Precision Manufacturing LLC — Q3 pack"), HARTWELL)).toBe(true);
  });
});

describe("a generic word attaches a message to NOBODY", () => {
  const HARTWELL = "Hartwell Precision Manufacturing LLC";
  const PIEDMONT = "Piedmont Precision Components, Inc.";

  it("does not attach 'precision components' to Hartwell", () => {
    expect(matchesAccount(hit("precision components enquiry"), HARTWELL)).toBe(false);
  });

  it("does not attach 'Hartwell' to Piedmont", () => {
    expect(matchesAccount(hit("Test for Hartwell"), PIEDMONT)).toBe(false);
  });

  it("does not attach on any shared word", () => {
    for (const subject of ["precision", "manufacturing update", "industrial holdings", "group services"]) {
      expect(matchesAccount(hit(subject), HARTWELL), subject).toBe(false);
      expect(matchesAccount(hit(subject), PIEDMONT), subject).toBe(false);
    }
  });

  it("does not attach on a word that merely contains the token", () => {
    // "hartwellian" is not Hartwell.
    expect(matchesAccount(hit("hartwellian economics"), HARTWELL)).toBe(false);
  });

  it("attaches nothing at all when the name yields no distinctive token", () => {
    const generic = "Precision Manufacturing Group LLC";
    expect(distinctiveToken(generic)).toBeNull();
    expect(matchesAccount(hit("precision manufacturing group"), generic)).toBe(true); // full phrase, the strong tier
    expect(matchesAccount(hit("precision"), generic)).toBe(false);
    expect(matchesAccount(hit("anything else"), generic)).toBe(false);
  });
});

describe("every borrower gets a usable, non-colliding token", () => {
  it("derives one for each", () => {
    for (const [file, name] of everyBorrower) {
      const token = distinctiveToken(name);
      expect(token, `${name} (${file}) has no distinctive token`).toBeTruthy();
      expect(token!.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("no borrower's token attaches another borrower's mail", () => {
    for (const [, name] of everyBorrower) {
      const token = distinctiveToken(name)!;
      for (const [, other] of everyBorrower) {
        if (other === name) continue;
        const otherToken = distinctiveToken(other)!;
        if (otherToken === token) continue; // same token = same relationship name
        expect(matchesAccount(hit(`Note about ${token}`), other), `${token} leaked into ${other}`).toBe(false);
      }
    }
  });

  it("each borrower's own token attaches its own mail", () => {
    for (const [file, name] of everyBorrower) {
      const token = distinctiveToken(name)!;
      expect(matchesAccount(hit(`Test for ${token}`), name), `${name} (${file}) missed its own mail`).toBe(true);
    }
  });

  it("handles a person account, which has no legal suffix to strip", () => {
    expect(distinctiveToken("Margaret Holloway")).toBe("margaret");
    expect(matchesAccount(hit("Call with Margaret"), "Margaret Holloway")).toBe(true);
    expect(matchesAccount(hit("Call with Margaret"), "Robert Ainsley")).toBe(false);
  });
});

describe("Graph returns a sender object, not a string", () => {
  it("reads the Graph shape", () => {
    expect(readSender({ emailAddress: { name: "Jane Doe", address: "jane@x.com" } })).toBe("Jane Doe");
    expect(readSender({ emailAddress: { address: "jane@x.com" } })).toBe("jane@x.com");
  });

  it("still reads a plain string", () => {
    expect(readSender("jane@x.com")).toBe("jane@x.com");
  });

  it("renders nothing rather than something wrong", () => {
    expect(readSender(undefined)).toBeUndefined();
    expect(readSender({})).toBeUndefined();
    expect(readSender({ emailAddress: {} })).toBeUndefined();
  });

  it("matches on a sender the Graph shape carried", () => {
    // The blank-sender bug also blinded the matcher: an object `from` became
    // undefined, so a message identified only by its sender matched nothing.
    const sender = readSender({ emailAddress: { name: "Hartwell Treasury", address: "ap@hartwell.com" } });
    expect(matchesAccount({ subject: "Invoice", preview: "", from: sender }, "Hartwell Precision Manufacturing LLC")).toBe(true);
  });
});


/* =============================================================================
   THE UNWRAP. The matcher was never the problem: a search matching exactly ONE
   email answers with a BARE OBJECT, which the unwrapper read as no results at
   all. The founder's test email was found by the tool and discarded by us.

   Structures below are the observed ones; values are synthetic.
   ============================================================================= */

/** The observed row shape, with synthetic values. */
const row = (over: Record<string, unknown> = {}) => ({
  uri: "mail://synthetic/1",
  id: "SYNTHETIC-ID-1",
  subject: "Test for Hartwell",
  sender: "someone@example.com",
  recipients: ["banker@example.com"],
  receivedDateTime: "2026-07-27T09:00:00Z",
  sentDateTime: "2026-07-27T08:59:00Z",
  summary: "Checking the Hartwell facility ahead of the review.",
  hasAttachments: false,
  importance: "normal",
  isRead: false,
  webLink: "https://example.com/mail/1",
  internetMessageId: "<synthetic@example.com>",
  offset: 0,
  ...over,
});

describe("unwrapMail reads every shape the search answers in", () => {
  it("reads a BARE OBJECT as one message: the founder's case", () => {
    const rows = unwrapMail(row());
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe("Test for Hartwell");
  });

  it("reads an array unchanged", () => {
    expect(unwrapMail([row(), row({ id: "SYNTHETIC-ID-2" })])).toHaveLength(2);
  });

  it("reads the wrapper keys", () => {
    for (const key of ["value", "results", "messages", "items"]) {
      expect(unwrapMail({ [key]: [row()] }), key).toHaveLength(1);
      // A wrapper around a single object is still a single result.
      expect(unwrapMail({ [key]: row() }), `${key} (bare)`).toHaveLength(1);
    }
  });

  it("reads a JSON string payload", () => {
    expect(unwrapMail(JSON.stringify(row()))).toHaveLength(1);
    expect(unwrapMail(JSON.stringify([row(), row({ id: "2" })]))).toHaveLength(2);
  });

  it("reads a JSONL string payload", () => {
    const jsonl = [JSON.stringify(row()), JSON.stringify(row({ id: "SYNTHETIC-ID-2" }))].join("\n");
    expect(unwrapMail(jsonl)).toHaveLength(2);
  });

  it("skips a JSONL line that will not parse, rather than guessing at it", () => {
    const jsonl = [JSON.stringify(row()), "{not json", JSON.stringify(row({ id: "2" }))].join("\n");
    expect(unwrapMail(jsonl)).toHaveLength(2);
  });

  it("DROPS a pagination tail instead of rendering an empty message", () => {
    expect(unwrapMail([row(), { nextOffset: 25 }])).toHaveLength(1);
    expect(unwrapMail([row(), { nextCursor: "abc" }])).toHaveLength(1);
    expect(unwrapMail({ nextOffset: 25 })).toEqual([]);
  });

  it("still reads no matches as an honest empty list", () => {
    for (const empty of [[], {}, null, undefined, ""]) {
      expect(unwrapMail(empty), JSON.stringify(empty)).toEqual([]);
    }
  });
});

describe("the founder's scenario, end to end through the mapper", () => {
  const HARTWELL = "Hartwell Precision Manufacturing LLC";

  /** The mapping searchMailbox performs, over the observed field names. */
  const toHit = (m: Record<string, unknown>) => ({
    id: (m.id as string) ?? undefined,
    subject: (m.subject as string) ?? undefined,
    from: readSender(m.sender) ?? readSender(m.from),
    receivedAt: (m.receivedDateTime as string) ?? (m.sentDateTime as string),
    preview: (m.summary as string) ?? (m.bodyPreview as string),
    webLink: (m.webLink as string) ?? undefined,
  });

  it("one email in, one matched activity entry out", () => {
    const rows = unwrapMail(row());
    expect(rows).toHaveLength(1);
    const hits = rows.map(toHit);
    expect(hits[0].preview).toContain("Hartwell facility");
    expect(hits[0].from).toBe("someone@example.com");
    const matched = hits.filter((h) => matchesAccount(h, HARTWELL));
    expect(matched).toHaveLength(1);
  });

  it("matches on the summary alone when the subject says nothing", () => {
    const rows = unwrapMail(row({ subject: "Following up" }));
    const hits = rows.map(toHit);
    expect(matchesAccount(hits[0], HARTWELL)).toBe(true);
  });

  it("does not attach that same email to another relationship", () => {
    const hits = unwrapMail(row()).map(toHit);
    expect(matchesAccount(hits[0], "Piedmont Precision Components, Inc.")).toBe(false);
  });

  it("carries the link and the timestamp the entry needs", () => {
    const hit = unwrapMail(row()).map(toHit)[0];
    expect(hit.webLink).toBeTruthy();
    expect(hit.receivedAt).toBe("2026-07-27T09:00:00Z");
  });
});
