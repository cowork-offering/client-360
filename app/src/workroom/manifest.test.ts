import { describe, expect, it } from "vitest";
import { addEntry, figuresFor, groupEntries, removeEntry, type ManifestBaseline } from "./manifest";
import { scriptFor } from "./scripts";
import type { WorkroomDelta } from "./types";

/* =============================================================================
   THE RAIL WALKS BACK EXACTLY.

   The signature moment is an arrival on the right; the discipline is that a
   removal undoes it to the digit. These prove the figures are DERIVED from what
   is in the rail rather than accumulated as the room goes, which is what makes
   remove and add symmetric with no separate undo path.
   ============================================================================= */

const MODIFY = scriptFor("modify", "package");
const BASE: ManifestBaseline = { committedMM: 46.0, members: 7, changeWord: ["change", "changes"] };

const amount = MODIFY.deltas.amount;
const covenant = MODIFY.deltas.covenant;
const facility = MODIFY.deltas.facility;
const pledge = MODIFY.deltas.pledge;

function railOf(...deltas: WorkroomDelta[]): WorkroomDelta[] {
  return deltas.reduce<WorkroomDelta[]>((rail, d) => addEntry(rail, d), []);
}

describe("the manifest rail", () => {
  it("starts empty, and says so rather than showing a zero", () => {
    const f = figuresFor([], BASE);
    expect(f.count).toBe(0);
    expect(f.countLine).toBe("Nothing staged");
    expect(f.committedLabel).toBe("$46.0MM");
    // Nothing has moved, so nothing is labelled pro forma.
    expect(f.committedNote).toBe("");
    expect(f.membersNote).toBe("");
  });

  it("walks the committed figure forward on a landing and back on a removal", () => {
    const withAmount = railOf(amount);
    expect(figuresFor(withAmount, BASE).committedLabel).toBe("$49.0MM");
    expect(figuresFor(withAmount, BASE).committedNote).toBe("pro forma · was $46.0MM");

    const withFacility = addEntry(withAmount, facility);
    expect(figuresFor(withFacility, BASE).committedLabel).toBe("$51.0MM");

    const back = removeEntry(withFacility, "facility");
    expect(figuresFor(back, BASE).committedLabel).toBe("$49.0MM");

    const empty = removeEntry(back, "amount");
    expect(figuresFor(empty, BASE).committedLabel).toBe("$46.0MM");
    expect(figuresFor(empty, BASE).committedNote).toBe("");
  });

  it("walks the member count and the new-member note back with it", () => {
    const rail = railOf(amount, facility);
    expect(figuresFor(rail, BASE).membersLabel).toBe("8");
    expect(figuresFor(rail, BASE).membersNote).toBe("+1 proposed");

    const back = removeEntry(rail, "facility");
    expect(figuresFor(back, BASE).membersLabel).toBe("7");
    expect(figuresFor(back, BASE).membersNote).toBe("");
  });

  it("counts members touched, not entries, and states them out of the package", () => {
    // Both of these land on HW1001, so the package has ONE member changed.
    const rail = railOf(amount, covenant);
    const f = figuresFor(rail, BASE);
    expect(f.membersChanged).toBe(1);
    expect(f.countLine).toBe("2 changes · 1 of 7 members");
  });

  it("names the new member in the count line once one lands", () => {
    expect(figuresFor(railOf(amount, covenant, facility, pledge), BASE).countLine).toBe(
      "4 changes · 1 of 7 members · 1 new member",
    );
  });

  it("does not invent a denominator for a package that does not exist yet", () => {
    const empty: ManifestBaseline = { committedMM: 0, members: 0, changeWord: ["record", "records"] };
    const create = scriptFor("create", "account");
    const rail = railOf(create.deltas.newPackage, create.deltas.firstFacility);
    const f = figuresFor(rail, empty);
    expect(f.countLine).toBe("2 records · 1 new member");
    expect(f.countLine).not.toContain("of 0");
    expect(f.committedLabel).toBe("$2.0MM");
  });

  it("counts every proposed covenant, not just the first", () => {
    expect(figuresFor(railOf(covenant), BASE).covenantNote).toBe("1 proposed");
    expect(figuresFor(railOf(amount), BASE).covenantNote).toBe("");
  });

  it("takes the mode's own word for what is in the rail", () => {
    const renewBase: ManifestBaseline = { ...BASE, changeWord: ["term", "terms"] };
    const renew = scriptFor("renew", "package");
    expect(figuresFor(railOf(renew.deltas.renewTerm), renewBase).countLine).toBe("1 term · 1 of 7 members");
  });

  it("refuses to land the same delta twice", () => {
    expect(addEntry(railOf(amount), amount)).toHaveLength(1);
  });

  it("groups the way a credit committee reads a change set, and drops empty groups", () => {
    const groups = groupEntries(railOf(amount, covenant, facility, pledge));
    expect(groups.map((g) => g.id)).toEqual(["structure", "terms", "covenants", "security"]);
    expect(groupEntries(railOf(amount)).map((g) => g.id)).toEqual(["terms"]);
  });
});
