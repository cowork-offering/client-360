import { describe, expect, it } from "vitest";
import { FIELD_EXAM_BODY, FIELD_EXAM_OFFER, asksForFieldExam, fieldExamBodyOption } from "./fieldExam";
import { asksForFacilityWork, readRelRouteIntent, readsAsClientRequest } from "./relRoute";

/* =============================================================================
   THE FIELD EXAM, WHICH IS NOT ONE OF THE FIVE.

   Two things are held. That every name a banker gives this piece of work
   reaches the honest sentence, and that the read stays NARROW: it must not
   catch a line that names one of the five reviews, a line that is facility
   work, or a line the client-request offer already answers. A sixth read that
   shadowed the route words would be worse than the menu it replaced.
   ============================================================================= */

/** The phrasings the room has to recognise, bare and inside a sentence. */
const ASKS = [
  "field exam",
  "borrowing base field examination",
  "field audit",
  "collateral audit",
  "AR audit",
  "inventory count",
  "can we get a field exam scheduled on the borrowing base",
  "the credit officer wants an a/r audit before the renewal",
  "we should run an inventory count at the Fort Wayne plant",
  "book a collateral audit for Q4",
];

/** Lines that must NOT reach it: each one already has an answer. */
const NOT_ASKS = [
  "collateral valuation",
  "revalue the collateral",
  "run the covenant review",
  "what collateral is on this relationship",
  "pledge the equipment to the 8M loan",
  "james wants the june certificate",
  "the inventory is worth 8 million",
  "which covenants are we assessing",
];

describe("every name a banker gives the exam reaches the same sentence", () => {
  for (const line of ASKS) {
    it(`reads "${line}" as a field exam`, () => {
      expect(asksForFieldExam(line)).toBe(true);
    });
  }

  it("names none of the five, which is why the router leaves them all unbound", () => {
    // The route read runs FIRST in the room. If any phrasing bound a route the
    // honesty line would never be reached, so this is the precedence proof.
    for (const line of ASKS) expect(readRelRouteIntent(line), line).toBeNull();
  });

  it("states what the room cannot do before what it can", () => {
    expect(FIELD_EXAM_OFFER).toBe(
      "A field exam is not something this room files. I can stage a service request for the exam, or open a covenant review on the borrowing base.",
    );
  });
});

describe("the read stays narrow", () => {
  for (const line of NOT_ASKS) {
    it(`leaves "${line}" alone`, () => {
      expect(asksForFieldExam(line)).toBe(false);
    });
  }

  it("takes nothing away from the facility handoff or the client request offer", () => {
    expect(asksForFacilityWork("pledge the equipment to the 8M loan")).toBe(true);
    expect(readsAsClientRequest("james wants the june certificate")).toBe(true);
    expect(asksForFieldExam("")).toBe(false);
  });
});

describe("the body is offered on the service flow, never written silently", () => {
  it("offers it where the subject the banker answered reads as a field exam", () => {
    const options = fieldExamBodyOption("can we get a field exam scheduled on the borrowing base")!;
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe(FIELD_EXAM_BODY);
    expect(options[0].label).toBe(FIELD_EXAM_BODY);
  });

  it("offers nothing on any other subject, and nothing on an unanswered step", () => {
    expect(fieldExamBodyOption("james wants the june certificate")).toBeUndefined();
    expect(fieldExamBodyOption(undefined)).toBeUndefined();
    expect(fieldExamBodyOption(42)).toBeUndefined();
  });

  it("leaves the scope and the period to the examiner rather than composing them", () => {
    expect(FIELD_EXAM_BODY).toContain("scope and period set by the examiner");
    // No date, no turnaround, no figure: none of it is a fact this room holds.
    expect(FIELD_EXAM_BODY).not.toMatch(/\d/);
  });
});
