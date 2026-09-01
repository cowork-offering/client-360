import { describe, expect, it } from "vitest";
import { bareMemberPick, readSteer } from "./steer";
import type { ElicitMember } from "./elicit";
import { readRouteSwitch } from "./route";

/* =============================================================================
   NAVIGATIONAL INTENT, IN ISOLATION.

   The founder's second ask, in three lines: "lets modify a new loan" must show
   the loans, "add a new loan" must open that path, and "renew instead" must
   offer the route switch that already exists. None of the three is a change to
   the package and none of them should ever be answered with the parser's
   refusal boilerplate.
   ============================================================================= */

const LOC15 = "a4Zbb0000027MaYEAU";
const CONSTRUCTION = "a4Zbb0000027Mp3EAE";
const LOC25 = "a4Zbb0000027MttEAE";

const MEMBERS: ElicitMember[] = [
  { id: LOC15, key: "Line of Credit", label: "$15.0MM Line of Credit", orgName: "Hartwell Precision Manufacturing LLC - Line of Credit - $15,000,000.00", committed: 15_000_000 },
  { id: CONSTRUCTION, key: "Construction", label: "Construction", orgName: "Hartwell Precision Manufacturing LLC - Construction - $12,000,000.00", committed: 12_000_000 },
  { id: LOC25, key: "Line of Credit", label: "$2.5MM Line of Credit", orgName: "Hartwell Precision Manufacturing LLC - Line of Credit - $2,500,000.00", committed: 2_500_000 },
];

describe("a navigational line is answered with the choice", () => {
  it("shows the facilities for \"let's modify a new loan\"", () => {
    const steer = readSteer("let's modify a new loan", MEMBERS)!;
    expect(steer.kind).toBe("pick-facility");
    expect(steer.kind === "pick-facility" && steer.options.map((o) => o.label)).toEqual([
      "$15.0MM Line of Credit",
      "Construction",
      "$2.5MM Line of Credit",
    ]);
  });

  it("shows the facilities for \"a different facility\"", () => {
    expect(readSteer("a different facility", MEMBERS)?.kind).toBe("pick-facility");
    expect(readSteer("can we work on another loan", MEMBERS)?.kind).toBe("pick-facility");
  });

  /* THE VERB SETTLES IT. "modify a new loan" contains "new loan", which the
     route reader matches as a request to STRUCTURE one. Without this the room
     restarts in the origination room over a line that asked to change a
     facility that is already booked. */
  it("does not hand \"modify a new loan\" to the route reader's new-facility answer", () => {
    expect(readRouteSwitch("let's modify a new loan", "modify")).toBe("create");
    expect(readSteer("let's modify a new loan", MEMBERS)?.kind).toBe("pick-facility");
  });

  it("opens the new-facility path for \"add a new loan\"", () => {
    expect(readSteer("add a new loan", MEMBERS)?.kind).toBe("new-facility");
    expect(readSteer("structure another facility", MEMBERS)?.kind).toBe("new-facility");
  });

  it("leaves \"renew instead\" to the route switch that already exists", () => {
    expect(readSteer("renew instead", MEMBERS)).toBeNull();
    expect(readRouteSwitch("renew instead", "modify")).toBe("renew");
  });

  /* A CREATE IS NOT NAVIGATION. The founder's own line carries "another" and
     "loans" and is a covenant create whose first question happens to be where
     it lands. */
  it("never reads a create as navigation", () => {
    expect(readSteer("add another covenant to all of the loans", MEMBERS)).toBeNull();
    expect(readSteer("pledge another asset to the equipment loan", MEMBERS)).toBeNull();
    expect(readSteer("add another guarantor to the line", MEMBERS)).toBeNull();
  });

  it("says nothing about a line that is simply an instruction", () => {
    expect(readSteer("take the line of credit to $20,000,000", MEMBERS)).toBeNull();
    expect(readSteer("what covenants are on this package", MEMBERS)).toBeNull();
  });
});

describe("the answer to the choice is a facility, and only a facility", () => {
  it("reads the org's own loan name back as one member", () => {
    expect(bareMemberPick("the Hartwell Precision Manufacturing LLC - Construction - $12,000,000.00", MEMBERS)).toBe(
      CONSTRUCTION,
    );
  });

  it("reads a dollar qualifier back as one member", () => {
    expect(bareMemberPick("the 2.5M line of credit", MEMBERS)).toBe(LOC25);
  });

  it("refuses a line carrying an instruction, which is about that member rather than a move to it", () => {
    expect(bareMemberPick("take the 2.5M line of credit to $4,000,000", MEMBERS)).toBeNull();
  });

  it("refuses a line that names more than one facility", () => {
    expect(bareMemberPick("the lines of credit", MEMBERS)).toBeNull();
  });
});
