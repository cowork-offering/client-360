import { describe, expect, it } from "vitest";
import { workroomActivityEntry } from "./executedActivity";
import type { WorkroomExecution } from "../workroom/types";

/* =============================================================================
   AN EXECUTED WORKROOM PLAN, IN THE CLIENT'S TRAIL (A30, extended).

   The room's toast has said "logged to the activity trail" since it shipped.
   These hold the entry it was promising to the same rules every other executed
   action's entry is held to: it is written from what the room already had, it
   never claims a filing that did not happen, and it never fabricates a host.
   ============================================================================= */

const INSTANCE = "https://bankinggpt.lightning.force.com";
const PACKAGE_ID = "a5Fbb000000IHFJEA4";
const HREF = `${INSTANCE}/lightning/r/LLC_BI__Product_Package__c/${PACKAGE_ID}/view`;
const NOW = () => new Date("2026-09-01T09:14:00.000Z");

const execution = (over: Partial<WorkroomExecution> = {}): WorkroomExecution => ({
  filed: [
    { deltaId: "d1", recordId: "a4Zbb0000027NpMEAU", verification: "Commitment applied to the clone." },
    { deltaId: "d2", recordId: "a4Zbb0000027NpMEAU", verification: "Maturity applied to the clone." },
  ],
  tokenNote: "Token redeemed by Fabian Goetzens · single use · 4 of 4 plan steps verified",
  ...over,
});

const base = {
  changeCount: 2,
  packageName: "Hartwell Industrial C&I Credit Package",
  approver: "Fabian Goetzens",
  packageHref: HREF,
  productPackageId: PACKAGE_ID,
  now: NOW,
};

describe("the entry states the modification, its count and its approver", () => {
  it("names the modification, the package and the change count", () => {
    const e = workroomActivityEntry({ execution: execution(), ...base })!;
    expect(e.kind).toBe("ACTION_EXECUTED");
    expect(e.title).toBe("Modification executed on Hartwell Industrial C&I Credit Package");
    expect(e.summary).toBe("2 changes filed, approved by Fabian Goetzens.");
    expect(e.actor).toBe("Fabian Goetzens");
    expect(e.ts).toBe("2026-09-01T09:14:00.000Z");
  });

  it("counts one change in the singular, because a trail is read by people", () => {
    const one = execution({ filed: [{ deltaId: "d1", recordId: "a4Zbb0000027NpMEAU", verification: "Applied." }] });
    const e = workroomActivityEntry({ execution: one, ...base, changeCount: 1 })!;
    expect(e.summary).toBe("1 change filed, approved by Fabian Goetzens.");
  });

  it("carries the org's own verification lines and the token note in the detail", () => {
    const e = workroomActivityEntry({ execution: execution(), ...base })!;
    expect(e.detail!.body).toMatch(/Commitment applied to the clone\./);
    expect(e.detail!.body).toMatch(/single use/);
    expect(e.detail!.body).toMatch(/Confirmed by Fabian Goetzens\./);
  });

  it("names what the plan did NOT file, rather than reporting it as filed", () => {
    const withHandoffs = execution({
      handoff: "Booking runs through nCino's own Submit for Approval.",
      handoffs: [{ deltaId: "d3", title: "Fee · Line of Credit", reason: "No tool files this today." }],
    });
    const e = workroomActivityEntry({ execution: withHandoffs, ...base })!;
    expect(e.detail!.body).toMatch(/1 recorded on the plan but not filed\./);
    expect(e.detail!.body).toMatch(/Submit for Approval/);
  });
});

describe("the link is the dossier's own, or there is no link", () => {
  it("references the package record with the resolved host", () => {
    const e = workroomActivityEntry({ execution: execution(), ...base })!;
    expect(e.reference?.webLink).toBe(HREF);
    expect(e.reference?.id).toBe(PACKAGE_ID);
    expect(e.reference?.label).toBe("LLC_BI__Product_Package__c");
  });

  it("leaves the link undefined where the view carried no org address", () => {
    const e = workroomActivityEntry({ execution: execution(), ...base, packageHref: null })!;
    expect(e.reference?.webLink).toBeUndefined();
    // The id survives, so a banker can still carry it across by hand (A29).
    expect(e.reference?.id).toBe(PACKAGE_ID);
  });

  it("carries no reference at all where the room had no package anchor", () => {
    const e = workroomActivityEntry({ execution: execution(), ...base, productPackageId: null, packageHref: null })!;
    expect(e.reference).toBeUndefined();
  });
});

describe("it refuses to log a filing that did not happen", () => {
  it("returns null when the plan filed nothing", () => {
    expect(workroomActivityEntry({ execution: execution({ filed: [] }), ...base, changeCount: 0 })).toBeNull();
  });

  it("returns null when the dossier counted no change, however many entries came back", () => {
    expect(workroomActivityEntry({ execution: execution(), ...base, changeCount: 0 })).toBeNull();
  });
});

describe("it dedupes against itself the way every other executed entry does", () => {
  it("keys on the record the plan created, so a re-render logs one event", () => {
    const a = workroomActivityEntry({ execution: execution(), ...base })!;
    const b = workroomActivityEntry({ execution: execution(), ...base })!;
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("exec-a4Zbb0000027NpMEAU");
  });
});

/* =============================================== the arms leave no record id

   A CARRY EXCLUSION WRITES NOTHING, so `filed` can say the clone was made and
   never say that a covenant was left off it. The room composes the sentence
   from its own manifest and the trail carries it verbatim; a plan carrying no
   arm reads exactly as it read before the arms existed. */

describe("what the org arms did reaches the trail", () => {
  it("carries the room's own arm sentence into the detail", () => {
    const e = workroomActivityEntry({
      execution: execution(),
      ...base,
      arms: "1 covenant left off the new version. Nothing is deleted: the booked facilities keep everything they hold today.",
    })!;
    expect(e.detail?.body).toContain("1 covenant left off the new version");
    expect(e.detail?.body).toContain("Nothing is deleted");
  });

  it("adds nothing where the plan carried no arm", () => {
    const withArm = workroomActivityEntry({ execution: execution(), ...base, arms: null })!;
    const without = workroomActivityEntry({ execution: execution(), ...base })!;
    expect(withArm.detail?.body).toBe(without.detail?.body);
  });
});
